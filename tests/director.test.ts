import { describe, expect, it } from 'vitest';
import { cinematicPair } from '@/rendering/director';
import { Rng } from '@/core/rng';
import { BattleSimulation } from '@/simulation/battle';
import { buildScenario } from '@/scenarios';
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
});
