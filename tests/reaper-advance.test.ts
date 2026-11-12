import { describe, expect, it } from 'vitest';
import { buildCustomBattle } from '@/scenarios';
import { BattleSimulation } from '@/simulation/battle';
import { pressOf, REAPER_PRESS } from '@/simulation/ai';
import { ATTACK_SWING } from '@/simulation/manoeuvre';

/**
 * Reaper capitals advance as individuals. Owner's report: "ships reaper still move a bit too rigid, like they are
 * all in a line". Measured on the default Custom Battle (canon_me3, three seeds, 40 to 140 s): the capitals moved in
 * unison (mean alignment of their velocities 0.73, where 1 is identical and 0 unrelated), stood within 1.1 km of one
 * level, and their nearest neighbour was 41° off abreast. Their attack swing was 3° to 12° and the class line put
 * every one of them at the same distance from the enemy.
 */
function capitals(scale: number) {
  let alignment = 0, pairs = 0, height = 0, samples = 0, firing = 0, looks = 0;
  for (const seed of [1, 2, 3]) {
    const sim = new BattleSimulation(buildCustomBattle({
      seed, rulesId: 'canon_me3', environment: 'deep_space', theatreLayout: 'three_dimensional', startingDistanceKm: 76, maxDuration: 420,
      sideA: { faction: 'alliance', name: 'Alliance Task Force', formation: 'line_abreast', counts: { alliance_dreadnought: 8 * scale, alliance_carrier: scale, alliance_cruiser: 16 * scale, alliance_frigate: 30 * scale, alliance_frigate_thanix: scale } },
      sideB: { faction: 'reaper', name: 'Reaper harvest group', formation: 'strike_wedge', counts: { reaper_capital: 4 * scale, reaper_destroyer: 8 * scale } },
    }));
    const shots = new Map<string, number>();
    let next = 40;
    while (!sim.finished && sim.time < 140) {
      sim.step();
      if (sim.time < next) continue;
      next += 10;
      const ships = sim.ships.filter(s => s.alive && s.role === 'reaper_capital');
      if (ships.length < 3) continue;
      const moving = ships.filter(s => Math.hypot(s.vel.x, s.vel.y, s.vel.z) > 0.02);
      for (let i = 0; i < moving.length; i++) for (let j = 0; j < i; j++) {
        const a = moving[i].vel, b = moving[j].vel;
        alignment += (a.x * b.x + a.y * b.y + a.z * b.z) / (Math.hypot(a.x, a.y, a.z) * Math.hypot(b.x, b.y, b.z));
        pairs++;
      }
      const mean = ships.reduce((n, s) => n + s.pos.y, 0) / ships.length;
      height += Math.sqrt(ships.reduce((n, s) => n + (s.pos.y - mean) ** 2, 0) / ships.length);
      samples++;
      for (const s of ships) {
        if (shots.has(s.id)) { looks++; if (s.stats.shotsFired > shots.get(s.id)!) firing++; }
        shots.set(s.id, s.stats.shotsFired);
      }
    }
  }
  return { alignment: alignment / pairs, height: height / samples, firing: firing / looks };
}

describe('Reaper capitals advance as individuals', () => {
  it('each capital fights at its own distance, fixed for the battle, across the whole span', () => {
    const ids = Array.from({ length: 40 }, (_, i) => ({ id: `reaper-fleet-reaper_capital-${i + 1}` }) as never);
    const presses = ids.map(pressOf);
    for (const press of presses) { expect(press).toBeGreaterThanOrEqual(0); expect(press).toBeLessThanOrEqual(1); }
    expect(Math.min(...presses)).toBeLessThan(0.15);
    expect(Math.max(...presses)).toBeGreaterThan(0.85);
    expect(ids.map(pressOf)).toEqual(presses);
    // Always inside its guns and never nearer than a capital's minimum (0.50 of range).
    expect(REAPER_PRESS[0]).toBeGreaterThanOrEqual(0.5);
    expect(REAPER_PRESS[1]).toBeLessThanOrEqual(0.9);
    // A wider swing than the 3° to 12° that kept them shoulder to shoulder, short of a destroyer's.
    expect(ATTACK_SWING.reaper_capital![1]).toBeGreaterThan(20 * Math.PI / 180);
    expect(ATTACK_SWING.reaper_capital![1]).toBeLessThan(ATTACK_SWING.reaper_destroyer![1]);
  });

  it('in battle they no longer move in unison or on one level, and they keep firing', () => {
    const now = capitals(1);
    // Measured: velocity alignment 0.40 (0.73 before capitals advanced as individuals), height spread 2.1 km
    // (1.1 km), and a capital fires in 82 % of ten-second looks. That was 91 % until frigates swung wider round
    // their targets: they now get astern of a capital, which takes half a minute to come about, so it spends more
    // of its time turning. A preference for targets ahead was tried and dropped: it kept capitals on targets at the
    // edge of their range and cut their firing further.
    expect(now.alignment).toBeLessThan(0.62);
    expect(now.height).toBeGreaterThan(1.6);
    expect(now.firing).toBeGreaterThan(0.75);
  });
});
