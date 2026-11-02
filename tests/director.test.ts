import { describe, expect, it } from 'vitest';
import { cinematicPair, cinematicWing } from '@/rendering/director';
import { Rng } from '@/core/rng';
import { BattleSimulation } from '@/simulation/battle';
import { buildCustomBattle, buildScenario } from '@/scenarios';
import { CameraRig } from '@/rendering/cameras';
import * as THREE from 'three';

describe('watchable camera subjects and framing', () => {
  it('selects living opposing non-fighter subjects without changing the battle RNG', () => {
    const sim = new BattleSimulation(buildScenario('alliance_fleet_engagement', 'prime_apex', 42));
    const before = sim.rng.getState(), rng = new Rng(42);
    for (let i = 0; i < 30; i++) {
      const pair = cinematicPair(sim.ships, rng)!;
      const from = sim.getShip(pair.fromId)!, to = sim.getShip(pair.toId!)!;
      expect(from.alive && to.alive).toBe(true);
      expect(from.side).not.toBe(to.side);
      expect(from.role).not.toBe('fighter'); expect(to.role).not.toBe('fighter');
    }
    expect(sim.rng.getState()).toBe(before);
    expect(cinematicPair([], rng)).toBeUndefined();
  });

  it('keeps both sides of a duel inside the cinematic frame, including stacked formations', () => {
    for (const target of [new THREE.Vector3(0, 0, 180), new THREE.Vector3(0, 160, 0)]) {
      const rig = new CameraRig(16 / 9); rig.setMode('cinematic');
      const from = { position: new THREE.Vector3(), velocity: new THREE.Vector3(), heading: new THREE.Vector3(0, 0, 1), size: 10 };
      const to = { ...from, position: target, size: 20 };
      for (let i = 0; i < 180; i++) rig.update(1 / 60, { cinematic: { from, to, age: i / 60 }, fleetCentre: new THREE.Vector3() });
      rig.camera.updateMatrixWorld();
      for (const subject of [from, to]) {
        const screen = subject.position.clone().project(rig.camera);
        expect(Math.abs(screen.x)).toBeLessThan(0.95); expect(Math.abs(screen.y)).toBeLessThan(0.95);
        expect(screen.z).toBeLessThan(1);
      }
    }
  });

  it('chooses a bounded local wing of living fleetmates without mutating the simulation', () => {
    const sim = new BattleSimulation(buildCustomBattle({ seed: 42, rulesId: 'prime_apex', environment: 'deep_space', startingDistanceKm: 80,
      sideA: { faction: 'alliance', name: 'Wings', formation: 'line_abreast', counts: { alliance_dreadnought: 16, alliance_cruiser: 32 } },
      sideB: { faction: 'reaper', name: 'Front', formation: 'strike_wedge', counts: { reaper_capital: 16 } } }));
    const leader = sim.ships[0], dead = sim.ships[1], escaped = sim.ships[2];
    dead.alive = false; escaped.escaped = true;
    const before = JSON.stringify(sim.ships), rng = sim.rng.getState();
    const wing = cinematicWing(sim.ships, leader.id);
    expect(wing).toHaveLength(12);
    expect(wing).toContain(leader.id);
    expect(wing).not.toContain(dead.id); expect(wing).not.toContain(escaped.id);
    for (const id of wing) expect(sim.getShip(id)?.fleetId).toBe(leader.fleetId);
    expect(cinematicWing(sim.ships, leader.id)).toEqual(wing);
    expect(cinematicWing(sim.ships, dead.id)).toEqual([]);
    expect(JSON.stringify(sim.ships)).toBe(before); expect(sim.rng.getState()).toBe(rng);
  });

  it('keeps a full moving battlegroup in frame at wide and narrow viewport aspects', () => {
    for (const aspect of [16 / 9, 3 / 4]) {
      const rig = new CameraRig(aspect); rig.setMode('cinematic');
      const from = { position: new THREE.Vector3(), velocity: new THREE.Vector3(), heading: new THREE.Vector3(0, 0, 1), size: 10 };
      const centre = new THREE.Vector3(100, 20, 40);
      const points = [new THREE.Vector3(-80, 0, 0), new THREE.Vector3(80, 0, 0), new THREE.Vector3(0, 30, 20), new THREE.Vector3(0, -30, -40)];
      for (let i = 0; i < 300; i++) {
        centre.z += 0.2;
        rig.update(1 / 60, { cinematic: { from, age: i / 60, group: { centre, radius: 90, heading: from.heading } }, fleetCentre: centre });
      }
      rig.camera.updateMatrixWorld();
      for (const point of points) {
        const screen = point.clone().add(centre).project(rig.camera);
        expect(Math.abs(screen.x)).toBeLessThan(0.9); expect(Math.abs(screen.y)).toBeLessThan(0.9);
        expect(screen.z).toBeGreaterThan(-1); expect(screen.z).toBeLessThan(1);
      }
    }
  });
});
