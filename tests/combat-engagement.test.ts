import { describe, expect, it } from 'vitest';
import { buildCustomBattle, buildScenario } from '@/scenarios';
import { BattleSimulation } from '@/simulation/battle';
import {
  BEAM_BEARING, CLOSING_SPRINT, IN_REACH, SPRINT_FULL_AT, aspectAgainst, batteryAspect, chooseTarget, closingSprint, secondsToDestroy,
  shipEngagementRange,
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
  // One hull of each kind under canon rules, with a Reaper and a Cerberus enemy to judge against.
  const meeting = (enemy: 'reaper' | 'cerberus') => new BattleSimulation(buildCustomBattle({ seed: 5, rulesId: 'canon_me3', environment: 'deep_space', startingDistanceKm: 60, maxDuration: 400,
    sideA: { faction: 'alliance', name: 'A', formation: 'line_abreast', counts: { alliance_dreadnought: 1, alliance_cruiser: 1, alliance_carrier: 1 } },
    sideB: enemy === 'reaper' ? { faction: 'reaper', name: 'B', formation: 'line_abreast', counts: { reaper_capital: 1, reaper_destroyer: 1 } }
      : { faction: 'cerberus', name: 'B', formation: 'line_abreast', counts: { cerberus_cruiser: 1, cerberus_dreadnought: 1 } } }));

  it('what each battery of a hull throws: a cruiser and a carrier more on the beam, a dreadnought with its refit gun more ahead', () => {
    // An Alliance cruiser: 159 damage a second ahead, 240 on either beam (two of its four broadside batteries).
    const cruiser = batteryAspect(one('alliance_cruiser'));
    expect(cruiser.starboard).toBeGreaterThan(cruiser.bow * 1.4);
    expect(cruiser.port).toBeCloseTo(cruiser.starboard, 6);
    expect(cruiser.beamRange).toBeCloseTo(12.8, 6);
    expect(batteryAspect(one('alliance_carrier')).aspect).toBe('beam');
    expect(batteryAspect(one('alliance_carrier')).bow).toBe(0);
    const dreadnought = batteryAspect(one('alliance_dreadnought'));
    expect(dreadnought.bow).toBeGreaterThan(dreadnought.starboard);
    for (const id of ['alliance_frigate', 'reaper_capital', 'reaper_destroyer']) expect(batteryAspect(one(id)).aspect, id).toBe('bow');
    for (const id of ['reaper_capital', 'reaper_destroyer']) expect(batteryAspect(one(id)).bowOnly, id).toBe(true);
  });

  it('a hull turns to its target the battery that would destroy that target soonest', () => {
    const reapers = meeting('reaper'), cerberus = meeting('cerberus');
    const of = (battle: BattleSimulation, classId: string) => battle.ships.find(s => s.classId === classId)!;
    // Against a Sovereign a canon dreadnought's broadside throws 350 damage a second to its spinal gun's 250, and
    // that is what the first version of this rule compared. But a broadside round reaches a Reaper's hull at 15 %
    // of its strength and a spinal round at 89 %: expected seconds to destroy it are 312 ahead and 730 abeam at
    // the catalogue's rates, more with misses.
    const dreadnought = of(reapers, 'alliance_dreadnought'), sovereign = of(reapers, 'reaper_capital');
    const ahead = secondsToDestroy(dreadnought, sovereign, 0), abeam = secondsToDestroy(dreadnought, sovereign, BEAM_BEARING);
    expect(batteryAspect(dreadnought).starboard).toBeGreaterThan(batteryAspect(dreadnought).bow * 1.3);
    expect(abeam).toBeGreaterThan(ahead * 2);
    for (const hull of ['alliance_dreadnought', 'alliance_cruiser']) for (const target of ['reaper_capital', 'reaper_destroyer'])
      expect(aspectAgainst(of(reapers, hull), of(reapers, target)), `${hull} against ${target}`).toBe('bow');
    // It then fights at the range of its main gun, not of its broadside.
    expect(shipEngagementRange(dreadnought)).toBeCloseTo(20, 6);
    // A carrier has nothing that bears ahead: it turns a side to anything.
    expect(aspectAgainst(of(reapers, 'alliance_carrier'), sovereign)).toBe('beam');
    // Against a lightly armoured cruiser the broadside is the quicker battery; against a dreadnought the main gun.
    expect(aspectAgainst(of(cerberus, 'alliance_cruiser'), of(cerberus, 'cerberus_cruiser'))).toBe('beam');
    expect(shipEngagementRange(of(cerberus, 'alliance_cruiser'))).toBeCloseTo(12.8, 6);
    expect(aspectAgainst(of(cerberus, 'alliance_dreadnought'), of(cerberus, 'cerberus_dreadnought'))).toBe('bow');
  });

  const stand = (classId: string, enemy: { faction: 'reaper' | 'cerberus'; classId: string }) => {
    const fight = new BattleSimulation(buildCustomBattle({ seed: 5, rulesId: 'canon_me3', environment: 'deep_space', startingDistanceKm: 60, maxDuration: 400,
      sideA: { faction: 'alliance', name: 'A', formation: 'line_abreast', counts: { [classId]: 1 } },
      sideB: { faction: enemy.faction, name: 'B', formation: 'line_abreast', counts: { [enemy.classId]: 1 } } }));
    const hull = fight.ships.find(s => s.side === 'A')!, target = fight.ships.find(s => s.side === 'B' && s.role !== 'fighter')!;
    // Neither can be killed and the target stays where it is and holds its fire, so the hull has all the time it wants.
    target.maxHull = target.hull = 1e12; hull.maxHull = hull.hull = 1e12; target.weapons.length = 0; target.hangar = undefined;
    fight.issueOrders(target.fleetId, { order: 'hold_formation' });
    let off = 0, samples = 0, next = 60;
    while (!fight.finished && fight.time < 150) {
      fight.step();
      if (fight.time < next) continue;
      next += 5;
      const d = gap(hull, target);
      const cos = ((target.pos.x - hull.pos.x) * hull.heading.x + (target.pos.y - hull.pos.y) * hull.heading.y + (target.pos.z - hull.pos.z) * hull.heading.z) / d;
      off += Math.acos(Math.max(-1, Math.min(1, cos))); samples++;
    }
    const fired = (weaponId: string) => fight.events.filter(event => event.type === 'weapon_fired' && event.shipId === hull.id && event.weaponId === weaponId).length;
    return { off: off / samples, samples, fired };
  };

  it.each([
    ['alliance_carrier', { faction: 'reaper', classId: 'reaper_destroyer' }],
    ['alliance_cruiser', { faction: 'cerberus', classId: 'cerberus_cruiser' }],
  ] as const)('an %s whose broadside is its best battery turns a side to its target and fires it', (classId, enemy) => {
    const { off, samples, fired } = stand(classId, enemy);
    // Measured: from 60 s on the target sits 80 degrees (carrier) and 79 degrees (cruiser) off the bow, and the
    // broadside fires 162 and 160 times in the two and a half minutes.
    expect(samples).toBe(19);
    expect(off).toBeGreaterThan(BEAM_BEARING - 0.06);
    expect(off).toBeLessThan(BEAM_BEARING + 0.06);
    expect(fired('alliance_broadside')).toBeGreaterThan(120);
  });

  it.each([
    ['alliance_dreadnought', 'reaper_capital', 'alliance_dn_main'],
    ['alliance_cruiser', 'reaper_destroyer', 'alliance_cruiser_main'],
  ] as const)('an %s keeps its bow and its main gun on a %s', (classId, target, mainGun) => {
    const { off, fired } = stand(classId, { faction: 'reaper', classId: target });
    // Measured: the target dead ahead from 60 s on; the main gun fires 34 times (dreadnought) and 46 times (cruiser)
    // in the two and a half minutes and the broadside not at all. Under the first version of the rule both hulls
    // stood 80 degrees off, the dreadnought's main gun fell silent once it was in broadside range, and its
    // broadside did the firing.
    expect(off).toBeLessThan(0.1);
    expect(fired(mainGun)).toBeGreaterThan(20);
    expect(fired('alliance_broadside')).toBe(0);
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

  it('in a long fight four fifths of hull-time is spent firing', () => {
    const report = measureActivity(custom(1, 'canon_me3'), 300);
    const totals = hullTotals(report);
    const row = (key: string) => report.rows.get(key)!;
    const firing = (key: string) => row(key).seconds.firing / row(key).hullSeconds;
    // Measured, seed 1 (before the combat overhaul in brackets): all hulls firing 88 % (78 %), chasing or idle
    // 0.6 %; Alliance dreadnoughts 72 % (66 %) and 33 shots a hull-minute (32); cruisers 75 % and 46 shots (70 %,
    // 51); frigates 93 % (79 %); the carrier 40 % and 75 shots (never fired); Reaper capitals and destroyers 94 %.
    //
    // Shots a minute were pinned at 50 for dreadnoughts and 55 for cruisers while both stood beam-on to Reapers
    // and counted broadside rounds (75 and 62 a minute). Those rounds reach a Reaper's hull at 15 % of their
    // strength. Bow-on they fire fewer, heavier rounds: this fleet destroyed one Reaper of twelve in each of four
    // seeds beam-on and two to four bow-on. The floors are now on what the main guns do.
    expect(totals.share.firing).toBeGreaterThan(0.76);
    expect(totals.share.chasing + totals.share.idle).toBeLessThan(0.05);
    expect(firing('A dreadnought')).toBeGreaterThan(0.62);
    expect(row('A dreadnought').shots / (row('A dreadnought').hullSeconds / 60)).toBeGreaterThan(24);
    expect(row('A cruiser').shots / (row('A cruiser').hullSeconds / 60)).toBeGreaterThan(32);
    expect(firing('A frigate')).toBeGreaterThan(0.8);
    expect(row('A carrier').shots).toBeGreaterThan(0);
    // The Reapers are judged over four seeds, not this one. At one seed the capitals' share swings by ten points
    // with how the battle ends: 94 % when this was first pinned, then 88 %, 84 % and 73 % as other things changed,
    // while over four seeds it was 83 % and is 80 % (destroyers 88 % and 91 %). The floor on the four-seed figure
    // is 0.72: Reaper capitals fire at least seven tenths of the time. When they are silent with a target in
    // range it is outside their 70-degree bow arc while they turn at three degrees a second.
    let capital = 0, capitalSeconds = 0, destroyer = 0, destroyerSeconds = 0;
    for (const seed of [1, 2, 3, 4]) {
      const rows = seed === 1 ? report.rows : measureActivity(custom(seed, 'canon_me3'), 300).rows;
      capital += rows.get('B reaper_capital')!.seconds.firing; capitalSeconds += rows.get('B reaper_capital')!.hullSeconds;
      destroyer += rows.get('B reaper_destroyer')!.seconds.firing; destroyerSeconds += rows.get('B reaper_destroyer')!.hullSeconds;
    }
    expect(capital / capitalSeconds).toBeGreaterThan(0.72);
    expect(destroyer / destroyerSeconds).toBeGreaterThan(0.82);
    // A hull keeps a target for about half a minute at a time: 2.3 changes a hull-minute (2.7).
    expect(totals.targetChangesPerMinute).toBeLessThan(3);
  });

  it('where one side has seven hulls to one, most of its escorts still fight', () => {
    const report = measureActivity(new BattleSimulation(buildScenario('battle_of_earth', 'prime_apex', 1)), 300);
    const row = (key: string) => report.rows.get(key)!;
    const firing = (key: string) => row(key).seconds.firing / row(key).hullSeconds;
    // Measured over seeds 1 to 3 (before the combat overhaul, seed 1, in brackets): all hulls firing 52 to 58 %
    // (50 %), frigates 68 to 76 % (63 %), cruisers 35 to 44 % (34 %), dreadnoughts 25 to 31 % (25 %). Ninety hulls
    // cannot all reach ten Reapers and a late reinforcement at once, and the dreadnoughts are too slow to arrive
    // before the escorts have finished: the rest of their time is the approach.
    //
    // Seed 1 alone read 61 %, 77 % and 50 % while cruisers stood beam-on to Reapers with their broadsides, and
    // reads 52.5 %, 68 % and 35 % now that they keep their main gun on them; seeds 2 and 3 moved by four points or
    // less either way. The floors are on the three-seed mean.
    const seeds = [report, ...[2, 3].map(seed => measureActivity(new BattleSimulation(buildScenario('battle_of_earth', 'prime_apex', seed)), 300))];
    const mean = (of: (r: typeof report) => number) => seeds.reduce((sum, r) => sum + of(r), 0) / seeds.length;
    const share = (key: string) => (r: typeof report) => r.rows.get(key)!.seconds.firing / r.rows.get(key)!.hullSeconds;
    expect(mean(r => hullTotals(r).share.firing)).toBeGreaterThan(0.52);
    expect(mean(share('A frigate'))).toBeGreaterThan(0.66);
    expect(mean(share('A cruiser'))).toBeGreaterThan(0.34);
    expect(firing('B reaper_capital')).toBeGreaterThan(0.9);
  });
});
