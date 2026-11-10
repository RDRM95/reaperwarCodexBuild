import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { CameraRig, cinematicOrbitLengths, followLengths, type CameraSubject } from '@/rendering/cameras';

/**
 * Camera framing of capital-scale hulls. Measured before: the Reaper view sat at (0, 10, −3) over a 20-unit hull
 * looking at the horizon and showed none of the hull; a Reaper side-on in the follow view spanned 25 % of the
 * frame's width, and 16 % in a solo cinematic orbit.
 */
const V = (x: number, y: number, z: number): THREE.Vector3 => new THREE.Vector3(x, y, z);
const subject = (size: number, heading = V(0, 0, 1)): CameraSubject => ({ position: V(0, 0, 0), velocity: V(0, 0, 0), heading, size });
function settle(rig: CameraRig, opts: Partial<Parameters<CameraRig['update']>[1]>): void {
  for (let i = 0; i < 400; i++) rig.update(0.1, { fleetCentre: V(0, 0, 0), ...opts });
  rig.camera.updateMatrixWorld(true);
}
function inFrame(rig: CameraRig, p: THREE.Vector3): boolean {
  const view = p.clone().applyMatrix4(rig.camera.matrixWorldInverse);
  const q = p.clone().project(rig.camera);
  return view.z < 0 && Math.abs(q.x) <= 1 && Math.abs(q.y) <= 1;
}
/** Share of the frame's width that a hull of `size` spans (bow, stern and beam points). */
function widthShare(rig: CameraRig, size: number): number {
  let lo = Infinity, hi = -Infinity;
  for (const p of [V(0, 0, -size / 2), V(0, 0, size / 2), V(size * 0.18, 0, size / 4), V(-size * 0.18, 0, size / 4)]) {
    const q = p.clone().project(rig.camera);
    lo = Math.min(lo, q.x); hi = Math.max(hi, q.x);
  }
  return (hi - lo) / 2;
}

describe('camera presence for capital-scale hulls', () => {
  it('the Reaper view looks over the carapace: hood and limb tips are in the picture', () => {
    const rig = new CameraRig(16 / 9);
    rig.setMode('reaper');
    settle(rig, { subject: subject(20) });
    // Reference points of a 20-unit Sovereign-class hull heading +z (hood top and front, the forward limb tips).
    for (const p of [V(0, 2.2, 1.5), V(0, 0.3, 3.2), V(3, -1.6, 9.6), V(-3, -1.6, 9.6)]) expect(inFrame(rig, p)).toBe(true);
    // The camera rides low over the aft blade, not half a hull length above it, and looks ahead.
    expect(rig.camera.position.y).toBeLessThan(20 * 0.25);
    expect(rig.camera.position.z).toBeLessThan(-20 * 0.3);
    expect(rig.camera.getWorldDirection(V(0, 0, 0)).z).toBeGreaterThan(0.9);
  });

  it('holds for any heading, including straight up', () => {
    for (const heading of [V(1, 0, 0), V(0, 0, -1), V(0.6, 0.3, 0.74).normalize(), V(0, 1, 0)]) {
      const rig = new CameraRig(16 / 9);
      rig.setMode('reaper');
      settle(rig, { subject: subject(20, heading) });
      const ahead = heading.clone().multiplyScalar(20 * 0.45);
      expect(Number.isFinite(rig.camera.position.x + rig.camera.position.y + rig.camera.position.z)).toBe(true);
      expect(ahead.clone().applyMatrix4(rig.camera.matrixWorldInverse).z).toBeLessThan(0);
    }
  });

  it('a followed Reaper fills the frame; small hulls keep their framing', () => {
    const rig = new CameraRig(16 / 9);
    rig.setMode('follow');
    rig.yaw = Math.PI / 2; rig.pitch = 0;
    settle(rig, { subject: subject(20) });
    expect(widthShare(rig, 20)).toBeGreaterThan(0.4);
    expect(widthShare(rig, 20)).toBeLessThan(0.7);
    expect(followLengths(1.7)).toBe(2.4);
    expect(followLengths(5.2)).toBe(2.4);
    expect(followLengths(20)).toBeCloseTo(1.4, 6);
    // Monotonic: a larger hull is never held further away in hull lengths.
    for (let size = 1; size < 40; size += 0.5) expect(followLengths(size + 0.5)).toBeLessThanOrEqual(followLengths(size));
  });

  it('a solo cinematic orbit of a Reaper is closer and lower than before', () => {
    const rig = new CameraRig(16 / 9);
    rig.setMode('cinematic');
    rig.yaw = Math.PI / 2;
    settle(rig, { cinematic: { from: subject(20), age: 0 } });
    expect(widthShare(rig, 20)).toBeGreaterThan(0.24);
    expect(rig.camera.position.y).toBeLessThan(14);
    expect(cinematicOrbitLengths(1.7)).toBe(3.2);
  });
});
