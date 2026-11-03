import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { instantiateShip } from '@/rendering/ships';
import { weaponBeamOrigin, weaponFlashPose } from '@/rendering/weaponFlash';
import { buildCustomBattle } from '@/scenarios';
import { BattleSimulation, SIM_DT } from '@/simulation/battle';
import type { BattleEvent, WeaponState } from '@/simulation/types';
import { getShipClass } from '@/data/ships';
import { WEAPONS } from '@/data/weapons';

function battery(rulesId = 'canon_me3', classId = 'alliance_dreadnought', side = false) {
  const sim = new BattleSimulation(buildCustomBattle({ seed: 47, rulesId, environment: 'deep_space', startingDistanceKm: 24, maxDuration: 90,
    sideA: { faction: 'alliance', name: 'Observed battery', formation: 'line_abreast', counts: { [classId]: 1 } },
    sideB: { faction: 'reaper', name: 'Harmless target', formation: 'line_abreast', counts: { reaper_capital: 1 } } }));
  const gunship = sim.ships.find(s => s.side === 'A')!, target = sim.ships.find(s => s.side === 'B')!;
  gunship.pos = { x: 0, y: 0, z: 0 }; target.pos = side ? { x: 9.6, y: 0, z: 0 } : { x: 0, y: 0, z: 9.6 };
  for (const ship of sim.ships) {
    ship.prevPos = { ...ship.pos }; ship.turnRate = 0;
    ship.heading = ship.side === 'A' ? { x: 0, y: 0, z: 1 } : { x: 0, y: 0, z: -1 };
    ship.prevHeading = { ...ship.heading };
    ship.heatCapacity = 1_000_000; // Isolate reloads from the separate thermal limiter.
    sim.fleets.get(ship.fleetId)!.anchor = { ...ship.pos };
    sim.issueOrders(ship.fleetId, { order: 'hold_formation', focusFire: false });
    for (const weapon of ship.weapons) weapon.def = { ...weapon.def, damage: 0 };
  }
  return { sim, gunship, target };
}

const fired = (events: BattleEvent[]) => events.filter((event): event is Extract<BattleEvent, { type: 'weapon_fired' }> => event.type === 'weapon_fired');

function expectReloadIntervals(times: number[], weapon: WeaponState, activeBurst = 0) {
  expect(times.length).toBeGreaterThan(4);
  for (let i = 1; i < times.length; i++) {
    const interval = times[i] - times[i - 1];
    // One fixed-step quantization allowance; readiness starts with a partial
    // initial load, so only intervals following a real fired event are checked.
    expect(interval).toBeGreaterThanOrEqual(weapon.def.cooldown * 0.95 + activeBurst - 1e-7);
    expect(interval).toBeLessThanOrEqual(weapon.def.cooldown * 1.05 + activeBurst + SIM_DT * 2 + 1e-7);
  }
}

describe('readable physical weapon mounts and firing cadence', () => {
  it.each(['imperium_lunar', 'covenant_ccs', 'reaper_capital'])('%s beam starts at its actual emitter rather than assigning every lance a bow cannon', id => {
    const cls = getShipClass(id), built = instantiateShip(id);
    const hp = cls.hardpoints.find(h => ['thanix', 'reaper_beam'].includes(WEAPONS[h.weaponId].kind))!;
    const def = WEAPONS[hp.weaponId];
    const weapon = { def, facing: hp.facing * Math.PI / 180, offset: { x: hp.offset[0] / 1000, y: hp.offset[1] / 1000, z: hp.offset[2] / 1000 } } as WeaponState;
    built.group.position.set(5, 3, 20); built.group.rotation.y = Math.PI / 2;
    const origin = weaponBeamOrigin(built.group, built.muzzle, weapon, cls.faction === 'reaper');
    const dedicated = id !== 'imperium_lunar';
    const expected = built.group.localToWorld(dedicated ? built.muzzle!.clone() : new THREE.Vector3(...hp.offset).multiplyScalar(0.01));
    expect(origin.distanceTo(expected)).toBeLessThan(1e-8);
    if (!dedicated) expect(origin.distanceTo(built.group.localToWorld(built.muzzle!.clone()))).toBeGreaterThan(5);
  });
  it('keeps powerful broadside flashes at their actual side mounts and outward barrel headings', () => {
    const { gunship } = battery('prime_apex');
    const built = instantiateShip(gunship.classId);
    built.group.position.set(20, 7, -11); built.group.rotation.y = Math.PI / 2;
    const sideMounts = [gunship.weapons.find(w => w.facing > 1)!, gunship.weapons.find(w => w.facing < -1)!];
    for (const weapon of sideMounts) {
      const pose = weaponFlashPose(built.group, built.muzzle, { ...weapon, def: { ...weapon.def, damage: 7000 } });
      const expected = new THREE.Vector3(weapon.offset.x * 10, weapon.offset.y * 10, weapon.offset.z * 10);
      built.group.localToWorld(expected);
      expect(pose.spinal).toBe(false);
      expect(pose.position.distanceTo(expected)).toBeLessThan(1e-8);
      expect(pose.position.distanceTo(built.group.localToWorld(built.muzzle!.clone()))).toBeGreaterThan(1);
      expect(pose.direction.x).toBeCloseTo(0); expect(pose.direction.y).toBeCloseTo(0);
      expect(pose.direction.z).toBeCloseTo(weapon.facing > 0 ? -1 : 1);
    }
  });

  it('retains the dedicated forward spinal muzzle independently of damage scaling', () => {
    const { gunship } = battery('prime_apex', 'alliance_omaha');
    const built = instantiateShip(gunship.classId), weapon = gunship.weapons[0];
    built.group.position.set(10, 2, 30); built.group.rotation.set(0.2, 0.8, -0.1);
    const before = built.muzzle!.clone();
    const pose = weaponFlashPose(built.group, built.muzzle, { ...weapon, def: { ...weapon.def, damage: 1 } });
    expect(pose.spinal).toBe(true);
    expect(pose.position.distanceTo(built.group.localToWorld(before.clone()))).toBeLessThan(1e-8);
    expect(pose.direction.distanceTo(new THREE.Vector3(0, 0, 1).transformDirection(built.group.matrixWorld))).toBeLessThan(1e-8);
    expect(built.muzzle).toEqual(before);
  });

  it.each([['canon_me3', 'alliance_dreadnought'], ['prime_apex', 'alliance_dreadnought'], ['prime_apex', 'alliance_omaha']])(
    '%s / %s: an individual spinal gun observes its own reload after every real shot', (rulesId, classId) => {
      const { sim, gunship } = battery(rulesId, classId);
      for (let i = 0; i < 60 / SIM_DT; i++) sim.step();
      const primary = gunship.weapons[0];
      expectReloadIntervals(fired(sim.events).filter(e => e.shipId === gunship.id && e.weaponIndex === primary.index).map(e => e.t), primary);
      expect(fired(sim.events).filter(e => e.shipId === gunship.id).every(e => e.weaponIndex === primary.index)).toBe(true);
    },
  );

  it('independent broadside mounts can fire rapidly in aggregate without any mount bypassing its cooldown', () => {
    const { sim, gunship } = battery('prime_apex', 'alliance_dreadnought', true);
    for (let i = 0; i < 60 / SIM_DT; i++) sim.step();
    const shots = fired(sim.events).filter(e => e.shipId === gunship.id);
    const mounts = [...new Set(shots.map(e => e.weaponIndex))];
    expect(mounts).toHaveLength(4);
    for (const index of mounts) {
      const weapon = gunship.weapons[index];
      expect(weapon.def.id).toBe('alliance_broadside'); expect(weapon.facing).toBeGreaterThan(1);
      expectReloadIntervals(shots.filter(e => e.weaponIndex === index).map(e => e.t), weapon);
    }
    const aggregateGaps = shots.slice(1).map((shot, i) => shot.t - shots[i].t);
    expect(Math.min(...aggregateGaps)).toBeLessThan(gunship.weapons[mounts[0]].def.cooldown / 2);
  });

  it('a sustained Reaper beam is one firing event followed by its full burst and recharge', () => {
    const { sim, target } = battery();
    for (let i = 0; i < 60 / SIM_DT; i++) sim.step();
    const shots = fired(sim.events).filter(e => e.shipId === target.id && e.kind === 'reaper_beam');
    for (const weapon of target.weapons.filter(w => w.def.kind === 'reaper_beam')) {
      expectReloadIntervals(shots.filter(e => e.weaponIndex === weapon.index).map(e => e.t), weapon, weapon.def.beamDuration);
    }
  });
});
