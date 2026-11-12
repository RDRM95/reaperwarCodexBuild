import { describe, expect, it } from 'vitest';
import { buildCustomBattle, buildScenario } from '@/scenarios';
import { BattleSimulation } from '@/simulation/battle';
import {
  BEAM_BEARING, CLOSING_SPRINT, IN_REACH, SPRINT_FULL_AT, batteryAspect, chooseTarget, closingSprint, shipEngagementRange,
} from '@/simulation/ai';
import { hullTotals, measureActivity } from '@/simulation/combatActivity';
import type { ShipState } from '@/simulation/types';

/**
 * Fighting, not chasing. Owner's report: "The simulator currently spends too much time showing ships chasing one
 * another rather than fighting." Measured on the build before this change (scripts/combat-activity.ts), in the
 * large battles Alliance hulls were firing 25 to 55 % of the time and flying toward targets beyond their guns 40
 * to 60 % of it. Three causes, each with its own test below:
 *   - a whole fleet chose one target and flew at it past enemies it could have been shooting;
 *   - cruisers and carriers carry most of their fire in side batteries, which never bore while every hull stood
 *     bow-on to its target;
 *   - hulls crossed to an out-ranging enemy at combat speed.
 */
const duel = (counts: { a: Record<string, number>; b: Record<string, number> }, seed = 5, rulesId = 'canon_me3') =>
  new BattleSimulation(buildCustomBattle({ seed, rulesId, environment: 'deep_space', startingDistanceKm: 60, maxDuration: 400,
    sideA: { faction: 'alliance', name: 'A', formation: 'line_abreast', counts: counts.a },
    sideB: { faction: 'reaper', name: 'B', formation: 'line_abreast', counts: counts.b } }));
const place = (ship: ShipState, x: number, y: number, z: number) => { ship.pos = { x, y, z }; ship.prevPos = { x, y, z }; ship.vel = { x: 0, y: 0, z: 0 }; };
const gap = (a: ShipState, b: ShipState) => Math.hypot(a.pos.x - b.pos.x, a.pos.y - b.pos.y, a.pos.z - b.pos.z);

describe('choosing a target', () => {
  const setup = () => {
    const sim = duel({ a: { alliance_frigate: 1 }, b: { reaper_capital: 1, reaper_destroyer: 1 } });
    const frigate = sim.ships.find(s => s.role === 'frigate')!, capital = sim.ships.find(s => s.role === 'reaper_capital')!, destroyer = sim.ships.find(s => s.role === 'reaper_destroyer')!;
    const fleet = sim.fleets.get(frigate.fleetId)!, range = shipEngagementRange(frigate);
    place(frigate, 0, 0, 0);
    return { sim, frigate, capital, destroyer, fleet, range };
  };

  it('a hull fights an enemy it can reach, not a more valuable one it cannot', () => {
    const { sim, frigate, capital, destroyer, fleet, range } = setup();
    place(capital, 0, 0, range * 1.6); place(destroyer, range * 0.8, 0, 0);
    // With nothing in reach it takes the capital: the greater threat, and the fleet's focus.
    place(destroyer, range * 3, 0, 0);
    expect(chooseTarget(sim, frigate, fleet)).toBe(capital.id);
    // The destroyer comes inside its guns: it changes at once, though it has just locked onto the capital.
    frigate.targetId = capital.id; frigate.targetLockUntil = sim.time + 5;
    place(destroyer, range * 0.8, 0, 0);
    expect(chooseTarget(sim, frigate, fleet)).toBe(destroyer.id);
    // And it does not leave a target in reach for one out of reach, however valuable.
    frigate.targetId = destroyer.id; frigate.targetLockUntil = 0;
    expect(chooseTarget(sim, frigate, fleet)).toBe(destroyer.id);
    // "In reach" is a little inside the gun's range: a target on the very edge does not break a lock.
    frigate.targetId = capital.id; frigate.targetLockUntil = sim.time + 5;
    place(destroyer, range * (IN_REACH + 0.02), 0, 0);
    expect(chooseTarget(sim, frigate, fleet)).toBe(capital.id);
    place(destroyer, range * (IN_REACH - 0.02), 0, 0);
    expect(chooseTarget(sim, frigate, fleet)).toBe(destroyer.id);
  });

  it('a commanded target is kept whatever else is in reach', () => {
    const { sim, frigate, capital, destroyer, fleet, range } = setup();
    place(capital, 0, 0, range * 1.6); place(destroyer, range * 0.8, 0, 0);
    sim.issueOrders(fleet.spec.id, { order: 'attack_target', targetId: capital.id });
    expect(chooseTarget(sim, frigate, fleet)).toBe(capital.id);
  });

  it('a fleet spreads its fire instead of every hull taking the same target', () => {
    const sim = new BattleSimulation(buildScenario('battle_of_earth', 'prime_apex', 1));
    while (sim.time < 15) sim.step();
    const hulls = sim.ships.filter(s => s.side === 'A' && s.alive && s.role !== 'fighter');
    const reapers = sim.ships.filter(s => s.side === 'B' && s.alive && s.role !== 'fighter');
    const aimedAt = new Map<string, number>();
    for (const hull of hulls) if (hull.targetId) aimedAt.set(hull.targetId, (aimedAt.get(hull.targetId) ?? 0) + 1);
    // Measured: the ten Reapers have 30, 18, 16, 6, 5, 5, 5, 1, 1 and 1 of the 88 hulls on them. Before, all 88 were
    // on one capital that none of them could reach.
    expect(Math.max(...aimedAt.values()) / hulls.length).toBeLessThan(0.45);
    expect(reapers.filter(r => aimedAt.has(r.id)).length).toBeGreaterThanOrEqual(8);
  });

  it('a hull whose target dies has a new one on the next tick', () => {
    const sim = new BattleSimulation(buildScenario('battle_of_earth', 'prime_apex', 1));
    let stale = 0, deaths = 0;
    while (!sim.finished && sim.time < 70) {
      const alive = new Set(sim.ships.filter(s => s.alive && !s.escaped).map(s => s.id));
      sim.step();
      for (const ship of sim.ships) {
        if (!ship.alive || ship.escaped || !ship.targetId) continue;
        const target = sim.getShip(ship.targetId)!;
        // A target that died during this very tick is replaced on the next; one that was already gone is stale.
        if (target.alive && !target.escaped) continue;
        if (alive.has(target.id)) deaths++; else stale++;
      }
    }
    // Before, a hull kept a dead target until its next decision, up to three seconds, and flew back toward its
    // place in the formation meanwhile.
    expect(deaths).toBeGreaterThan(0);
    expect(stale).toBe(0);
  });
});

describe('how a hull presents its guns', () => {
  const sim = new BattleSimulation(buildScenario('battle_of_earth', 'prime_apex', 1));
  const one = (classId: string) => sim.ships.find(s => s.classId === classId)!;

  it('cruisers and carriers fight on the beam; dreadnoughts, frigates and Reapers bow-on', () => {
    // An Alliance cruiser: 159 damage a second ahead, 240 on either beam (two of its four broadside batteries).
    const cruiser = batteryAspect(one('alliance_cruiser'));
    expect(cruiser.aspect).toBe('beam');
    expect(cruiser.starboard).toBeGreaterThan(cruiser.bow * 1.4);
    expect(cruiser.port).toBeCloseTo(cruiser.starboard, 6);
    // It engages at the range of those batteries, which is longer than its spinal gun's.
    expect(shipEngagementRange(one('alliance_cruiser'))).toBeCloseTo(cruiser.beamRange, 9);
    expect(cruiser.beamRange).toBeCloseTo(12.8, 6);
    expect(batteryAspect(one('alliance_carrier')).aspect).toBe('beam');
    expect(batteryAspect(one('alliance_carrier')).bow).toBe(0);
    // A dreadnought's spinal gun out-shoots one side of its broadside.
    const dreadnought = batteryAspect(one('alliance_dreadnought'));
    expect(dreadnought.aspect).toBe('bow');
    expect(dreadnought.bow).toBeGreaterThan(dreadnought.starboard);
    expect(shipEngagementRange(one('alliance_dreadnought'))).toBeCloseTo(17.6, 6);
    for (const id of ['alliance_frigate', 'reaper_capital', 'reaper_destroyer']) expect(batteryAspect(one(id)).aspect, id).toBe('bow');
  });

  it.each(['alliance_cruiser', 'alliance_carrier'])('an %s in range turns a side to its target and fires its broadside', (classId) => {
    const fight = duel({ a: { [classId]: 1 }, b: { reaper_destroyer: 1 } });
    const hull = fight.ships.find(s => s.side === 'A')!, destroyer = fight.ships.find(s => s.role === 'reaper_destroyer')!;
    // Neither can be killed and the destroyer stays where it is, so the hull has all the time it wants.
    destroyer.maxHull = destroyer.hull = 1e12; hull.maxHull = hull.hull = 1e12;
    fight.issueOrders(destroyer.fleetId, { order: 'hold_formation' });
    let off = 0, samples = 0, next = 60;
    while (!fight.finished && fight.time < 150) {
      fight.step();
      if (fight.time < next) continue;
      next += 5;
      const d = gap(hull, destroyer);
      const cos = ((destroyer.pos.x - hull.pos.x) * hull.heading.x + (destroyer.pos.y - hull.pos.y) * hull.heading.y + (destroyer.pos.z - hull.pos.z) * hull.heading.z) / d;
      if (d <= batteryAspect(hull).beamRange) { off += Math.acos(Math.max(-1, Math.min(1, cos))); samples++; }
    }
    let broadsides = 0;
    for (const event of fight.events) if (event.type === 'weapon_fired' && event.shipId === hull.id && event.weaponId === 'alliance_broadside') broadsides++;
    // Measured: from 60 s on the target sits 79 degrees (cruiser) and 80 degrees (carrier) off the bow, and the
    // broadside fires 160 and 161 times in the two and a half minutes. Before, each stood bow-on: the cruiser's
    // broadside never fired at its target and the carrier, which has no other guns, never fired at all.
    expect(samples).toBe(19);
    expect(off / samples).toBeGreaterThan(BEAM_BEARING - 0.06);
    expect(off / samples).toBeLessThan(BEAM_BEARING + 0.06);
    expect(broadsides).toBeGreaterThan(120);
  });
});

describe('the closing sprint', () => {
  it('rises from nothing at gun range to full at one and a half ranges; Reapers never sprint', () => {
    const sim = duel({ a: { alliance_cruiser: 1 }, b: { reaper_capital: 1, reaper_destroyer: 1 } });
    const cruiser = sim.ships.find(s => s.role === 'cruiser')!;
    expect(closingSprint(cruiser, 9, 10)).toBe(1);
    expect(closingSprint(cruiser, 10, 10)).toBe(1);
    expect(closingSprint(cruiser, 12.5, 10)).toBeCloseTo(1 + (CLOSING_SPRINT - 1) / 2, 9);
    expect(closingSprint(cruiser, 10 * SPRINT_FULL_AT, 10)).toBe(CLOSING_SPRINT);
    expect(closingSprint(cruiser, 80, 10)).toBe(CLOSING_SPRINT);
    for (const reaper of sim.ships.filter(s => s.faction === 'reaper')) expect(closingSprint(reaper, 80, 10)).toBe(1);
  });

  it('a hull beyond its guns drives faster than its combat speed and is back to it once in range', () => {
    const sim = duel({ a: { alliance_cruiser: 1 }, b: { reaper_destroyer: 1 } });
    const cruiser = sim.ships.find(s => s.role === 'cruiser')!, destroyer = sim.ships.find(s => s.role === 'reaper_destroyer')!;
    destroyer.maxHull = destroyer.hull = 1e12;
    sim.issueOrders(destroyer.fleetId, { order: 'hold_formation' });
    place(destroyer, 0, 0, 60);
    place(cruiser, 0, 0, 0);
    const speed = () => Math.hypot(cruiser.vel.x, cruiser.vel.y, cruiser.vel.z) / cruiser.maxSpeed;
    let fastest = 0, inRange = 0, inRangeSamples = 0;
    while (sim.time < 160 && cruiser.alive) {
      sim.step();
      const d = gap(cruiser, destroyer), range = shipEngagementRange(cruiser);
      if (d > range * SPRINT_FULL_AT) fastest = Math.max(fastest, speed());
      if (d < range * 0.9 && sim.tick % 20 === 0) { inRange = Math.max(inRange, speed()); inRangeSamples++; }
    }
    // Measured: it reaches twice its combat speed on the way in, and never exceeds combat speed once inside its guns.
    expect(fastest).toBeGreaterThan(1.8);
    expect(fastest).toBeLessThanOrEqual(CLOSING_SPRINT + 1e-6);
    expect(inRangeSamples).toBeGreaterThan(10);
    expect(inRange).toBeLessThanOrEqual(1 + 1e-6);
  });
});

describe('what hulls spend a battle doing', () => {
  const custom = (seed: number, rulesId: string) => new BattleSimulation(buildCustomBattle({ seed, rulesId, environment: 'deep_space', theatreLayout: 'three_dimensional', startingDistanceKm: 76, maxDuration: 300,
    sideA: { faction: 'alliance', name: 'Alliance Task Force', formation: 'line_abreast', counts: { alliance_dreadnought: 8, alliance_carrier: 1, alliance_cruiser: 16, alliance_frigate: 30, alliance_frigate_thanix: 1 } },
    sideB: { faction: 'reaper', name: 'Reaper harvest group', formation: 'strike_wedge', counts: { reaper_capital: 4, reaper_destroyer: 8 } } } as never));

  it('in a long fight four fifths of hull-time is spent firing, and dreadnoughts fire twice as often as they did', () => {
    const report = measureActivity(custom(1, 'canon_me3'), 300);
    const totals = hullTotals(report);
    const row = (key: string) => report.rows.get(key)!;
    const firing = (key: string) => row(key).seconds.firing / row(key).hullSeconds;
    // Measured, seed 1 (before this change in brackets): all hulls firing 84 % (78 %), chasing or idle 2.5 %;
    // Alliance dreadnoughts 71 % (66 %) and 66 shots a hull-minute (32); cruisers 67 % and 62 shots (70 %, 51);
    // frigates 87 % and 51 shots (79 %, 42); the carrier 19 % and 21 shots (never fired); Reaper capitals and
    // destroyers 94 %. Seed 2: all hulls 78 %, the carrier 73 %.
    expect(totals.share.firing).toBeGreaterThan(0.76);
    expect(totals.share.chasing + totals.share.idle).toBeLessThan(0.05);
    expect(firing('A dreadnought')).toBeGreaterThan(0.62);
    expect(row('A dreadnought').shots / (row('A dreadnought').hullSeconds / 60)).toBeGreaterThan(50);
    expect(row('A cruiser').shots / (row('A cruiser').hullSeconds / 60)).toBeGreaterThan(55);
    expect(firing('A frigate')).toBeGreaterThan(0.8);
    expect(row('A carrier').shots).toBeGreaterThan(0);
    expect(firing('B reaper_capital')).toBeGreaterThan(0.85);
    expect(firing('B reaper_destroyer')).toBeGreaterThan(0.85);
    // A hull keeps a target for about half a minute at a time: 2.3 changes a hull-minute (2.7).
    expect(totals.targetChangesPerMinute).toBeLessThan(3);
  });

  it('where one side has seven hulls to one, most of its escorts still fight', () => {
    const report = measureActivity(new BattleSimulation(buildScenario('battle_of_earth', 'prime_apex', 1)), 300);
    const row = (key: string) => report.rows.get(key)!;
    const firing = (key: string) => row(key).seconds.firing / row(key).hullSeconds;
    // Measured, seed 1 (before this change in brackets): all hulls firing 61 % (50 %), frigates 77 % (63 %),
    // cruisers 50 % and 37 shots a hull-minute (34 %, 26), dreadnoughts 26 % (25 %). Ninety hulls cannot all reach
    // ten Reapers and a late reinforcement at once, and the dreadnoughts are too slow to arrive before the escorts
    // have finished: the rest of their time is the approach.
    expect(hullTotals(report).share.firing).toBeGreaterThan(0.55);
    expect(firing('A frigate')).toBeGreaterThan(0.7);
    expect(firing('A cruiser')).toBeGreaterThan(0.42);
    expect(firing('B reaper_capital')).toBeGreaterThan(0.9);
  });
});
