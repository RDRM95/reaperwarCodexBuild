import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { CameraRig, cinematicOrbitLengths, followLengths, overShoulderWeight, type CameraSubject } from '@/rendering/cameras';

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
  it('the Reaper view is from the brow of the hood: the limbs reach into the picture and the hood is not in the way', () => {
    const rig = new CameraRig(16 / 9);
    rig.setMode('reaper');
    settle(rig, { subject: subject(20) });
    // A 20-unit Sovereign-class hull heading +z, as measured on the model: the hood's crown is 2.5 units up and its
    // nose 2.8 units forward of the centre; the four forward claw tips are below.
    const tips = [V(1.88, -2.12, 9.4), V(-1.88, -2.12, 9.4), V(2.34, -1.38, 8.5), V(-2.34, -1.38, 8.5)];
    for (const p of tips) expect(inFrame(rig, p)).toBe(true);
    const cam = rig.camera.position;
    // On the brow, a little above the crown: not over the aft blade, where the hood filled the view (the camera sat
    // at z = −8.4 until the mantle was given its size), and not half a hull length above.
    expect(cam.y).toBeGreaterThan(2.5 + 0.5);
    expect(cam.y).toBeLessThan(20 * 0.25);
    expect(cam.z).toBeGreaterThan(-20 * 0.1);
    expect(cam.z).toBeLessThan(20 * 0.05);
    expect(rig.camera.getWorldDirection(V(0, 0, 0)).z).toBeGreaterThan(0.9);
    // The line of sight to each claw tip clears the crown of the hood ahead of the camera.
    for (const tip of tips) {
      const y = cam.y + (tip.y - cam.y) * ((0.5 - cam.z) / (tip.z - cam.z));
      expect(y).toBeGreaterThan(2.5);
    }
  });

  it('a destroyer is seen from over its back, from outside its hull', () => {
    // A 1.6-unit destroyer heading +z: its carapace reaches 0.28 of a unit above its centre and 0.8 behind it. The
    // camera used to sit 0.27 above the centre and 0.67 behind it, among the carapace plates, with a near plane of
    // 0.2: the view was the inside of the hull.
    const rig = new CameraRig(16 / 9);
    rig.setMode('reaper');
    settle(rig, { subject: subject(1.6) });
    const cam = rig.camera.position;
    expect(cam.y).toBeGreaterThan(0.28 + 0.3);
    expect(cam.z).toBeLessThan(-0.8 - 0.3);
    expect(rig.camera.near).toBeLessThan(0.1);
    expect(rig.camera.getWorldDirection(V(0, 0, 0)).z).toBeGreaterThan(0.9);
    // Its back and the reach of its forward legs are in the picture.
    for (const p of [V(0, 0.28, 0), V(0.38, -0.32, 0.64), V(-0.38, -0.32, 0.64)]) expect(inFrame(rig, p)).toBe(true);
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

  // Measured before: the side-on two-shot backed off with the separation, so a 20-unit Reaper spanned 14.4 % of the
  // frame's width with its target 120 units away, 9.7 % at 200 and 4.9 % at 400.
  const at = (size: number, z: number, heading = V(0, 0, 1)): CameraSubject => ({ position: V(0, 0, z), velocity: V(0, 0, 0), heading, size });
  /** Visible share of the frame's width spanned by a hull of `size` centred at z0 on the z axis. */
  function visibleShare(rig: CameraRig, size: number, z0: number): number {
    let lo = Infinity, hi = -Infinity;
    for (const p of [V(0, 0, z0 - size / 2), V(0, 0, z0 + size / 2), V(size * 0.18, 0, z0 + size / 4), V(-size * 0.18, 0, z0 + size / 4)]) {
      const q = p.clone().project(rig.camera);
      lo = Math.min(lo, q.x); hi = Math.max(hi, q.x);
    }
    return (Math.min(1, hi) - Math.max(-1, lo)) / 2;
  }

  it('a Reaper and a distant target are framed over the Reaper\'s shoulder, with the target in the picture', () => {
    for (const separation of [80, 120, 200, 400]) {
      const rig = new CameraRig(16 / 9);
      rig.setMode('cinematic');
      const reaper = at(20, 0), target = at(4.5, separation, V(0, 0, -1));
      settle(rig, { cinematic: { from: reaper, to: target, age: 0 } });
      expect(visibleShare(rig, 20, 0), 'separation ' + separation).toBeGreaterThan(0.4);
      expect(inFrame(rig, target.position)).toBe(true);
      // Behind the Reaper relative to its target, and looking towards the target.
      expect(rig.camera.position.z).toBeLessThan(-10);
      expect(rig.camera.getWorldDirection(V(0, 0, 0)).z).toBeGreaterThan(0.85);
    }
  });

  it('the larger ship is the foreground whichever end of the pair it is', () => {
    const rig = new CameraRig(16 / 9);
    rig.setMode('cinematic');
    const cruiser = at(4.5, 0), reaper = at(20, 200, V(0, 0, -1));
    settle(rig, { cinematic: { from: cruiser, to: reaper, age: 0 } });
    expect(visibleShare(rig, 20, 200)).toBeGreaterThan(0.4);
    expect(inFrame(rig, cruiser.position)).toBe(true);
    expect(rig.camera.position.z).toBeGreaterThan(210);
  });

  it('small hulls and close pairs keep the side-on two-shot', () => {
    expect(overShoulderWeight(1.7, 30)).toBe(0);
    expect(overShoulderWeight(5.2, 400)).toBe(0);
    expect(overShoulderWeight(20, 30)).toBe(0);
    expect(overShoulderWeight(20, 70)).toBe(1);
    for (let d = 20; d < 100; d += 2) expect(overShoulderWeight(20, d + 2)).toBeGreaterThanOrEqual(overShoulderWeight(20, d));
    // A frigate pair 30 units apart: the camera stands off to the side at the midpoint, as before.
    const rig = new CameraRig(16 / 9);
    rig.setMode('cinematic');
    settle(rig, { cinematic: { from: at(1.7, 0), to: at(1.7, 30, V(0, 0, -1)), age: 0 } });
    expect(rig.camera.position.z).toBeCloseTo(15 - 30 * 0.12, 3);
    expect(Math.abs(rig.camera.position.x)).toBeCloseTo(30 * 0.72, 3);
    expect(rig.camera.position.y).toBeCloseTo(30 * 0.72 * 0.3, 3);
  });
});
