import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { CameraRig, type CameraSubject } from '@/rendering/cameras';

/**
 * The follow camera holds its ship still in the picture whatever the frames do.
 *
 * Reported: "the follow ship cam judders with the movement of ships, more noticeable at laggy fps rates". The camera
 * eased its own position in space toward a point beside a moving hull. A follower eased that way trails its target
 * by speed × (1/9 s − half a frame), so the trail changed with every change in frame length. Measured before, a
 * 1.2-unit frigate at its top speed of 15 units a second:
 *
 *   frames                      seen from the side: slides over   seen from behind: distance pulses by
 *   steady 1/60 s               0                                 0
 *   1/60 and 1/20 s by turns    0.25 % of the frame's width       0.33 %
 *   1/30 s with every third 1/12 s   0.98 %                       1.34 %
 *   1/45 s with every seventh 1/8 s  3.13 %                       4.26 %
 *
 * Nothing at a steady rate, which is why it only showed when the frame rate fell. A hull half that size: 4.1 % and
 * 5.4 %. A dreadnought, slow and seen from far off: 0.2 % and 0.3 %. The heading was also read at the simulation's
 * twenty steps a second rather than between them, which swung the camera a further 0.07 % round a turning frigate.
 */
const V = (x: number, y: number, z: number): THREE.Vector3 => new THREE.Vector3(x, y, z);
const SPEED = 15;
const SIZE = 1.2;

interface Flight { seen: THREE.Vector3[]; distance: number[] }
/**
 * Fly a hull along +z at a steady speed under the camera; return where it sits on screen and how far off it is, each
 * frame. `yaw` orbits the follow camera round the hull: 0 behind it, a quarter turn beside it.
 */
function fly(mode: 'follow' | 'reaper', frames: (i: number) => number, yaw = 0): Flight {
  const rig = new CameraRig(16 / 9);
  rig.setMode(mode);
  rig.yaw = yaw;
  const seen: THREE.Vector3[] = [], distance: number[] = [];
  let t = 0;
  for (let i = 0; i < 600; i++) {
    const dt = frames(i);
    t += dt;
    const subject: CameraSubject = { id: 'ship', position: V(0, 0, SPEED * t), velocity: V(0, 0, SPEED), heading: V(0, 0, 1), size: SIZE };
    rig.update(dt, { subject, fleetCentre: V(0, 0, 0) });
    rig.camera.updateMatrixWorld(true);
    if (i >= 300) {
      seen.push(subject.position.clone().project(rig.camera));
      distance.push(rig.camera.position.distanceTo(subject.position));
    }
  }
  return { seen, distance };
}
const span = (values: readonly number[]): number => Math.max(...values) - Math.min(...values);
/** How far the hull wanders on screen, as a share of the frame (NDC spans 2). */
const wander = (f: Flight): number => Math.max(span(f.seen.map((p) => p.x)), span(f.seen.map((p) => p.y))) / 2;
/** How much the camera's distance to the hull pulses, as a share of that distance. */
const pulse = (f: Flight): number => span(f.distance) / f.distance[0];
const SIDE = Math.PI / 2;
const steady = (): number => 1 / 60;
const uneven = (i: number): number => (i % 2 ? 1 / 20 : 1 / 60);
const hitching = (i: number): number => (i % 7 === 0 ? 1 / 8 : 1 / 45);

describe('the follow camera rides with its ship', () => {
  it('a hull at top speed stays put in the picture at a steady frame rate', () => {
    for (const yaw of [0, SIDE]) {
      const f = fly('follow', steady, yaw);
      expect(wander(f)).toBeLessThan(1e-6);
      expect(pulse(f)).toBeLessThan(1e-6);
    }
  });

  it('and stays put when frames are uneven or hitch: seen from the side it slid over 3.1 % of the frame', () => {
    for (const frames of [uneven, hitching]) {
      const f = fly('follow', frames, SIDE);
      expect(wander(f)).toBeLessThan(1e-6);
      expect(pulse(f)).toBeLessThan(1e-6);
    }
  });

  it('seen from behind its distance holds: it pulsed by 4.3 % when frames hitched', () => {
    for (const frames of [uneven, hitching]) {
      const f = fly('follow', frames);
      expect(wander(f)).toBeLessThan(1e-6);
      expect(pulse(f)).toBeLessThan(1e-6);
    }
  });

  it('the Reaper view holds its hull the same way', () => {
    const f = fly('reaper', hitching);
    expect(wander(f)).toBeLessThan(1e-6);
    expect(pulse(f)).toBeLessThan(1e-6);
  });

  it('the camera keeps its distance at any frame rate: it no longer trails a fast ship more at 60 than at 15', () => {
    const smooth = fly('follow', steady).distance.at(-1)!;
    const laggy = fly('follow', () => 1 / 15).distance.at(-1)!;
    expect(Math.abs(smooth - laggy)).toBeLessThan(1e-6);
  });

  it('a turn is still eased: the camera swings round behind a turning hull rather than snapping', () => {
    // The hull turns a quarter circle in the last second; the camera must be on its way round, not already there.
    const turning = (t: number): THREE.Vector3 => {
      const a = Math.max(0, t - 9) * (Math.PI / 2);
      return V(Math.sin(a), 0, Math.cos(a));
    };
    const rig = new CameraRig(16 / 9);
    rig.setMode('follow');
    let t = 0, subject: CameraSubject | undefined;
    for (let i = 0; i < 600; i++) {
      t += 1 / 60;
      subject = { id: 'ship', position: V(0, 0, SPEED * t), velocity: V(0, 0, SPEED), heading: turning(t), size: SIZE };
      rig.update(1 / 60, { subject, fleetCentre: V(0, 0, 0) });
    }
    const behind = subject!.heading.clone().negate();
    const offset = rig.camera.position.clone().sub(subject!.position).setY(0).normalize();
    const angle = Math.acos(THREE.MathUtils.clamp(offset.dot(behind), -1, 1));
    expect(angle).toBeGreaterThan(0.05); // still catching up with the turn
    expect(angle).toBeLessThan(0.6); // and not left behind by it
  });

  it('changing to another hull moves across to it instead of jumping', () => {
    const rig = new CameraRig(16 / 9);
    rig.setMode('follow');
    const a: CameraSubject = { id: 'a', position: V(0, 0, 0), velocity: V(0, 0, 0), heading: V(0, 0, 1), size: SIZE };
    const b: CameraSubject = { id: 'b', position: V(400, 0, 0), velocity: V(0, 0, 0), heading: V(0, 0, 1), size: SIZE };
    for (let i = 0; i < 300; i++) rig.update(1 / 60, { subject: a, fleetCentre: V(0, 0, 0) });
    const before = rig.camera.position.clone();
    rig.update(1 / 60, { subject: b, fleetCentre: V(0, 0, 0) });
    expect(rig.camera.position.distanceTo(before)).toBeLessThan(80); // one frame of the move, not the whole 400
    for (let i = 0; i < 300; i++) rig.update(1 / 60, { subject: b, fleetCentre: V(0, 0, 0) });
    expect(rig.camera.position.distanceTo(b.position)).toBeLessThan(20);
  });
});
