import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { CAMERA_MODE_LABELS, CameraRig, GLANCE_LIMIT, type CameraSubject } from '@/rendering/cameras';
import { CHASE_VIEWS, COCKPIT_FOV, cockpitStyle, seatFor } from '@/rendering/cockpit';
import { buildCustomBattle } from '@/scenarios';
import { BattleSimulation } from '@/simulation/battle';
import { GUN_CAM_HOLD, GUN_CAM_LEAD, GUN_CAM_PATIENCE, SLOW_GUN_SECONDS, gunCamStep, type GunCamState } from '@/ui/gunCam';
import { cockpitReadout } from '@/ui/screens/cockpitOverlay';

/**
 * Owner's request, 16 Nov 2026: "trident fight/oculus fps view, cockpit or unique optic hud, fixed chase cams,
 * auto switch to new gunnary view, main canon view".
 *
 * Before this there was no view from inside a fighter or an Oculus, the only camera behind a ship was the
 * follow camera (which the mouse turns and which eases behind a turning ship), and the gun sight was entered
 * and left by hand.
 */
const subject = (heading = new THREE.Vector3(0, 0, 1), size = 0.36, role = 'fighter', faction = 'alliance'): CameraSubject =>
  ({ id: 's', position: new THREE.Vector3(100, 20, -50), velocity: new THREE.Vector3(), heading: heading.clone().normalize(), size, seat: seatFor(role, faction) });
const rigIn = (mode: 'cockpit' | 'chase') => { const rig = new CameraRig(16 / 9); rig.setMode(mode); return rig; };
const step = (rig: CameraRig, s: CameraSubject, frames = 1) => { for (let i = 0; i < frames; i++) rig.update(1 / 60, { subject: s, fleetCentre: new THREE.Vector3() }); };
const forward = (rig: CameraRig) => rig.camera.getWorldDirection(new THREE.Vector3());

describe('the cockpit camera', () => {
  it('is offered with the other cameras, with a wider field than they have', () => {
    expect(CAMERA_MODE_LABELS.cockpit).toBe('Cockpit');
    expect(CAMERA_MODE_LABELS.chase).toBe('Chase');
    const rig = rigIn('cockpit');
    expect(rig.camera.fov).toBe(COCKPIT_FOV);
    expect(COCKPIT_FOV).toBeGreaterThan(50);
    rig.setMode('follow');
    expect(rig.camera.fov).toBe(50);
  });

  it('sits in the seat and looks where the hull points, on its first frame and every frame', () => {
    for (const heading of [new THREE.Vector3(0, 0, 1), new THREE.Vector3(1, 0.3, -0.4), new THREE.Vector3(-0.2, -0.6, 0.5)]) {
      const rig = rigIn('cockpit'), s = subject(heading), seat = s.seat!;
      step(rig, s);
      const offset = rig.camera.position.clone().sub(s.position);
      // Forward of centre by the seat's share of the hull, and above it at right angles to the heading.
      expect(offset.dot(s.heading)).toBeCloseTo(s.size * seat.forward, 6);
      expect(offset.clone().addScaledVector(s.heading, -offset.dot(s.heading)).length()).toBeCloseTo(s.size * seat.up, 6);
      expect(forward(rig).dot(s.heading)).toBeGreaterThan(0.999999);
      // The hull moves and turns: the eye is in the same seat at once, with nothing eased.
      const moved = { ...s, position: s.position.clone().add(new THREE.Vector3(4, -1, 9)), heading: new THREE.Vector3(heading.z, heading.y, -heading.x).normalize() };
      step(rig, moved);
      expect(rig.camera.position.clone().sub(moved.position).dot(moved.heading)).toBeCloseTo(s.size * seat.forward, 6);
      expect(forward(rig).dot(moved.heading)).toBeGreaterThan(0.999999);
    }
  });

  it('cannot be turned with the mouse, and sees its own hull from close without clipping it away', () => {
    const rig = rigIn('cockpit'), s = subject();
    step(rig, s);
    const before = forward(rig);
    rig.orbit(240, 120);
    step(rig, s);
    expect(forward(rig).distanceTo(before)).toBeLessThan(1e-9);
    // A fighter is a third of a unit long: the near plane is well inside it.
    expect(rig.camera.near).toBeLessThanOrEqual(0.02);
  });

  it('a fighter has a canopy, an Oculus and every other Reaper an optic, a warship a bridge', () => {
    expect(cockpitStyle('fighter', 'alliance')).toBe('canopy');
    expect(cockpitStyle('fighter', 'turian')).toBe('canopy');
    expect(cockpitStyle('fighter', 'reaper')).toBe('optic');
    expect(cockpitStyle('reaper_capital', 'reaper')).toBe('optic');
    expect(cockpitStyle('dreadnought', 'alliance')).toBe('bridge');
    expect(cockpitStyle('frigate', 'geth')).toBe('bridge');
    // A pilot sits above the fuselage, with the nose ahead; the Oculus looks out of the front of its eye.
    expect(seatFor('fighter', 'alliance').up).toBeGreaterThan(0);
    expect(seatFor('fighter', 'alliance').forward).toBeLessThan(0.5);
    expect(seatFor('fighter', 'reaper')).toEqual({ forward: 0.52, up: 0 });
    for (const seat of [seatFor('dreadnought', 'alliance'), seatFor('reaper_capital', 'reaper'), seatFor('cruiser', 'turian')]) {
      expect(seat.forward).toBeGreaterThan(0); expect(seat.forward).toBeLessThan(0.5); expect(seat.up).toBeGreaterThan(0);
    }
  });
});

describe('the fixed chase cameras', () => {
  it('each holds its place behind the hull, in the hull’s own frame, looking ahead over it', () => {
    for (let i = 0; i < CHASE_VIEWS.length; i++) {
      const rig = rigIn('chase'), s = subject(new THREE.Vector3(0.3, 0.2, 1), 9.5, 'dreadnought'), view = CHASE_VIEWS[i];
      rig.chaseIndex = i;
      step(rig, s, 240);
      const offset = rig.camera.position.clone().sub(s.position);
      const right = new THREE.Vector3().crossVectors(s.heading, new THREE.Vector3(0, 1, 0)).normalize(), up = new THREE.Vector3().crossVectors(right, s.heading);
      expect(offset.dot(s.heading)).toBeCloseTo(-(s.size * view.back + 1.5), 3);
      expect(offset.dot(up)).toBeCloseTo(s.size * view.up + 0.5, 3);
      expect(offset.dot(right)).toBeCloseTo(s.size * view.side, 3);
      // The hull is ahead of the camera and in the picture.
      const toHull = s.position.clone().sub(rig.camera.position).normalize();
      expect(forward(rig).dot(toHull)).toBeGreaterThan(0.85);
    }
  });

  it('there are several, asking again steps through them and round, and the mouse does not turn them', () => {
    expect(CHASE_VIEWS.length).toBeGreaterThanOrEqual(4);
    expect(new Set(CHASE_VIEWS.map(v => v.name)).size).toBe(CHASE_VIEWS.length);
    const rig = rigIn('chase'), names = [CHASE_VIEWS[0].name];
    for (let i = 0; i < CHASE_VIEWS.length; i++) names.push(rig.nextChaseView());
    expect(names.slice(0, -1)).toEqual(CHASE_VIEWS.map(v => v.name));
    expect(names.at(-1)).toBe(CHASE_VIEWS[0].name);
    const s = subject(undefined, 9.5, 'dreadnought');
    step(rig, s, 600);
    const before = rig.camera.position.clone(), yaw = rig.yaw, pitch = rig.pitch;
    rig.orbit(300, 90);
    expect(rig.yaw).toBe(yaw); expect(rig.pitch).toBe(pitch);
    step(rig, s, 60);
    expect(rig.camera.position.distanceTo(before)).toBeLessThan(1e-3);
  });

  it('it travels with a moving hull: a ship at speed is not left behind', () => {
    const rig = rigIn('chase'), s = subject(undefined, 9.5, 'dreadnought');
    step(rig, s, 200);
    const rest = rig.camera.position.clone().sub(s.position);
    // Ten seconds at speed, at an uneven frame rate.
    for (let i = 0; i < 600; i++) {
      s.position.addScaledVector(s.heading, 0.9 * (i % 3 === 0 ? 2 : 0.5));
      rig.update(i % 3 === 0 ? 1 / 30 : 1 / 120, { subject: s, fleetCentre: new THREE.Vector3() });
      expect(rig.camera.position.clone().sub(s.position).distanceTo(rest)).toBeLessThan(0.05);
    }
  });
});

describe('the instruments', () => {
  const battle = () => new BattleSimulation(buildCustomBattle({ seed: 5, rulesId: 'reaper_hardcore', environment: 'deep_space', startingDistanceKm: 60, maxDuration: 200,
    sideA: { faction: 'alliance', name: 'A', formation: 'line_abreast', counts: { alliance_carrier: 1, alliance_dreadnought: 1 } },
    sideB: { faction: 'reaper', name: 'B', formation: 'line_abreast', counts: { reaper_capital: 1 } } } as never));

  it('a fighter’s canopy shows its speed, hull, gun, torpedoes and target; an Oculus’s optic says it in a Reaper’s words', () => {
    const sim = battle();
    // Fighters and Oculus launch in the first seconds of the battle.
    const launched = () => sim.ships.some(s => s.role === 'fighter' && s.faction === 'alliance') && sim.ships.some(s => s.role === 'fighter' && s.faction === 'reaper');
    for (let i = 0; i < 1200 && !launched() && !sim.finished; i++) sim.step();
    expect(launched()).toBe(true);
    const fighter = sim.ships.find(s => s.role === 'fighter' && s.faction === 'alliance')!, oculus = sim.ships.find(s => s.role === 'fighter' && s.faction === 'reaper')!;
    const capital = sim.ships.find(s => s.role === 'reaper_capital')!, dreadnought = sim.ships.find(s => s.role === 'dreadnought')!;
    const pilot = cockpitReadout(fighter, capital);
    expect(pilot.style).toBe('canopy');
    expect(pilot.left.join(' ')).toMatch(/SPD \d+\.\d\d km\/s/);
    expect(pilot.left.join(' ')).toContain('HULL 100 %');
    expect(pilot.right.join(' ')).toMatch(/TORPEDOES \d+/);
    expect(pilot.target[0]).toBe(`TARGET ${capital.name.toUpperCase()}`);
    expect(pilot.target[1]).toMatch(/^RANGE \d+(\.\d)? km$/);
    expect(cockpitReadout(fighter, undefined).target).toEqual(['NO TARGET']);
    const eye = cockpitReadout(oculus, dreadnought);
    expect(eye.style).toBe('optic');
    expect(eye.target[0]).toBe(`HARVEST ${dreadnought.name.toUpperCase()}`);
    expect(eye.left.join(' ')).toContain('INTEGRITY');
    expect(eye.left.join(' ')).not.toContain('HULL');
    expect(cockpitReadout(oculus, undefined).target).toEqual(['SEEKING']);
    expect(cockpitReadout(dreadnought, capital).style).toBe('bridge');
  });
});

describe('the automatic gun camera', () => {
  const slow = (ready: number, hasTarget = true) => ({ reload: 48, ready, hasTarget });
  const run = (state: GunCamState, now: number, mode: string, gun = slow(0), fired = false) => gunCamStep(state, { now, mode, gun, fired });

  it('cuts to the gun sight shortly before a main cannon fires, stays for the shot, and cuts back to where it was', () => {
    for (const from of ['follow', 'chase', 'cockpit']) {
      const state: GunCamState = {};
      expect(run(state, 0, from, slow(GUN_CAM_LEAD + 0.5))).toBeUndefined();
      expect(run(state, 1, from, slow(GUN_CAM_LEAD - 0.1))).toEqual({ cut: 'gunnery' });
      expect(run(state, 1.5, 'gunnery', slow(0.4))).toBeUndefined();
      // The gun fires: the view holds on the sight, then returns.
      expect(run(state, 2, 'gunnery', slow(48), true)).toBeUndefined();
      expect(run(state, 2 + GUN_CAM_HOLD - 0.1, 'gunnery', slow(46))).toBeUndefined();
      expect(run(state, 2 + GUN_CAM_HOLD + 0.01, 'gunnery', slow(45))).toEqual({ back: from });
      // And is ready for the next shot.
      expect(run(state, 60, from, slow(0.5))).toEqual({ cut: 'gunnery' });
    }
  });

  it('leaves quick guns alone, and does not cut without a target in range or from a camera that is not with a ship', () => {
    expect(SLOW_GUN_SECONDS).toBeGreaterThanOrEqual(6);
    expect(gunCamStep({}, { now: 0, mode: 'follow', gun: { reload: 4.1, ready: 0, hasTarget: true }, fired: false })).toBeUndefined();
    expect(run({}, 0, 'follow', slow(0, false))).toBeUndefined();
    for (const mode of ['tactical', 'cinematic', 'free', 'command', 'projectile']) expect(run({}, 0, mode)).toBeUndefined();
    expect(gunCamStep({}, { now: 0, mode: 'follow', gun: undefined, fired: false })).toBeUndefined();
  });

  it('gives up if the gun does not fire, and lets go if the player takes the camera elsewhere', () => {
    const waiting: GunCamState = {};
    expect(run(waiting, 0, 'chase')).toEqual({ cut: 'gunnery' });
    expect(run(waiting, GUN_CAM_PATIENCE - 0.1, 'gunnery')).toBeUndefined();
    expect(run(waiting, GUN_CAM_PATIENCE + 0.1, 'gunnery')).toEqual({ back: 'chase' });
    // The gun is still loaded and still has not fired: the view does not cut in again and again.
    for (const t of [8, 9, 20, 60]) expect(run(waiting, t, 'chase')).toBeUndefined();
    // Once it has fired and is reloading, the next shot gets its cut.
    expect(run(waiting, 61, 'chase', slow(40))).toBeUndefined();
    expect(run(waiting, 100, 'chase', slow(1))).toEqual({ cut: 'gunnery' });
    const taken: GunCamState = {};
    expect(run(taken, 0, 'follow')).toEqual({ cut: 'gunnery' });
    // The player chose the tactical camera during the cut: it is not pulled back.
    expect(run(taken, 1, 'tactical')).toBeUndefined();
    expect(taken.from).toBeUndefined();
    expect(run(taken, 30, 'tactical')).toBeUndefined();
  });
});

/**
 * 25 Nov 2026. Three faults in the seat, found while giving it an interior:
 *  - the cockpit's wider lens lasted a third of a second: every camera was eased to 50 degrees each frame;
 *  - the seat was placed by the battle's level, but a hull is drawn by the shortest turn to its heading plus its
 *    bank and any held roll, so the seat of a hull drawn rolled over was under its keel;
 *  - the head could not turn.
 */
describe('the seat is in the hull as it is drawn', () => {
  it('keeps its wider lens for as long as it is used', () => {
    const rig = rigIn('cockpit'), s = subject();
    step(rig, s, 240);
    expect(rig.camera.fov).toBeCloseTo(COCKPIT_FOV, 6);
    rig.setMode('chase');
    step(rig, s, 240);
    expect(rig.camera.fov).toBeCloseTo(50, 6);
  });

  it('sits above the hull’s own back whatever the hull’s roll, with the picture’s up the hull’s', () => {
    const heading = new THREE.Vector3(0.3, -0.2, -1).normalize();
    for (const roll of [0.4, 1.6, 3.0, -2.2]) {
      const level = new THREE.Vector3().crossVectors(new THREE.Vector3().crossVectors(heading, new THREE.Vector3(0, 1, 0)), heading).normalize();
      const up = level.clone().applyAxisAngle(heading, roll);
      const rig = rigIn('cockpit'), s = { ...subject(heading, 9.5, 'dreadnought'), up };
      step(rig, s);
      const offset = rig.camera.position.clone().sub(s.position);
      expect(offset.dot(up)).toBeCloseTo(s.size * s.seat!.up, 6);
      expect(offset.dot(heading)).toBeCloseTo(s.size * s.seat!.forward, 6);
      expect(new THREE.Vector3(0, 1, 0).applyQuaternion(rig.camera.quaternion).dot(up)).toBeGreaterThan(0.999999);
      expect(forward(rig).dot(heading)).toBeGreaterThan(0.999999);
      // Another camera afterwards is level again.
      rig.setMode('chase');
      step(rig, s, 300);
      expect(new THREE.Vector3(1, 0, 0).applyQuaternion(rig.camera.quaternion).y).toBeCloseTo(0, 6);
    }
  });

  it('when the hull’s drawn roll swings, the eye stays in its seat and the picture turns over a second, not in a frame', () => {
    const heading = new THREE.Vector3(0, 0, 1), rig = rigIn('cockpit');
    const s = { ...subject(heading, 9.5, 'dreadnought'), up: new THREE.Vector3(0, 1, 0) };
    step(rig, s, 10);
    const over = { ...s, up: new THREE.Vector3(1, 0, 0) }; // a quarter turn at once
    step(rig, over);
    expect(rig.camera.position.clone().sub(s.position).dot(over.up)).toBeCloseTo(s.size * s.seat!.up, 6);
    const pictureUp = () => new THREE.Vector3(0, 1, 0).applyQuaternion(rig.camera.quaternion);
    expect(pictureUp().angleTo(s.up)).toBeLessThan(THREE.MathUtils.degToRad(8));
    step(rig, over, 180);
    expect(pictureUp().angleTo(over.up)).toBeLessThan(THREE.MathUtils.degToRad(1));
    // Turned right over between two frames: still finite, and it arrives.
    step(rig, { ...s, up: new THREE.Vector3(-1, 0, 0) }, 400);
    expect(pictureUp().angleTo(new THREE.Vector3(-1, 0, 0))).toBeLessThan(THREE.MathUtils.degToRad(1));
  });

  it('the head turns within its reach and comes back; the seat does not move', () => {
    const rig = rigIn('cockpit'), s = subject(new THREE.Vector3(0.2, 0.1, 1), 9.5, 'dreadnought');
    step(rig, s);
    const seat = rig.camera.position.clone();
    rig.glance(1, 0);
    step(rig, s, 120);
    expect(rig.camera.position.distanceTo(seat)).toBeLessThan(1e-9);
    const right = new THREE.Vector3().crossVectors(s.heading, new THREE.Vector3(0, 1, 0)).normalize();
    expect(forward(rig).dot(right)).toBeCloseTo(Math.sin(GLANCE_LIMIT.yaw), 3);
    expect(GLANCE_LIMIT.yaw).toBeLessThan(Math.PI / 2);
    rig.glance(-1, 1);
    step(rig, s, 120);
    expect(forward(rig).dot(right)).toBeLessThan(-0.5);
    expect(forward(rig).y).toBeGreaterThan(s.heading.y);
    rig.glance(0, 0);
    step(rig, s, 240);
    expect(forward(rig).dot(s.heading)).toBeGreaterThan(0.999999);
    // Asked for more than its reach, it stops at its reach; and a new camera starts looking ahead.
    rig.glance(5, -5);
    step(rig, s, 240);
    expect(rig.glanceYaw).toBeCloseTo(GLANCE_LIMIT.yaw, 6);
    expect(rig.glancePitch).toBeCloseTo(-GLANCE_LIMIT.down, 6);
    rig.setMode('follow'); rig.setMode('cockpit');
    step(rig, s);
    expect(forward(rig).dot(s.heading)).toBeGreaterThan(0.999999);
  });

  it('the Reaper view stands on the hood of a Reaper that holds a roll', () => {
    const heading = new THREE.Vector3(0, 0, 1), up = new THREE.Vector3(0, 1, 0).applyAxisAngle(heading, 2.4);
    const rig = new CameraRig(16 / 9);
    rig.setMode('reaper');
    const s: CameraSubject = { id: 'r', position: new THREE.Vector3(), velocity: new THREE.Vector3(), heading, size: 20, up };
    step(rig, s, 600);
    // Above the hull's own back by the brow's height, not above the battle's level.
    expect(rig.camera.position.dot(up)).toBeCloseTo(20 * 0.178, 2);
    expect(new THREE.Vector3(1, 0, 0).applyQuaternion(rig.camera.quaternion).y).toBeCloseTo(0, 6);
  });
});
