import { describe, expect, it } from 'vitest';
import { getShipClass } from '@/data/ships';
import { WEAPONS } from '@/data/weapons';
import { buildCustomBattle, buildScenario } from '@/scenarios';
import { BattleSimulation, SIM_DT } from '@/simulation/battle';
import { isShipAllowedInRules } from '@/timelines/lore';
import { CANON_ME3, PRIME_APEX, getPreset } from '@/timelines/presets';
import { applyRulesToWeapon, cloneRules } from '@/timelines/rules';
import { exportRuleSet, importRuleSet } from '@/timelines/schema';

const input = (rulesId = 'strict_lore') => ({ seed: 31, rulesId, environment: 'deep_space' as const, startingDistanceKm: 24, maxDuration: 90,
  sideA: { faction: 'alliance' as const, name: 'Gun line', formation: 'line_abreast' as const, counts: { alliance_dreadnought: 1 } },
  sideB: { faction: 'reaper' as const, name: 'Target', formation: 'line_abreast' as const, counts: { reaper_capital: 1 } } });

describe('Strict Lore and declared crossover isolation', () => {
  it('uses the sourced two-second main-gun anchor without modifying balanced or APEX catalogues', () => {
    const cls = getShipClass('alliance_dreadnought'), strict = getPreset('strict_lore');
    const gun = applyRulesToWeapon(WEAPONS.alliance_dn_main, cls.faction, cls, strict, WEAPONS);
    expect(gun.id).toBe('alliance_dn_main'); expect(gun.cooldown).toBe(2);
    expect(gun.internalWarheadFraction).toBe(0);
    expect(WEAPONS.alliance_dn_main.cooldown).toBe(4);
    expect(applyRulesToWeapon(WEAPONS.alliance_dn_main, cls.faction, cls, CANON_ME3, WEAPONS).cooldown).toBe(4);
    expect(applyRulesToWeapon(WEAPONS.alliance_dn_main, cls.faction, cls, PRIME_APEX, WEAPONS).id).toBe('apex_hyper_ma');
    const reaper = getShipClass('reaper_capital');
    const beam = WEAPONS[reaper.hardpoints[0].weaponId];
    expect(applyRulesToWeapon(beam, reaper.faction, reaper, strict, WEAPONS).cooldown).toBe(beam.cooldown);
  });

  it('does not allow modified technology to leak through a Strict Lore clone', () => {
    const strict = getPreset('strict_lore'), cls = getShipClass('alliance_dreadnought');
    strict.organic.fireRate = 4; strict.factionOverrides.alliance = { massAcceleratorDamage: 9 };
    strict.special.hadesRounds = true; strict.special.hyperMassAccelerators = true;
    const gun = applyRulesToWeapon(WEAPONS.alliance_dn_main, cls.faction, cls, strict, WEAPONS);
    expect(gun.id).toBe('alliance_dn_main'); expect(gun.cooldown).toBe(2);
    expect(gun.damage).toBe(WEAPONS.alliance_dn_main.damage); expect(gun.internalWarheadFraction).toBe(0);
  });

  it('rejects AU hulls in custom, raw and pending-fleet configurations', () => {
    const strict = getPreset('strict_lore');
    for (const id of ['alliance_omaha', 'cerberus_dreadnought', 'unsc_infinity', 'imperium_lunar', 'prothean_dreadnought', 'past_cycle_cruiser', 'player_civ_cruiser', 'skynet_hunter']) {
      expect(isShipAllowedInRules(getShipClass(id), strict)).toBe(false);
    }
    expect(isShipAllowedInRules(getShipClass('alliance_dreadnought'), strict)).toBe(true);
    expect(() => buildCustomBattle({ ...input(), sideA: { ...input().sideA, counts: { alliance_omaha: 1 } } })).toThrow(/Strict Lore excludes/);
    const raw = buildCustomBattle(input());
    raw.fleets.push({ ...raw.fleets[0], id: 'late-au', arrivalTime: 30, ships: [{ classId: 'alliance_omaha', count: 1 }] });
    expect(() => new BattleSimulation(raw)).toThrow(/Strict Lore excludes/);
  });

  it('rejects explicitly alternate-history scenarios at the simulation boundary', () => {
    const cfg = buildScenario('prime_apex_sol_defence', 'strict_lore', 4);
    expect(cfg.alternateHistory).toBe(true);
    expect(() => new BattleSimulation(cfg)).toThrow(/alternate-history/);
    expect(() => new BattleSimulation(buildScenario('alliance_fleet_engagement', 'strict_lore', 4))).not.toThrow();
  });

  it('does not let an imported timeline claim the built-in Strict Lore identity', () => {
    const imported = importRuleSet(exportRuleSet(getPreset('strict_lore')));
    expect(imported.ok).toBe(true);
    expect(imported.rules?.strictLore).toBeUndefined();
    expect(imported.rules?.category).toBe('custom'); expect(imported.rules?.id).toBe('strict_lore_imported');
  });

  it('maintains a real two-second minimum reload per healthy unobstructed strict main gun', () => {
    const sim = new BattleSimulation(buildCustomBattle(input())), ship = sim.ships.find(s => s.side === 'A')!;
    for (const s of sim.ships) {
      s.heatCapacity = 1_000_000;
      sim.issueOrders(s.fleetId, { order: 'hold_formation', focusFire: false });
      for (const w of s.weapons) w.def = { ...w.def, damage: 0 };
    }
    const primary = ship.weapons.find(w => w.def.id === 'alliance_dn_main')!;
    for (let i = 0; i < 40 / SIM_DT; i++) sim.step();
    const times = sim.events.filter(e => e.type === 'weapon_fired' && e.shipId === ship.id && e.weaponIndex === primary.index).map(e => e.t);
    expect(times.length).toBeGreaterThan(15);
    for (let i = 1; i < times.length; i++) {
      expect(times[i] - times[i - 1]).toBeGreaterThanOrEqual(2 - 1e-7);
      expect(times[i] - times[i - 1]).toBeLessThanOrEqual(2 + SIM_DT * 2 + 1e-7);
    }
  });

  it('keeps APEX refits out of alien settings but supports explicit crossover tuning', () => {
    const cls = getShipClass('unsc_marathon'), base = WEAPONS[cls.hardpoints[0].weaponId];
    const gun = applyRulesToWeapon(base, cls.faction, cls, PRIME_APEX, WEAPONS);
    expect(gun.id).toBe(base.id); expect(gun.damage).toBe(base.damage); expect(gun.cooldown).toBe(base.cooldown);
    expect(gun.internalWarheadFraction).toBe(0);
    const tuned = cloneRules(PRIME_APEX); tuned.factionOverrides.unsc = { fireRate: 2, massAcceleratorDamage: 3 };
    const custom = applyRulesToWeapon(base, cls.faction, cls, tuned, WEAPONS);
    expect(custom.damage).toBe(base.damage * 3); expect(custom.cooldown).toBe(base.cooldown / 2);
  });

  it('requires an explicitly AU profile for crossover battles, including raw configs', () => {
    const mixed = { ...input('multiverse_crossover'), sideA: { faction: 'unsc' as const, name: 'UNSC', formation: 'line_abreast' as const, counts: { unsc_marathon: 1 } } };
    const cfg = buildCustomBattle(mixed);
    expect(() => new BattleSimulation(cfg)).not.toThrow();
    expect(() => buildCustomBattle({ ...mixed, rulesId: 'canon_me3' })).toThrow(/Crossover fleets require an AU/);
    cfg.rules = getPreset('canon_me3');
    expect(() => new BattleSimulation(cfg)).toThrow(/Crossover fleets require an AU/);
  });

  it.each(['prothean', 'past_cycle', 'player_civ'] as const)('keeps %s historical/generated forces outside canonical raw configurations', faction => {
    const cfg = buildCustomBattle({ ...input('past_cycles'), sideA: { faction, name: 'Alternate civilization', formation: 'line_abreast', counts: { [`${faction}_cruiser`]: 1 } } });
    expect(() => new BattleSimulation(cfg)).not.toThrow();
    cfg.rules = getPreset('canon_me3');
    expect(() => new BattleSimulation(cfg)).toThrow(/require an AU timeline/);
  });
});
