import { describe, expect, it } from 'vitest';
import { Rng } from '@/core/rng';
import { SHIP_CLASSES } from '@/data/ships';
import { buildCustomBattle } from '@/scenarios';
import { BattleSimulation } from '@/simulation/battle';
import type { BattleResult, Side, SideSummary } from '@/simulation/types';
import { getPreset } from '@/timelines/presets';
import {
  advanceCivilization, applyCivilizationBattleResult, beginCivilizationBattle,
  buildCivilizationShips, cancelCivilizationBattle, civilizationFleet,
  civilizationFleetPoints, createCivilization, enactPolicy,
  normalizeCivilizationState, researchCivilization,
} from '@/civilization/engine';

function resultFixture(configId: string, lossesByClass: SideSummary['lossesByClass'] = {}, outcome: BattleResult['outcome'] = 'draw'): BattleResult {
  const summary = (side: Side, losses: SideSummary['lossesByClass']): SideSummary => {
    const rows = Object.values(losses), deployed = rows.reduce((n, r) => n + r.deployed, 0), destroyed = rows.reduce((n, r) => n + r.lost, 0);
    return { side, factions: side === 'A' ? ['player_civ'] : ['reaper'], deployed, destroyed, survivors: deployed - destroyed,
      capitalDeployed: 0, capitalLost: 0, reaperCapitalLost: 0, reaperDestroyersLost: 0,
      damageDealt: 0, damageTaken: 0, shotsFired: 0, hits: 0, pointsDeployed: 0, pointsLost: 0,
      survivalPercent: deployed ? (deployed - destroyed) / deployed * 100 : 0, tacticalEffectiveness: 0, lossesByClass: losses };
  };
  return { configId, scenarioId: 'civilization', rulesId: 'multiverse_crossover', rulesName: 'Crossover test', seed: 7,
    duration: 60, winner: outcome === 'draw' ? 'draw' : outcome === 'victory' ? 'A' : 'B', reason: 'Fixture for persistent consequences',
    perspectiveSide: 'A', outcome, sides: { A: summary('A', lossesByClass), B: summary('B', {}) }, eventCount: 1, objectiveCompleted: outcome === 'victory' };
}

describe('bounded player civilizations and generated past cycles', () => {
  it('creates reproducible named fleets using a separate seed and real catalogue point budgets', () => {
    const battleRng = new Rng(51), before = battleRng.getState();
    const a = createCivilization({ seed: 91, origin: 'past_cycle', doctrine: 'energy', startingBudget: 4200 });
    const b = createCivilization({ seed: 91, origin: 'past_cycle', doctrine: 'energy', startingBudget: 4200 });
    expect(a).toEqual(b); expect(a.faction).toBe('past_cycle'); expect(a.name).toMatch(/\S+ \S+/);
    expect(civilizationFleetPoints(a)).toBeLessThanOrEqual(4200);
    expect(civilizationFleetPoints(a)).toBeGreaterThan(3000);
    expect(Object.values(a.fleetCounts).every(Number.isInteger)).toBe(true);
    expect(createCivilization({ seed: 92, origin: 'past_cycle' }).name).not.toBe(a.name);
    expect(battleRng.getState()).toBe(before);
  });

  it('political economies change actual resources, legitimacy and the fleet quality resolver', () => {
    const peaceful = createCivilization({ seed: 12 }), militarized = createCivilization({ seed: 12 });
    expect(enactPolicy(peaceful, 'cooperative').ok).toBe(true);
    expect(enactPolicy(militarized, 'mobilized').ok).toBe(true);
    const a = civilizationFleet(peaceful), b = civilizationFleet(militarized);
    expect(a.techOverride.crewQuality).toBeGreaterThan(b.techOverride.crewQuality!);
    const beforeA = peaceful.industry, beforeB = militarized.industry;
    expect(advanceCivilization(peaceful).ok).toBe(true); expect(advanceCivilization(militarized).ok).toBe(true);
    expect(militarized.industry - beforeB).toBeGreaterThan(peaceful.industry - beforeA);
    expect(peaceful.research).toBeGreaterThan(militarized.research);
    expect(peaceful.legitimacy).toBeGreaterThan(militarized.legitimacy);
    expect(enactPolicy(militarized, 'mobilized').ok).toBe(false);
  });

  it('seeded council decisions have affordable, persistent consequences and cannot be repeatedly farmed', () => {
    const a = createCivilization({ seed: 50 }), b = createCivilization({ seed: 50 });
    for (let i = 0; i < 3; i++) { advanceCivilization(a); advanceCivilization(b); }
    expect(a.decisionPending).toEqual(b.decisionPending); expect(a.decisionPending?.choices).toHaveLength(3);
    expect(advanceCivilization(a).ok).toBe(false);
    const choice = a.decisionPending!.choices[0];
    const before = JSON.stringify(a);
    expect(enactPolicy(a, choice.id).ok).toBe(true); expect(JSON.stringify(a)).not.toBe(before);
    expect(a.decisionPending).toBeUndefined();
    const resolved = JSON.stringify(a);
    expect(enactPolicy(a, choice.id).ok).toBe(false); expect(JSON.stringify(a)).toBe(resolved);
    expect(advanceCivilization(a).ok).toBe(true);
  });

  it('can resolve a political impasse even after spending every resource', () => {
    const state = createCivilization({ seed: 25 });
    for (let i = 0; i < 3; i++) advanceCivilization(state);
    state.industry = state.research = state.influence = 0;
    const legitimacy = state.legitimacy, stability = state.stability;
    expect(enactPolicy(state, 'defer_decision').ok).toBe(true);
    expect(state.decisionPending).toBeUndefined(); expect(state.legitimacy).toBe(legitimacy - 4); expect(state.stability).toBe(stability - 2);
    expect(advanceCivilization(state).ok).toBe(true); expect(state.industry).toBeGreaterThan(0);
  });

  it('ship construction spends real resources and cannot buy foreign or fractional/unbounded hulls', () => {
    const state = createCivilization({ seed: 3 });
    const id = 'player_civ_cruiser', price = SHIP_CLASSES[id].pointValue;
    const before = state.fleetCounts[id], funds = state.industry;
    expect(buildCivilizationShips(state, id, 1).ok).toBe(true);
    expect(state.fleetCounts[id]).toBe(before + 1); expect(state.industry).toBe(funds - price);
    const saved = JSON.stringify(state);
    for (const [hull, amount] of [['reaper_capital', 1], [id, 0], [id, -1], [id, 0.5], [id, 1000]] as const) {
      expect(buildCivilizationShips(state, hull, amount).ok).toBe(false);
      expect(JSON.stringify(state)).toBe(saved);
    }
    state.industry = 0; expect(buildCivilizationShips(state, id, 1).ok).toBe(false);
  });

  it('research improves a deployable fleet and consumes all three strategic resources', () => {
    const state = createCivilization({ seed: 4 });
    state.research = 2000; state.industry = 1000; state.influence = 100;
    const before = civilizationFleet(state), old = { research: state.research, industry: state.industry, influence: state.influence };
    expect(researchCivilization(state).ok).toBe(true);
    const after = civilizationFleet(state);
    expect(after.techOverride.massAcceleratorDamage).toBeGreaterThan(before.techOverride.massAcceleratorDamage!);
    expect(after.techOverride.hullIntegrity).toBeGreaterThan(before.techOverride.hullIntegrity!);
    expect(state.research).toBeLessThan(old.research); expect(state.industry).toBe(old.industry - 100);
    expect(state.influence).toBe(old.influence - 8);
    state.technologyLevel = 6; expect(researchCivilization(state).ok).toBe(false);
  });

  it('origins and doctrine have distinct declared mechanics, without inventing combat speed for FTL', () => {
    const normal = civilizationFleet(createCivilization({ seed: 6, origin: 'modern' }));
    const noRelay = civilizationFleet(createCivilization({ seed: 6, origin: 'relay_free' }));
    const hfy = civilizationFleet(createCivilization({ seed: 6, origin: 'hfy' }));
    const armoured = civilizationFleet(createCivilization({ seed: 6, doctrine: 'armour' }));
    expect(noRelay.techOverride.speed).toBe(normal.techOverride.speed);
    expect(hfy.techOverride.massAcceleratorDamage).toBeGreaterThan(normal.techOverride.massAcceleratorDamage! * 3);
    expect(hfy.techOverride.hullIntegrity).toBeGreaterThan(normal.techOverride.hullIntegrity! * 2);
    expect(armoured.techOverride.armourStrength).toBeGreaterThan(normal.techOverride.armourStrength!);
    expect(armoured.techOverride.speed).toBeLessThan(normal.techOverride.speed!);
    const relay = createCivilization({ seed: 6, origin: 'relay_free' }), ordinary = createCivilization({ seed: 6 });
    const relayIndustry = relay.industry, ordinaryIndustry = ordinary.industry;
    advanceCivilization(relay); advanceCivilization(ordinary);
    expect(relay.industry - relayIndustry).toBeLessThan(ordinary.industry - ordinaryIndustry);
    expect(relay.research).toBeGreaterThan(ordinary.research);
  });

  it('government and ethics choices trade production, influence, research and cohesion', () => {
    const council = createCivilization({ seed: 20, government: 'council' });
    const directorate = createCivilization({ seed: 20, government: 'directorate' });
    const collective = createCivilization({ seed: 20, government: 'collective' });
    const machine = createCivilization({ seed: 20, ethics: 'machine' });
    for (const state of [council, directorate, collective, machine]) advanceCivilization(state);
    expect(directorate.industry).toBeGreaterThan(council.industry);
    expect(council.influence).toBeGreaterThan(directorate.influence);
    expect(collective.stability).toBeGreaterThan(council.stability);
    expect(machine.research).toBeGreaterThan(council.research);
  });

  it('locks pending launches, records only real survivors, and cannot reapply or resurrect losses', () => {
    const state = createCivilization({ seed: 7 });
    const started = beginCivilizationBattle(state); expect(started.ok).toBe(true);
    const battle = started.battle!;
    expect(advanceCivilization(state).ok).toBe(false); expect(enactPolicy(state, 'mobilized').ok).toBe(false);
    expect(buildCivilizationShips(state, 'player_civ_cruiser', 1).ok).toBe(false); expect(researchCivilization(state).ok).toBe(false);
    expect(beginCivilizationBattle(state).ok).toBe(false);
    const result = resultFixture(battle.id, {}, 'defeat');
    const cruiserCount = battle.counts.player_civ_cruiser;
    expect(applyCivilizationBattleResult(state, result, { player_civ_cruiser: cruiserCount - 1, player_civ_dreadnought: 999 }).ok).toBe(true);
    expect(state.fleetCounts.player_civ_cruiser).toBe(cruiserCount - 1);
    expect(state.fleetCounts.player_civ_dreadnought).toBe(battle.counts.player_civ_dreadnought);
    expect(state.pendingBattle).toBeUndefined(); expect(state.legitimacy).toBeLessThan(76);
    const done = JSON.stringify(state);
    expect(applyCivilizationBattleResult(state, result, battle.counts).ok).toBe(false); expect(JSON.stringify(state)).toBe(done);
  });

  it('cancelling a launch leaves inventory intact; restored pending launches retain seed/technology', () => {
    const state = createCivilization({ seed: 13, origin: 'past_cycle', doctrine: 'energy' });
    const inventory = { ...state.fleetCounts }, launch = beginCivilizationBattle(state).battle!;
    const restored = normalizeCivilizationState(JSON.parse(JSON.stringify(state)))!;
    expect(restored.pendingBattle).toEqual(launch);
    expect(cancelCivilizationBattle(restored, 'wrong').ok).toBe(false);
    expect(cancelCivilizationBattle(restored, launch.id).ok).toBe(true);
    expect(restored.fleetCounts).toEqual(inventory);
    const next = beginCivilizationBattle(restored).battle!;
    expect(next.id).not.toBe(launch.id); expect(next.seed).not.toBe(launch.seed);
  });

  it('never resurrects lost owner ships from allied survivors of the same catalogue class', () => {
    const state = createCivilization({ seed: 15 }), launch = beginCivilizationBattle(state).battle!;
    const result = resultFixture(launch.id, {
      player_civ_cruiser: { deployed: 100, lost: 20, name: 'Charter cruiser' }, player_civ_dreadnought: { deployed: 10, lost: 1, name: 'Charter dreadnought' },
    });
    expect(applyCivilizationBattleResult(state, result, {}).ok).toBe(true);
    expect(state.fleetCounts).toEqual({ player_civ_cruiser: 0, player_civ_dreadnought: 0 });
  });

  it('sanitizes imported data and rebuilds choices rather than trusting injected effects', () => {
    expect(normalizeCivilizationState(null)).toBeUndefined(); expect(normalizeCivilizationState({ version: 99 })).toBeUndefined();
    const state = normalizeCivilizationState({ version: 1, seed: Infinity, name: '\u0000  Example  ', origin: 'past_cycle', ethics: 'not-valid',
      industry: -1, influence: 99999, stability: NaN, cooperation: 9999, technologyLevel: 999,
      fleetCounts: { past_cycle_cruiser: 999999, past_cycle_dreadnought: -4, reaper_capital: 10000 },
      decisionPending: { kind: 'contact', id: 1, choices: [{ id: 'run-code', effects: { industry: 1e100 } }] }, events: [{ turn: -2, text: 'Entry' }],
    })!;
    expect(state.name).toBe('Example'); expect(state.ethics).toBe('cooperative'); expect(state.industry).toBe(0);
    expect(state.influence).toBe(200); expect(state.cooperation).toBe(1); expect(state.technologyLevel).toBe(6);
    expect(state.fleetCounts).toEqual({ past_cycle_cruiser: 256, past_cycle_dreadnought: 0 });
    expect(state.decisionPending!.choices.every(c => c.id !== 'run-code')).toBe(true);
    expect(enactPolicy(state, 'run-code').ok).toBe(false);
    expect(Number.isFinite(civilizationFleet(state).techOverride.crewQuality)).toBe(true);
  });

  it('deploys its generated stock into the real simulator with per-fleet technology and persistent casualties', () => {
    const state = createCivilization({ seed: 18, origin: 'past_cycle', doctrine: 'energy', startingBudget: 1200 });
    const launch = beginCivilizationBattle(state).battle!;
    const rules = getPreset('multiverse_crossover');
    const cfg = buildCustomBattle({ seed: launch.seed, rulesId: rules.id, environment: 'deep_space', startingDistanceKm: 45, maxDuration: 60,
      sideA: launch.fleet, sideB: { faction: 'reaper', name: 'Harvester', formation: 'strike_wedge', counts: { reaper_capital: 1 } },
    }, rules);
    expect(cfg.fleets[0].techOverride).toEqual(launch.fleet.techOverride);
    cfg.id = launch.id;
    const sim = new BattleSimulation(cfg);
    const before = sim.ships.filter(s => s.fleetId === 'custom-a');
    expect(before.map(s => s.classId).sort()).toEqual(Object.entries(launch.counts).flatMap(([id, n]) => Array(n).fill(id)).sort());
    expect(before[0].faction).toBe('past_cycle');
    expect(before[0].maxBarriers).toBeCloseTo(SHIP_CLASSES[before[0].classId].barriers.value * launch.fleet.techOverride.kineticBarrierStrength!);
    const result = sim.run(), survivors: Record<string, number> = {};
    for (const ship of sim.ships) if (ship.fleetId === 'custom-a' && ship.alive) survivors[ship.classId] = (survivors[ship.classId] ?? 0) + 1;
    expect(applyCivilizationBattleResult(state, result, survivors).ok).toBe(true);
    for (const [id, count] of Object.entries(state.fleetCounts)) expect(count).toBe(survivors[id] ?? 0);
    expect(state.lastAppliedBattle).toBe(cfg.id);
  });
});
