import { describe, expect, it } from 'vitest';
import { distance, v3 } from '@/core/vec3';
import { buildCustomBattle } from '@/scenarios';
import { BattleSimulation, SIM_DT } from '@/simulation/battle';
import { chooseTarget, scoreTarget, shipEngagementRange } from '@/simulation/ai';
import { combatYawRate, feasibleSolution, recordSwitch, solutionFactor, solutionFeasibility, switchAllowed, switchesPerMinute } from '@/simulation/engagementReach';
import type { BattleEvent, ShipState } from '@/simulation/types';

/** Every weapon deals no damage; navigation, arcs, cooldowns and targeting stay live. */
function disarm(sim: BattleSimulation): void {
  for (const ship of sim.ships) for (const w of ship.weapons) { w.def = { ...w.def, damage: 0 }; w.cooldown = 0; }
}

/** Hulls stay where they are placed: translation frozen, hull yaw live. */
function freezeTranslation(ships: ShipState[]): void {
  for (const s of ships) { s.maxSpeed = 0; s.acceleration = 0; s.vel = v3(); }
}

const bearing = (deg: number, dist: number) => v3(Math.sin(deg * Math.PI / 180) * dist, 0, Math.cos(deg * Math.PI / 180) * dist);

function firstShots(sim: BattleSimulation, shipId: string, weaponId: string, seconds: number): { t: number; targetId: string }[] {
  const shots: { t: number; targetId: string }[] = [];
  sim.onEvent = (e: BattleEvent) => {
    if (e.type === 'weapon_fired' && e.shipId === shipId && e.weaponId === weaponId) shots.push({ t: e.t, targetId: e.targetId });
  };
  for (let i = 0; i < Math.round(seconds / SIM_DT) && !sim.finished; i++) sim.step();
  return shots;
}

describe('feasible target selection (RC2)', () => {
  // The audit's target-probe geometry: a dreadnought facing +z, the fleet
  // focus (a Reaper capital) dead ahead at 1.1x main-gun range, a Reaper
  // destroyer inside range at 0.8x and 35° off the bow. Before this change
  // the capital scored 3.04 against the destroyer's 1.38, chooseTarget
  // committed to it, and the spinal gun fired nothing in 12 s.
  function probe(relFocus = 1.1, relOther = 0.8, angleDeg = 35) {
    const sim = new BattleSimulation(buildCustomBattle({
      seed: 7, rulesId: 'canon_me3', environment: 'deep_space', startingDistanceKm: 60, maxDuration: 120, theatreLayout: 'legacy_plane',
      sideA: { faction: 'alliance', name: 'DN', formation: 'line_abreast', counts: { alliance_dreadnought: 1 } },
      sideB: { faction: 'reaper', name: 'R', formation: 'line_abreast', counts: { reaper_capital: 1, reaper_destroyer: 1 } },
    }));
    disarm(sim);
    const dn = sim.ships.find(s => s.classId === 'alliance_dreadnought')!;
    const rc = sim.ships.find(s => s.classId === 'reaper_capital')!;
    const rd = sim.ships.find(s => s.classId === 'reaper_destroyer')!;
    const fleetA = sim.fleets.get(dn.fleetId)!;
    const range = shipEngagementRange(dn);
    dn.pos = v3(); dn.vel = v3(); dn.heading = v3(0, 0, 1);
    rc.pos = v3(0, 0, relFocus * range); rc.vel = v3(); rc.heading = v3(0, 0, -1);
    rd.pos = bearing(angleDeg, relOther * range); rd.vel = v3(); rd.heading = v3(0, 0, -1);
    for (const f of sim.fleets.values()) f.anchor = f.spec.side === 'A' ? v3() : v3(0, 0, relFocus * range);
    fleetA.focusTargetId = rc.id; fleetA.focusLockUntil = sim.time + 8; fleetA.engagementRange = range;
    dn.targetId = undefined; dn.targetLockUntil = 0; dn.aiTimer = 0;
    return { sim, dn, rc, rd, fleetA, range };
  }

  it('scores the in-range destroyer above the out-of-range fleet focus and chooses it', () => {
    const { sim, dn, rc, rd, fleetA, range } = probe();
    expect(fleetA.orders.focusFire).toBe(true);
    const focusScore = scoreTarget(sim, dn, fleetA, rc, range);
    const destroyerScore = scoreTarget(sim, dn, fleetA, rd, range);
    expect(destroyerScore).toBeGreaterThan(focusScore);
    expect(chooseTarget(sim, dn, fleetA)).toBe(rd.id);
  });

  it('brings the spinal gun onto the destroyer and fires within its slew plus one cooldown', () => {
    const { sim, dn, rc, rd, fleetA } = probe();
    freezeTranslation([rc, rd]);
    for (const r of [rc, rd]) r.turnRate = 0;
    fleetA.orders.order = 'hold_formation';
    const main = dn.weapons.find(w => w.def.id === 'alliance_dn_main')!;
    // 35° bearing less the 6° half arc at the catalogue 4.5°/s: 6.4 s of yaw.
    const slew = (35 - main.def.arc / 2) * Math.PI / 180 / combatYawRate(dn);
    const shots = firstShots(sim, dn.id, 'alliance_dn_main', 20);
    expect(shots.length).toBeGreaterThan(0);
    expect(shots[0].targetId).toBe(rd.id);
    expect(shots[0].t).toBeLessThanOrEqual(slew + main.def.cooldown);
    expect(dn.targetId).toBe(rd.id);
  });

  it('gates the focus-fire bonus on a feasible solution', () => {
    const { sim, dn, rc, fleetA, range } = probe(1.1);
    const withFocus = scoreTarget(sim, dn, fleetA, rc, range);
    fleetA.orders.focusFire = false;
    const withoutFocus = scoreTarget(sim, dn, fleetA, rc, range);
    expect(withFocus).toBeCloseTo(withoutFocus, 9);
    // Inside range and dead ahead the bonus applies as before.
    const near = probe(0.8);
    const bonus = scoreTarget(near.sim, near.dn, near.fleetA, near.rc, near.range);
    near.fleetA.orders.focusFire = false;
    expect(bonus).toBeGreaterThan(scoreTarget(near.sim, near.dn, near.fleetA, near.rc, near.range) * 1.5);
  });

  it('replaces a locked target beyond range as soon as a contact is inside it', () => {
    const { sim, dn, rc, rd, fleetA, range } = probe(1.2, 0.8, 5);
    dn.targetId = rc.id; dn.targetLockUntil = sim.time + 5;
    expect(distance(dn.pos, rc.pos)).toBeLessThan(range * 1.4);
    expect(chooseTarget(sim, dn, fleetA)).toBe(rd.id);
  });

  it('measures slew against the principal mount arc and the hull yaw rate', () => {
    const { sim, dn, rc, rd, range } = probe(0.8, 0.8, 35);
    expect(solutionFeasibility(dn, rc, range).slewSeconds).toBe(0);
    const flank = solutionFeasibility(dn, rd, range);
    const halfArc = dn.weapons.find(w => w.def.id === 'alliance_dn_main')!.def.arc / 2;
    expect(flank.slewSeconds).toBeCloseTo(((35 - halfArc) * Math.PI / 180 - 0.05) / combatYawRate(dn), 6);
    expect(feasibleSolution(flank)).toBe(flank.slewSeconds <= flank.cycle);
    expect(solutionFactor(flank)).toBeLessThan(1);
    expect(solutionFactor(solutionFeasibility(dn, rc, range))).toBe(1);
    // Beyond range the cost is closing time at the hull's own speed.
    rc.pos = v3(0, 0, range * 1.1);
    const beyond = solutionFeasibility(dn, rc, range);
    expect(beyond.inRange).toBe(false);
    expect(beyond.closeSeconds).toBeCloseTo(range * 0.1 / dn.maxSpeed, 6);
    expect(feasibleSolution(beyond)).toBe(false);
    expect(solutionFactor(beyond)).toBeLessThan(0.5);
    expect(sim.finished).toBe(false);
  });
});

describe('Reaper slew-aware fire (RC7)', () => {
  // The audit's slew-probe geometry: a Reaper capital facing +z with
  // dreadnoughts frozen inside beam range; hull yaw stays at the catalogue
  // rate under combat mass (2.16°/s), so a 90° bearing is 25 s away.
  function slewProbe(bearings: number[]) {
    const sim = new BattleSimulation(buildCustomBattle({
      seed: 3, rulesId: 'canon_me3', environment: 'deep_space', startingDistanceKm: 60, maxDuration: 120, theatreLayout: 'legacy_plane',
      sideA: { faction: 'alliance', name: 'V', formation: 'line_abreast', counts: { alliance_dreadnought: bearings.length } },
      sideB: { faction: 'reaper', name: 'S', formation: 'line_abreast', counts: { reaper_capital: 1 } },
    }));
    disarm(sim);
    const shooter = sim.ships.find(s => s.classId === 'reaper_capital')!;
    const victims = sim.ships.filter(s => s.side === 'A');
    const beam = shooter.weapons.find(w => w.def.antiCapital && w.def.arc < 180)!;
    const d = beam.def.range * 0.6;
    shooter.pos = v3(); shooter.heading = v3(0, 0, 1); shooter.vel = v3(); shooter.aiTimer = 0; shooter.targetId = undefined;
    victims.forEach((v, i) => { v.pos = bearing(bearings[i], d); v.heading = v3(0, 0, -1); v.turnRate = 0; });
    freezeTranslation(sim.ships);
    for (const f of sim.fleets.values()) f.anchor = f.spec.side === shooter.side ? v3() : { ...victims[0].pos };
    return { sim, shooter, victims, beam };
  }

  it('fires within 12 s at a 90° bearing by choosing the contact its sector already bears on', () => {
    const { sim, shooter, victims, beam } = slewProbe([90, 30]);
    const shots = firstShots(sim, shooter.id, beam.def.id, 30);
    expect(shots.length).toBeGreaterThan(0);
    expect(shots[0].t).toBeLessThanOrEqual(12);
    expect(shots[0].targetId).toBe(victims[1].id);
  });

  it('keeps the catalogue yaw against a lone flanker: the beam bears after the physical swing, not before', () => {
    const { sim, shooter, beam } = slewProbe([90]);
    const swing = (90 - beam.def.arc / 2) * Math.PI / 180 / combatYawRate(shooter);
    const shots = firstShots(sim, shooter.id, beam.def.id, 40);
    expect(shots.length).toBeGreaterThan(0);
    expect(shots[0].t).toBeGreaterThan(swing * 0.8);
    expect(shots[0].t).toBeLessThanOrEqual(swing + 1);
  });

  it('budgets voluntary target switches per minute for Reaper hulls only', () => {
    const { sim, shooter, victims } = slewProbe([10, 20]);
    expect(switchesPerMinute(shooter)).toBe(3);
    expect(switchesPerMinute(victims[0])).toBeUndefined();
    expect(switchAllowed(victims[0], 100)).toBe(true);
    for (let i = 0; i < 3; i++) { expect(switchAllowed(shooter, 10 + i)).toBe(true); recordSwitch(shooter, 10 + i); }
    expect(switchAllowed(shooter, 20)).toBe(false);
    expect(switchAllowed(shooter, 69.5)).toBe(false);
    expect(switchAllowed(shooter, 70.5)).toBe(true);
    expect(sim.finished).toBe(false);
  });

  it('holds a Reaper capital to its switch budget among many equal contacts', () => {
    const { sim, shooter } = slewProbe([-60, -30, -10, 10, 30, 60]);
    let switches = 0, last = shooter.targetId;
    for (let i = 0; i < Math.round(120 / SIM_DT); i++) {
      sim.step();
      if (shooter.targetId !== last) { if (last !== undefined) switches++; last = shooter.targetId; }
    }
    expect(shooter.stats.shotsFired).toBeGreaterThan(5);
    expect(switches).toBeLessThanOrEqual(2 * 3);
  });
});
