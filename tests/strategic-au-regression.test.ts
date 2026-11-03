import { describe, expect, it } from 'vitest';
import { buildEngagement, createCampaign, fleetPoints, resolvePhase } from '@/campaign/engine';
import type { CampaignFleet } from '@/campaign/state';
import { researchTech } from '@/campaign/depth';
import { createCivilization, civilizationFleet } from '@/civilization/engine';
import { v3 } from '@/core/vec3';
import { getShipClass } from '@/data/ships';
import { BattleSimulation } from '@/simulation/battle';
import type { BattleConfig } from '@/simulation/types';
import { getPreset } from '@/timelines/presets';
import { applyRulesToShip, CANON_TECH, techFor, type RuleSet } from '@/timelines/rules';

/** Exercise preservation through the real engagement phase. A player liaison
 * remains in-system so the test pauses before expensive battle resolution. */
function preservation(rules: RuleSet, reapers: number, counts = { alliance_dreadnought: 10 } as Record<string, number>, faction: CampaignFleet['faction'] = 'alliance') {
  const state = createCampaign({ seed: 83, rules, worldState: {} });
  const base: CampaignFleet = { id: 'ai', name: 'Test battlegroup', faction, allegiance: 'allied', location: 'sol', counts, readiness: 1, playerControlled: false, posture: 'defend' };
  state.fleets = [base,
    { ...base, id: 'liaison', faction: 'turian', name: 'Player liaison', counts: { turian_frigate: 1 }, playerControlled: true },
    { ...base, id: 'enemy', faction: 'reaper', allegiance: 'reaper', counts: { reaper_capital: reapers } },
  ];
  state.systems.sol.defence = 0;
  const result = resolvePhase(state, { interactive: true });
  expect(result.pending?.system).toBe('sol');
  expect(result.autoResolved).toHaveLength(0);
  expect(state.fleets.find(f => f.id === 'enemy')?.location).toBe('sol');
  return { state, fleet: base };
}

describe('AU technology stays meaningful in campaign orders and battle expansion', () => {
  it('preserves the old canon and APEX withdrawal boundary when faction combat modifiers match the organic baseline', () => {
    for (const id of ['canon_me3', 'prime_apex']) {
      const rules = getPreset(id), t = rules.organic;
      const points = fleetPoints({ alliance_dreadnought: 10, turian_frigate: 1 });
      const oldFactor = t.massAcceleratorDamage * t.kineticBarrierStrength * t.armourStrength * (rules.special.hyperMassAccelerators ? 2 : 1) * (rules.special.hadesRounds ? 1.5 : 1);
      const threshold = points * oldFactor * 2.2 * (0.8 + 0.4 * rules.strategic.alliedCoordination);
      const safeCapitals = Math.floor(threshold / getShipClass('reaper_capital').pointValue);
      expect(safeCapitals).toBeGreaterThan(0);
      expect(preservation(rules, safeCapitals).fleet.location).toBe('sol');
      expect(preservation(rules, safeCapitals + 1).fleet.location).not.toBe('sol');
    }
  });

  it('prepared human faction technology prevents a hopeless classification that applies to the same canon hulls', () => {
    expect(preservation(getPreset('canon_me3'), 4).fleet.location).not.toBe('sol');
    expect(preservation(getPreset('beacon_1800'), 4).fleet.location).toBe('sol');
  });

  it('weights technology by deployed hull value instead of granting one advanced hull a whole fleet bonus', () => {
    const rules = getPreset('canon_me3');
    rules.category = 'custom';
    rules.factionOverrides.alliance = { massAcceleratorDamage: 4, kineticBarrierStrength: 4, armourStrength: 4 };
    expect(preservation(rules, 30).fleet.location).toBe('sol');
    const state = createCampaign({ seed: 83, rules, worldState: {} });
    const { state: template } = preservation(rules, 30);
    state.fleets = template.fleets;
    const advanced = state.fleets.find(f => f.id === 'ai')!;
    advanced.counts = { alliance_dreadnought: 1 };
    state.fleets.push({ ...advanced, id: 'ordinary', faction: 'turian', counts: { turian_dreadnought: 9 } });
    state.systems.sol.defence = 0;
    const result = resolvePhase(state, { interactive: true });
    expect(result.autoResolved).toHaveLength(0);
    expect(result.pending?.system).toBe('sol');
    expect(advanced.location).not.toBe('sol');
    expect(state.fleets.find(f => f.id === 'ordinary')?.location).not.toBe('sol');
  });

  it('research multiplies each faction baseline rather than replacing its AU armour and weapon advantages', () => {
    const state = createCampaign({ seed: 5, rules: getPreset('beacon_1800'), worldState: {} });
    state.research.completed = ['barrier_overcharge', 'thanix_refit'];
    const alliance = state.fleets.find(f => f.name === 'Alliance Fifth Fleet')!;
    const turian = state.fleets.find(f => f.faction === 'turian')!;
    const reaper = state.fleets.find(f => f.faction === 'reaper')!;
    const config = buildEngagement(state, { system: 'sol', alliedFleetIds: [alliance.id, turian.id], reaperFleetIds: [reaper.id], playerInvolved: true });
    const humanTech = techFor(state.rules, 'alliance');
    expect(config.fleets.find(f => f.id === alliance.id)?.techOverride?.kineticBarrierStrength).toBeCloseTo(humanTech.kineticBarrierStrength * 1.15);
    expect(config.fleets.find(f => f.id === alliance.id)?.techOverride?.massAcceleratorDamage).toBeCloseTo(humanTech.massAcceleratorDamage * 1.1);
    expect(config.fleets.find(f => f.id === turian.id)?.techOverride?.kineticBarrierStrength).toBeCloseTo(1.15);
    // The original no-faction API remains compatible for existing consumers.
    expect(researchTech(state)?.kineticBarrierStrength).toBeCloseTo(state.rules.organic.kineticBarrierStrength * 1.15);
    const sim = new BattleSimulation(config);
    const human = sim.ships.find(s => s.fleetId === alliance.id)!;
    const cls = getShipClass(human.classId);
    expect(human.maxBarriers).toBeCloseTo(applyRulesToShip(cls, state.rules).barriers * 1.15);
  });

  it('uses the player civilization charter as a neutral base with real per-fleet technology in battle', () => {
    const rules = getPreset('player_civilization');
    expect(rules.campaignCompatible).toBe(false);
    expect(techFor(rules, 'player_civ')).toEqual(CANON_TECH);
    const civ = createCivilization({ seed: 42, origin: 'early_beacon', doctrine: 'armour' });
    const fleet = civilizationFleet(civ);
    const cls = getShipClass('player_civ_cruiser');
    const config: BattleConfig = {
      id: 'civ-charter-regression', name: 'Charter regression', scenarioId: 'custom', seed: 42,
      rules, environment: 'deep_space', maxDuration: 60, perspectiveSide: 'A', objective: 'Verify persistent technology.',
      fleets: [{ id: 'civ', name: fleet.name, faction: fleet.faction, side: 'A' as const, ships: [{ classId: cls.id, count: 1 }], formation: fleet.formation, position: v3(0, 0, -30), heading: v3(0, 0, 1), techOverride: fleet.techOverride },
        { id: 'r', name: 'Reapers', faction: 'reaper' as const, side: 'B' as const, ships: [{ classId: 'reaper_capital', count: 1 }], formation: 'line_abreast' as const, position: v3(0, 0, 30), heading: v3(0, 0, -1) }],
    };
    const sim = new BattleSimulation(config);
    const ship = sim.ships.find(s => s.fleetId === 'civ')!;
    expect(ship.maxBarriers).toBeCloseTo(cls.barriers.value * fleet.techOverride.kineticBarrierStrength!);
    expect(ship.maxArmour).toBeCloseTo(cls.armour.value * fleet.techOverride.armourStrength!);
    expect(sim.ships.find(s => s.fleetId === 'r')?.maxHull).toBe(getShipClass('reaper_capital').hull.value);
  });

  it('readiness reduces each faction crew baseline without replacing its AU training advantage', () => {
    const state = createCampaign({ seed: 5, rules: getPreset('beacon_1800'), worldState: {} });
    const fleet = state.fleets.find(f => f.name === 'Alliance Fifth Fleet')!;
    const enemy = state.fleets.find(f => f.faction === 'reaper')!;
    fleet.readiness = 0.5;
    const pending = { system: 'sol' as const, alliedFleetIds: [fleet.id], reaperFleetIds: [enemy.id], playerInvolved: true };
    const expected = techFor(state.rules, fleet.faction).crewQuality * (0.7 + 0.3 * fleet.readiness);
    expect(expected).toBeGreaterThan(0.7 + 0.3 * fleet.readiness);
    expect(buildEngagement(state, pending).fleets.find(f => f.id === fleet.id)?.techOverride?.crewQuality).toBeCloseTo(expected);
    // Full readiness leaves the faction baseline to the normal rules path.
    fleet.readiness = 1;
    expect(buildEngagement(state, pending).fleets.find(f => f.id === fleet.id)?.techOverride).toBeUndefined();
    state.rules = getPreset('canon_me3');
    fleet.readiness = 0.5;
    expect(buildEngagement(state, pending).fleets.find(f => f.id === fleet.id)?.techOverride?.crewQuality).toBeCloseTo(0.85);
  });
});
