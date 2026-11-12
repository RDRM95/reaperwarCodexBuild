import { describe, expect, it } from 'vitest';
import { buildCustomBattle } from '@/scenarios';
import { BattleSimulation } from '@/simulation/battle';
import { shipEngagementRange } from '@/simulation/ai';

/**
 * A fleet reduced to a few hulls fights where they are. Owner's directive: "Ships should prioritise getting weapons
 * into effective firing range rather than endlessly pursuing targets ... Avoid constant circling, tail-chasing".
 *
 * A fleet judged its distance to the enemy, and steered, from its anchor: the middle of the formation it started
 * with. Once only the hulls on one wing were left, their line stood a long way from that point. They could be in
 * range and firing while the anchor was not, so the fleet went on "approaching": it marched its survivors sideways
 * after a target that was itself manoeuvring round them, and the pair circled each other for the rest of the
 * battle while everything else tried to catch up. One Custom Battle ran to its 300 s limit this way.
 */
describe('a depleted fleet', () => {
  it('whose last two dreadnoughts are on the far wing stops and fights instead of circling its target', () => {
    const sim = new BattleSimulation(buildCustomBattle({ seed: 5, rulesId: 'canon_me3', environment: 'deep_space', theatreLayout: 'three_dimensional', startingDistanceKm: 60, maxDuration: 400,
      sideA: { faction: 'alliance', name: 'A', formation: 'line_abreast', counts: { alliance_dreadnought: 8, alliance_carrier: 1, alliance_cruiser: 16, alliance_frigate: 30, alliance_frigate_thanix: 1 } },
      sideB: { faction: 'reaper', name: 'B', formation: 'line_abreast', counts: { reaper_destroyer: 1 } } }));
    // Only the two dreadnoughts on one end of the line are left of the whole fleet. Nothing can be destroyed.
    const line = sim.ships.filter(s => s.side === 'A' && s.role === 'dreadnought').sort((a, b) => a.slot.x - b.slot.x);
    const left = line.slice(6);
    for (const s of sim.ships) if (s.side === 'A' && !left.includes(s)) { s.alive = false; s.destroyedAt = 0; if (s.hangar) s.hangar.remaining = 0; }
    const destroyer = sim.ships.find(s => s.side === 'B')!, fleet = sim.fleets.get(left[0].fleetId)!;
    destroyer.maxHull = destroyer.hull = 1e12;
    for (const s of left) s.maxHull = s.hull = 1e12;
    // Their places are 19 and 20 units (48 and 50 km) across from the middle of the formation: more than their range.
    expect(Math.abs(left[0].slot.x)).toBeGreaterThan(shipEngagementRange(left[0]));

    let firstInRange = -1, flown = 0, moving = 0, ticks = 0, modeAt100: string | undefined;
    const previous = left.map(s => ({ ...s.pos }));
    while (!sim.finished && sim.time < 300) {
      sim.step();
      const gap = Math.min(...left.map(s => Math.hypot(destroyer.pos.x - s.pos.x, destroyer.pos.y - s.pos.y, destroyer.pos.z - s.pos.z)));
      if (firstInRange < 0 && gap <= shipEngagementRange(left[0]) * 0.93) firstInRange = sim.time;
      left.forEach((s, i) => {
        if (firstInRange >= 0) flown += Math.hypot(s.pos.x - previous[i].x, s.pos.y - previous[i].y, s.pos.z - previous[i].z);
        previous[i] = { ...s.pos };
      });
      if (firstInRange >= 0) { ticks++; if (left.some(s => Math.hypot(s.vel.x, s.vel.y, s.vel.z) > s.maxSpeed * 0.3)) moving++; }
      if (modeAt100 === undefined && sim.time >= 100) modeAt100 = fleet.engagementMode;
    }
    // Measured: in range at 22 s; from then the two hulls fly 5.7 units between them (7 km each) and are under way
    // 5 % of the time; the fleet is holding at 100 s; they fire 382 shots each. Before: 139.9 units (175 km each),
    // under way the whole time, the fleet "approaching" throughout, 384 and 379 shots.
    expect(firstInRange).toBeGreaterThan(0);
    expect(firstInRange).toBeLessThan(40);
    expect(flown).toBeLessThan(20);
    expect(moving / ticks).toBeLessThan(0.2);
    expect(modeAt100).toBe('hold');
    for (const s of left) expect(s.stats.shotsFired).toBeGreaterThan(300);
  });
});
