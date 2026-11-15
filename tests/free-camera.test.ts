import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { CameraRig } from '@/rendering/cameras';

/**
 * The free camera can be flown with the mouse alone.
 *
 * It could only be turned with the mouse: the wheel changed a zoom distance the free camera does not use, and a
 * middle-button drag moved a focus point it does not have. Moving it took the keys, at 600 units a second wherever it
 * was (a frigate is 1.2 units long), and the sideways key was the wrong way round. Now the wheel flies it along its
 * view, a middle drag slides it, its speed follows its distance from the nearest hull, and it glides to where it is
 * sent.
 */
const V = (x: number, y: number, z: number): THREE.Vector3 => new THREE.Vector3(x, y, z);
const centre = V(0, 0, 0);
function free(): CameraRig {
  const rig = new CameraRig(16 / 9);
  rig.setMode('free');
  settle(rig);
  return rig;
}
function settle(rig: CameraRig, seconds = 3): void {
  for (let i = 0; i < seconds * 60; i++) rig.update(1 / 60, { fleetCentre: centre });
  rig.camera.updateMatrixWorld(true);
}
/** Where a point 200 units ahead of the camera's present position sits on screen after `act`. */
function shift(rig: CameraRig, act: () => void): THREE.Vector3 {
  const dir = rig.camera.getWorldDirection(V(0, 0, 0));
  const ahead = rig.camera.position.clone().addScaledVector(dir, 200);
  act();
  settle(rig);
  return ahead.project(rig.camera);
}

describe('the free camera', () => {
  it('starts where the camera was, looking the way it looked', () => {
    const rig = new CameraRig(16 / 9);
    settle(rig);
    const at = rig.camera.position.clone(), dir = rig.camera.getWorldDirection(V(0, 0, 0)).clone();
    rig.setMode('free');
    settle(rig);
    expect(rig.camera.position.distanceTo(at)).toBeLessThan(1e-6);
    expect(rig.camera.getWorldDirection(V(0, 0, 0)).angleTo(dir)).toBeLessThan(1e-3);
  });

  it('the wheel flies it along its view: forward for a turn away from you, back for a turn toward', () => {
    const rig = free();
    rig.freeReach = 100;
    const at = rig.camera.position.clone(), dir = rig.camera.getWorldDirection(V(0, 0, 0)).clone();
    rig.freeDolly(-1);
    settle(rig);
    const moved = rig.camera.position.clone().sub(at);
    expect(moved.length()).toBeCloseTo(20, 3); // a fifth of the way to the nearest hull
    expect(moved.normalize().dot(dir)).toBeGreaterThan(0.999);
    rig.freeDolly(1);
    settle(rig);
    expect(rig.camera.position.distanceTo(at)).toBeLessThan(1e-3);
  });

  it('a wheel notch is a glide, not a jump', () => {
    const rig = free();
    rig.freeReach = 100;
    const at = rig.camera.position.clone();
    rig.freeDolly(-1);
    rig.update(1 / 60, { fleetCentre: centre });
    const first = rig.camera.position.distanceTo(at);
    expect(first).toBeGreaterThan(0.5);
    expect(first).toBeLessThan(5); // of 20
  });

  it('a middle drag slides it so the scene follows the pointer', () => {
    const rigA = free();
    rigA.freeReach = 100;
    expect(shift(rigA, () => rigA.freeTruck(120, 0)).x).toBeGreaterThan(0.05); // dragged right: the scene goes right
    const rigB = free();
    rigB.freeReach = 100;
    expect(shift(rigB, () => rigB.freeTruck(0, 120)).y).toBeLessThan(-0.05); // dragged down: the scene goes down
  });

  it('D flies it to its right and A to its left: these were the wrong way round', () => {
    const rigD = free();
    const afterD = shift(rigD, () => { for (let i = 0; i < 30; i++) rigD.freeMove(0, 1, 0, 1 / 60, false); });
    expect(afterD.x).toBeLessThan(-0.05); // the camera went right, so what was ahead is now to the left
    const rigA = free();
    const afterA = shift(rigA, () => { for (let i = 0; i < 30; i++) rigA.freeMove(0, -1, 0, 1 / 60, false); });
    expect(afterA.x).toBeGreaterThan(0.05);
  });

  it('its speed follows its distance from the nearest hull, within limits, and Shift is four times that', () => {
    const rig = free();
    rig.freeReach = 5;
    expect(rig.freeSpeed(false)).toBe(12); // never slower than this
    rig.freeReach = 100;
    expect(rig.freeSpeed(false)).toBeCloseTo(120, 6);
    expect(rig.freeSpeed(true)).toBeCloseTo(480, 6);
    rig.freeReach = 1e6;
    expect(rig.freeSpeed(false)).toBe(2500);
  });

  it('it looks any way the mouse turns it, and flies the way it looks', () => {
    const rig = free();
    rig.freeReach = 100;
    rig.orbit(-400, 300); // turn and tilt
    settle(rig);
    const at = rig.camera.position.clone(), dir = rig.camera.getWorldDirection(V(0, 0, 0)).clone();
    for (let i = 0; i < 60; i++) rig.freeMove(1, 0, 0, 1 / 60, false);
    settle(rig);
    const moved = rig.camera.position.clone().sub(at);
    expect(moved.length()).toBeCloseTo(120, 1);
    expect(moved.normalize().dot(dir)).toBeGreaterThan(0.999);
  });
});
