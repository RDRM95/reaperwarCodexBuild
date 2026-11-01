import { describe, expect, it } from 'vitest';
import { BattleSimulation } from '@/simulation/battle';
import { buildCustomBattle } from '@/scenarios';
import { HadesVolleyCoordinator, isHadesSpinal } from '@/simulation/volleys';

function battery(rulesId = 'prime_apex') {
  const sim = new BattleSimulation(buildCustomBattle({
    seed: 7, rulesId, environment: 'deep_space', startingDistanceKm: 30, maxDuration: 120,
    sideA: { faction: 'alliance', name: 'Battery', formation: 'line_abreast', counts: { alliance_dreadnought: 3 } },
    sideB: { faction: 'reaper', name: 'Target', formation: 'line_abreast', counts: { reaper_capital: 1 } },
  }));
  const ships = sim.ships.filter(s => s.side === 'A');
  return { sim, ships, gun: (index: number) => ships[index].weapons.find(w => w.def.kind === 'mass_accelerator' && w.def.antiCapital)! };
}

describe('coordinated HADES salvos', () => {
  function station(sim: BattleSimulation): void {
    for (const s of sim.ships) for (const w of s.weapons) w.def = { ...w.def, damage: 0 };
    sim.issueOrders('custom-a', { order: 'hold_formation' });
    sim.issueOrders('custom-b', { order: 'hold_formation' });
  }

  it('the real firing loop regroups staggered HADES mounts into sustained concentrated salvos', () => {
    const { sim, ships } = battery();
    station(sim);
    for (let i = 0; i < 600; i++) sim.step();
    const shots = sim.events.filter(e => e.type === 'weapon_fired' && e.weaponId === 'apex_hyper_ma' && e.t > 5);
    expect(shots.length).toBeGreaterThanOrEqual(12);
    const salvos = new Map<number, Set<string>>();
    for (const event of shots) {
      if (event.type !== 'weapon_fired') continue;
      // These healthy, aligned guns have all recharged before each release.
      // Every complete salvo should therefore fire on the same fixed tick.
      const members = salvos.get(event.t) ?? new Set<string>();
      members.add(event.shipId);
      salvos.set(event.t, members);
      expect(event.targetId).toBe(sim.fleets.get(ships[0].fleetId)!.focusTargetId);
    }
    expect(salvos.size).toBeGreaterThanOrEqual(4);
    for (const members of salvos.values()) expect(members.size).toBe(ships.length);
  });

  it.each([
    ['canon_me3', true], ['canon_me3', false], ['prime_apex', false],
  ] as const)('ready %s batteries fire immediately with focusFire=%s when coordination is inapplicable', (rules, focusFire) => {
    const { sim, ships, gun } = battery(rules);
    station(sim);
    sim.issueOrders('custom-a', { focusFire });
    for (let i = 0; i < ships.length; i++) {
      gun(i).cooldown = 0;
      ships[i].aiTimer = 0;
    }
    sim.step();
    const mainIds = new Set(ships.map((_, i) => gun(i).def.id));
    const shots = sim.events.filter(e => e.type === 'weapon_fired' && mainIds.has(e.weaponId));
    expect(shots.length).toBe(ships.length);
  });

  it('assembles a fleet salvo and releases ready mounts together', () => {
    const { ships, gun } = battery();
    const c = new HadesVolleyCoordinator();
    expect(c.canFire(10, ships[0].fleetId, ships[0], gun(0))).toBe(false);
    expect(c.canFire(10.4, ships[1].fleetId, ships[1], gun(1))).toBe(false);
    for (let i = 0; i < ships.length; i++) expect(c.canFire(10.6, ships[i].fleetId, ships[i], gun(i))).toBe(true);
  });

  it('uses a bounded shared clock without a straggler or dead target delaying it', () => {
    const { ships, gun } = battery();
    const c = new HadesVolleyCoordinator();
    const fleet = ships[0].fleetId;
    c.canFire(0, fleet, ships[0], gun(0));
    // No call from ship 1 (out of arc) or ship 2 (overheated) is required.
    expect(c.canFire(0.6, fleet, ships[0], gun(0))).toBe(true);
    expect(c.canFire(2, fleet, ships[0], gun(0))).toBe(false);
    const next = 0.6 + gun(0).def.cooldown * 1.05 + 0.5;
    expect(c.canFire(next, fleet, ships[0], gun(0))).toBe(true);
    expect(c.canFire(next, fleet, ships[2], gun(2))).toBe(true);
    // A long targetless interruption does not create a permanent wait.
    let released = false;
    for (let t = 100; t < 107; t += 0.05) released ||= c.canFire(t, fleet, ships[0], gun(0));
    expect(released).toBe(true);
  });

  it('leaves canon, secondary batteries, and Reaper weapons independent', () => {
    const { sim, ships, gun } = battery('canon_me3');
    const c = new HadesVolleyCoordinator();
    expect(isHadesSpinal(ships[0], gun(0))).toBe(false);
    expect(c.canFire(0, ships[0].fleetId, ships[0], gun(0))).toBe(true);
    const reaper = sim.ships.find(s => s.side === 'B')!;
    for (const w of reaper.weapons) expect(c.canFire(0, reaper.fleetId, reaper, w)).toBe(true);
    const apex = battery();
    const broadside = apex.ships[0].weapons.find(w => !w.def.antiCapital)!;
    expect(c.canFire(0, apex.ships[0].fleetId, apex.ships[0], broadside)).toBe(true);
  });
});
