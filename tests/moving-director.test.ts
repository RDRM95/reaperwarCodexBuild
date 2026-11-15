import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { Rng } from '@/core/rng';
import { CAMERA_MOVES, CameraRig, MOVE_TRAVEL, travel, type CameraSubject, type CinematicFrame, type ShotMove } from '@/rendering/cameras';
import { KILL_WATCH_HULL, planShot, type ShotMemory, type ShotPlan } from '@/rendering/director';
import { buildScenario } from '@/scenarios';
import { BattleSimulation } from '@/simulation/battle';

/**
 * The cinematic camera moves, and the director chooses what it shows.
 *
 * Owner's requests, 15 Nov 2026: "a cinematic camera that move" and "intelligent auto director camera". The camera
 * held a framing and drifted a few degrees on a slow sine; between shots it flew across the field to the next one.
 * Now every shot has a move (an arc round its subject, a push in, a pull back, a rise, or standing still while a
 * hull goes past), the camera cuts between shots, and it travels with what it frames, so that uneven frames do not
 * slide the subject about. The director prefers a kill about to happen, then a Reaper's beam, then capitals in a
 * fight, and does not repeat a subject or a move.
 */
const V = (x: number, y: number, z: number): THREE.Vector3 => new THREE.Vector3(x, y, z);
const hull = (size: number, position = V(0, 0, 0), velocity = V(0, 0, 0)): CameraSubject => ({ position, velocity, heading: V(0, 0, 1), size });
const centre = V(0, 0, 0);
const onScreen = (rig: CameraRig, p: THREE.Vector3): THREE.Vector3 => { rig.camera.updateMatrixWorld(true); return p.clone().project(rig.camera); };

describe('camera moves', () => {
  const base = { position: V(30, 12, 0), look: V(0, 0, 0) };
  const at = (move: ShotMove, age: number): { position: THREE.Vector3; look: THREE.Vector3 } => {
    const position = base.position.clone(), look = base.look.clone();
    travel(position, look, move, age);
    return { position, look };
  };

  it('halfway through, an arc and a rise are at the framing they were given', () => {
    for (const kind of ['arc', 'rise'] as const) {
      expect(at({ kind, side: 1, hold: 12 }, 6).position.distanceTo(base.position), kind).toBeLessThan(1e-9);
    }
  });

  it('an arc swings round the subject, the same distance from it, one way or the other', () => {
    for (const side of [1, -1] as const) {
      const start = at({ kind: 'arc', side, hold: 12 }, 0).position, end = at({ kind: 'arc', side, hold: 12 }, 12).position;
      expect(start.length()).toBeCloseTo(base.position.length(), 9);
      expect(end.length()).toBeCloseTo(base.position.length(), 9);
      const swing = Math.atan2(end.x, end.z) - Math.atan2(start.x, start.z);
      expect(swing).toBeCloseTo(side * MOVE_TRAVEL.arc, 9);
      expect(end.y).toBeCloseTo(start.y, 9);
    }
  });

  it('a push closes in and a pull draws back by the same amount', () => {
    const push = { kind: 'push', side: 1, hold: 10 } as const, pull = { kind: 'pull', side: 1, hold: 10 } as const;
    expect(at(push, 0).position.length() / base.position.length()).toBeCloseTo(MOVE_TRAVEL.far, 9);
    expect(at(push, 10).position.length() / base.position.length()).toBeCloseTo(MOVE_TRAVEL.near, 9);
    expect(at(pull, 0).position.length() / base.position.length()).toBeCloseTo(MOVE_TRAVEL.near, 9);
    expect(at(pull, 10).position.length() / base.position.length()).toBeCloseTo(MOVE_TRAVEL.far, 9);
  });

  it('a rise climbs, keeping its distance', () => {
    const start = at({ kind: 'rise', side: 1, hold: 10 }, 0).position, end = at({ kind: 'rise', side: 1, hold: 10 }, 10).position;
    expect(end.y).toBeGreaterThan(start.y + base.position.length() * 0.3);
    expect(start.length()).toBeCloseTo(base.position.length(), 9);
    expect(end.length()).toBeCloseTo(base.position.length(), 9);
  });

  it('no move stands still: the least of them carries the camera a tenth of its distance from the subject', () => {
    for (const kind of ['arc', 'push', 'pull', 'rise'] as const) {
      const travelled = at({ kind, side: 1, hold: 12 }, 0).position.distanceTo(at({ kind, side: 1, hold: 12 }, 12).position);
      expect(travelled / base.position.length(), kind).toBeGreaterThan(0.1);
    }
  });
});

describe('the cinematic camera on a directed shot', () => {
  /** Play a shot from its first frame; returns what `watch` saw each frame. */
  function play<T>(frame: (age: number) => CinematicFrame, hold: number, watch: (rig: CameraRig, age: number) => T, frames: (i: number) => number = () => 1 / 60): T[] {
    const rig = new CameraRig(16 / 9);
    rig.setMode('cinematic');
    const seen: T[] = [];
    let age = 0;
    for (let i = 0; age < hold; i++) {
      const dt = frames(i);
      age += dt;
      rig.update(dt, { cinematic: frame(age), fleetCentre: centre });
      seen.push(watch(rig, age));
    }
    return seen;
  }
  const scenes: [string, (age: number) => Omit<CinematicFrame, 'age' | 'move' | 'shot'>, (f: Omit<CinematicFrame, 'age' | 'move' | 'shot'>) => THREE.Vector3[]][] = [
    ['a frigate on its own', () => ({ from: hull(1.2) }), (f) => [f.from.position]],
    ['a Reaper on its own', () => ({ from: hull(20) }), (f) => [f.from.position]],
    ['two cruisers fighting', () => ({ from: hull(5), to: hull(5, V(40, 4, 60)) }), (f) => [f.from.position, f.to!.position]],
    ['a Reaper and a distant cruiser', () => ({ from: hull(20), to: hull(5, V(0, 0, 220)) }), (f) => [f.from.position, f.to!.position]],
    ['a frigate and a Reaper two and a half Reaper-lengths off', () => ({ from: hull(1.7), to: hull(20, V(10, 4, 53)) }), (f) => [f.from.position, f.to!.position]],
    ['a Reaper and a frigate one Reaper-length off', () => ({ from: hull(20), to: hull(1.7, V(6, -2, 20)) }), (f) => [f.from.position, f.to!.position]],
    ['a battlegroup', () => ({ from: hull(10), group: { centre: V(20, 5, 30), radius: 60, heading: V(0, 0, 1) } }),
      (f) => [f.group!.centre, f.group!.centre.clone().add(V(60, 0, 0)), f.group!.centre.clone().add(V(-60, 0, 0)), f.group!.centre.clone().add(V(0, 0, 60)), f.group!.centre.clone().add(V(0, 0, -60))]],
  ];

  it.each(scenes)('keeps what it frames in the picture from the first frame to the last, whatever the move: %s', (_name, scene, points) => {
    for (const kind of ['arc', 'push', 'pull', 'rise'] as const) for (const side of [1, -1] as const) {
      const move: ShotMove = { kind, side, hold: 12 };
      const worst = Math.max(...play((age) => ({ ...scene(age), age, move, shot: 1 }), 12, (rig) => {
        let w = 0;
        for (const p of points(scene(0))) {
          const q = onScreen(rig, p);
          expect(q.z, `${kind} ${side}`).toBeLessThan(1);
          w = Math.max(w, Math.abs(q.x), Math.abs(q.y));
        }
        return w;
      }));
      expect(worst, `${kind} ${side}`).toBeLessThan(1);
    }
  });

  it.each(scenes)('travels: over a shot the camera covers at least a tenth of its distance from the subject: %s', (_name, scene) => {
    for (const kind of ['arc', 'push', 'pull', 'rise'] as const) {
      const path = play((age) => ({ ...scene(age), age, move: { kind, side: 1, hold: 12 }, shot: 1 }), 12, (rig) => rig.camera.position.clone());
      const reach = path[0].distanceTo(scene(0).group?.centre ?? scene(0).from.position);
      expect(path[0].distanceTo(path.at(-1)!) / reach, kind).toBeGreaterThan(0.1);
      // Smoothly: no frame carries it more than a fiftieth of the whole.
      let step = 0;
      for (let i = 1; i < path.length; i++) step = Math.max(step, path[i].distanceTo(path[i - 1]));
      expect(step / path[0].distanceTo(path.at(-1)!), kind).toBeLessThan(0.02);
    }
  });

  it('a pair far apart for their size is shot over the shoulder, so there is a hull in the picture', () => {
    // Two cruisers 400 units apart. Side-on, the camera stood 290 units off and each hull was a speck.
    const from = hull(5), to = hull(5, V(0, 0, 400));
    const rig = new CameraRig(16 / 9);
    rig.setMode('cinematic');
    for (let i = 0; i < 120; i++) rig.update(1 / 60, { cinematic: { from, to, age: 6, move: { kind: 'arc', side: 1, hold: 12 }, shot: 1 }, fleetCentre: centre });
    expect(rig.camera.position.distanceTo(from.position)).toBeLessThan(5 * 2.5);
    const bow = onScreen(rig, V(0, 0, 2.5)), stern = onScreen(rig, V(0, 0, -2.5));
    expect(Math.hypot(bow.x - stern.x, bow.y - stern.y) / 2).toBeGreaterThan(0.15); // the hull spans a sixth of the frame or more
    const target = onScreen(rig, to.position);
    expect(Math.abs(target.x)).toBeLessThan(1);
    expect(Math.abs(target.y)).toBeLessThan(1);
    expect(target.z).toBeLessThan(1);
    // Without a director's move the old side-on framing stands, as its own test requires.
    const plain = new CameraRig(16 / 9);
    plain.setMode('cinematic');
    for (let i = 0; i < 400; i++) plain.update(0.1, { cinematic: { from, to, age: 0 }, fleetCentre: centre });
    expect(plain.camera.position.distanceTo(from.position)).toBeGreaterThan(200);
  });

  it('cuts to a new shot: the first frame is the shot, not a flight across the field to it', () => {
    const rig = new CameraRig(16 / 9);
    rig.setMode('cinematic');
    const first = (age: number): CinematicFrame => ({ from: hull(5), to: hull(5, V(40, 0, 60)), age, move: { kind: 'arc', side: 1, hold: 12 }, shot: 1 });
    for (let i = 0; i < 300; i++) rig.update(1 / 60, { cinematic: first(i / 60), fleetCentre: centre });
    // The next shot is four thousand units away.
    const far = hull(20, V(4000, 50, -2500));
    const second: CinematicFrame = { from: far, age: 1 / 60, move: { kind: 'push', side: 1, hold: 10 }, shot: 2 };
    rig.update(1 / 60, { cinematic: second, fleetCentre: centre });
    const fresh = new CameraRig(16 / 9);
    fresh.setMode('cinematic');
    fresh.update(1 / 60, { cinematic: second, fleetCentre: centre });
    expect(rig.camera.position.distanceTo(fresh.camera.position)).toBeLessThan(1e-6);
    expect(rig.camera.position.distanceTo(far.position)).toBeLessThan(200);
    const q = onScreen(rig, far.position);
    expect(Math.abs(q.x)).toBeLessThan(0.2);
    expect(Math.abs(q.y)).toBeLessThan(0.2);
  });

  it('holds a moving subject as steady with hitching frames as with even ones', () => {
    // A cruiser at 5 units a second with its target keeping station on it.
    const scene = (age: number): CinematicFrame => {
      const at = V(0, 0, 5 * age);
      return { from: hull(5, at, V(0, 0, 5)), to: hull(5, at.clone().add(V(40, 0, 60)), V(0, 0, 5)), age, move: { kind: 'arc', side: 1, hold: 12 }, shot: 1 };
    };
    const track = (frames: (i: number) => number) => play(scene, 12, (rig, age) => ({ age, at: onScreen(rig, scene(age).from.position) }), frames);
    const even = track(() => 1 / 60), hitching = track((i) => (i % 7 === 0 ? 1 / 8 : 1 / 45));
    // Where the cruiser sits in the picture at the same moment of the shot, both ways.
    let worst = 0;
    for (const h of hitching) {
      if (h.age < 1) continue;
      const e = even.reduce((best, s) => (Math.abs(s.age - h.age) < Math.abs(best.age - h.age) ? s : best));
      worst = Math.max(worst, Math.abs(e.at.x - h.at.x), Math.abs(e.at.y - h.at.y));
    }
    expect(worst).toBeLessThan(0.01); // within half a percent of the frame
  });

  it('a flyby stands still and turns to watch the hull go past, holding it in the middle of the picture', () => {
    const speed = 15, hold = 10;
    const anchor = V(4, 1, speed * hold / 2);
    const scene = (age: number): CinematicFrame => ({ from: hull(1.2, V(0, 0, speed * age), V(0, 0, speed)), age, move: { kind: 'flyby', side: 1, hold, anchor }, shot: 1 });
    const seen = play(scene, hold, (rig, age) => ({ camera: rig.camera.position.clone(), at: onScreen(rig, scene(age).from.position), looking: rig.camera.getWorldDirection(V(0, 0, 0)).clone() }),
      (i) => (i % 7 === 0 ? 1 / 8 : 1 / 45));
    for (const s of seen) {
      expect(s.camera.distanceTo(anchor)).toBeLessThan(1e-9);
      expect(Math.abs(s.at.x)).toBeLessThan(1e-6);
      expect(Math.abs(s.at.y)).toBeLessThan(1e-6);
    }
    // It watched the hull come, pass and go: the view swung through more than a right angle.
    expect(seen[0].looking.angleTo(seen.at(-1)!.looking)).toBeGreaterThan(Math.PI / 2);
  });

  it('without a move a framing is what it always was', () => {
    const still = new CameraRig(16 / 9), plain = new CameraRig(16 / 9);
    still.setMode('cinematic'); plain.setMode('cinematic');
    const frame = { from: hull(5), to: hull(5, V(40, 0, 60)), age: 0 };
    for (let i = 0; i < 400; i++) { still.update(0.1, { cinematic: { ...frame, shot: 3 }, fleetCentre: centre }); plain.update(0.1, { cinematic: frame, fleetCentre: centre }); }
    expect(still.camera.position.distanceTo(plain.camera.position)).toBeLessThan(1e-9);
    expect(CAMERA_MOVES).toEqual(['arc', 'push', 'pull', 'rise', 'flyby']);
  });
});

describe('the director', () => {
  const battle = (seconds: number, scenario = 'battle_of_earth', rules = 'prime_apex'): BattleSimulation => {
    const sim = new BattleSimulation(buildScenario(scenario, rules, 3));
    while (sim.time < seconds && !sim.finished) sim.step();
    return sim;
  };
  /** A run of shots, each planned knowing the one before. */
  const sequence = (sim: BattleSimulation, seed: number, shots: number): ShotPlan[] => {
    const rng = new Rng(seed), plans: ShotPlan[] = [];
    let memory: ShotMemory = { count: 0 };
    for (let i = 0; i < shots; i++) {
      const plan = planShot(sim.ships, rng, memory)!;
      plans.push(plan);
      memory = { fromId: plan.fromId, move: plan.move, kind: plan.kind, count: i + 1 };
    }
    return plans;
  };

  it('only looks: the battle and its random numbers are as they were', () => {
    const sim = battle(40);
    const ships = JSON.stringify(sim.ships), rng = sim.rng.getState();
    sequence(sim, 7, 60);
    expect(JSON.stringify(sim.ships)).toBe(ships);
    expect(sim.rng.getState()).toBe(rng);
    expect(planShot([], new Rng(1), { count: 0 })).toBeUndefined();
  });

  it('plans the same shots from the same seed, of living hulls that are not fighters', () => {
    const sim = battle(40);
    expect(sequence(sim, 11, 40)).toEqual(sequence(sim, 11, 40));
    for (const plan of sequence(sim, 11, 80)) {
      const from = sim.getShip(plan.fromId)!;
      expect(from.alive && !from.escaped && from.role !== 'fighter').toBe(true);
      if (plan.toId) {
        const to = sim.getShip(plan.toId)!;
        expect(to.alive && to.side !== from.side && to.role !== 'fighter').toBe(true);
      }
      expect(plan.hold).toBeGreaterThanOrEqual(8);
      expect(plan.hold).toBeLessThanOrEqual(18);
    }
  });

  it('does not show the same hull twice running, nor make the same move twice running', () => {
    for (const seconds of [5, 40, 90]) {
      const plans = sequence(battle(seconds), 5, 120);
      let sameHull = 0;
      for (let i = 1; i < plans.length; i++) {
        expect(plans[i].move, `shot ${i} at ${seconds} s`).not.toBe(plans[i - 1].move);
        if (plans[i].fromId === plans[i - 1].fromId) sameHull++;
      }
      expect(sameHull / plans.length).toBeLessThan(0.05); // a tenth of its usual weight, not forbidden
      // Every move is used.
      expect(new Set(plans.map(p => p.move)).size).toBeGreaterThanOrEqual(4);
    }
  });

  it('before the fleets meet it shows fleets under way and hulls going past, never a duel', () => {
    const plans = sequence(battle(2), 9, 60);
    const kinds = new Set(plans.map(p => p.kind));
    expect([...kinds].every(k => k === 'fleet' || k === 'pass' || k === 'solo')).toBe(true);
    expect(kinds.has('fleet') || kinds.has('pass')).toBe(true);
    for (const plan of plans) if (plan.kind === 'pass') { expect(plan.move).toBe('flyby'); expect(plan.toId).toBeUndefined(); }
  });

  it('does not plan to watch a hull go past while the battle is paused, or too slow for it to get past', () => {
    const sim = battle(2);
    const paused = (rate: number): ShotPlan[] => {
      const rng = new Rng(9), plans: ShotPlan[] = [];
      let memory: ShotMemory = { count: 0 };
      for (let i = 0; i < 60; i++) {
        const plan = planShot(sim.ships, rng, memory, rate)!;
        plans.push(plan);
        memory = { fromId: plan.fromId, move: plan.move, kind: plan.kind, count: i + 1 };
      }
      return plans;
    };
    expect(paused(1).some(p => p.move === 'flyby')).toBe(true);
    expect(paused(0).some(p => p.move === 'flyby')).toBe(false);
  });

  it('goes to a kill about to happen', () => {
    const sim = battle(40);
    const byId = new Map(sim.ships.map(s => [s.id, s]));
    // Hulls in a fight and firing, by the director's own reading; take one and bring its target near death.
    const fighting = sim.ships.filter(s => {
      const t = s.alive && !s.escaped && s.role !== 'fighter' && s.targetId ? byId.get(s.targetId) : undefined;
      return !!t && t.alive && t.side !== s.side && s.weapons.some(w => w.cooldown > w.def.cooldown * 0.85 || w.beamRemaining > 0);
    });
    expect(fighting.length).toBeGreaterThan(3);
    const before = sequence(sim, 13, 300).filter(p => p.kind === 'kill').length;
    const killer = fighting[0], victim = byId.get(killer.targetId!)!;
    victim.hull = victim.maxHull * 0.1;
    const plans = sequence(sim, 13, 300);
    const kills = plans.filter(p => p.kind === 'kill');
    expect(kills.length).toBeGreaterThan(before);
    for (const plan of kills) {
      const target = sim.getShip(plan.toId!)!;
      expect(target.hull).toBeLessThanOrEqual(target.maxHull * KILL_WATCH_HULL);
      expect(['push', 'arc']).toContain(plan.move);
    }
    expect(kills.some(p => p.toId === victim.id)).toBe(true);
  });

  it('in a large battle every third shot takes in a battlegroup', () => {
    const plans = sequence(battle(60, 'final_battle_of_earth'), 21, 90);
    const wide = plans.filter(p => p.wide).length;
    expect(wide / plans.length).toBeGreaterThan(0.2);
    expect(wide / plans.length).toBeLessThan(0.5);
  });
});
