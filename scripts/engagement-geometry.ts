/**
 * How three-dimensional is a battle? Run: node --import tsx/esm scripts/engagement-geometry.ts [seconds] [scale] [seed] [rules]
 *
 * Samples a seeded battle every 5 s and prints, for the hulls that are fighting (fighters excluded):
 *  - thickness: the fleet's extent out of its own best-fit plane, as a share of its extent within it
 *    (0 is a sheet, 1 is as deep as it is wide);
 *  - elevation: the angle between a firing line (ship to its target) and the horizontal, and the share above 15°;
 *  - off the bow: where attackers sit round their targets, as the angle off the target's own bow, and the share
 *    abaft its beam (more than 90° off the bow);
 *  - clearance: pairs of hulls closer than the sum of their radii at the sample.
 * The last line adds the share of armed hulls of each class that fired at least once, and the survivors.
 * Deterministic for a seed. It measures geometry only; it does not judge who wins.
 */
import { BattleSimulation } from '../src/simulation/battle';
import { buildCustomBattle } from '../src/scenarios';
import { sampleGeometry } from '../src/simulation/engagementGeometry';

const seconds = Number(process.argv[2] ?? 120);
const scale = Number(process.argv[3] ?? 3);
const seed = Number(process.argv[4] ?? 42);
const rulesId = process.argv[5] ?? 'prime_apex';

if (process.argv[1]?.endsWith('engagement-geometry.ts')) {
  const sim = new BattleSimulation(buildCustomBattle({
    seed, rulesId, environment: 'deep_space', startingDistanceKm: 60, maxDuration: seconds,
    sideA: { faction: 'alliance', name: 'Alliance line', formation: 'line_abreast', counts: { alliance_dreadnought: 6 * scale, alliance_cruiser: 18 * scale, alliance_frigate: 30 * scale } },
    sideB: { faction: 'reaper', name: 'Reaper pressure', formation: 'strike_wedge', counts: { reaper_capital: 8 * scale, reaper_destroyer: 30 * scale } },
  }));
  let next = 0;
  while (!sim.finished && sim.time < seconds) {
    sim.step();
    if (sim.time >= next) { next += 5; for (const row of sampleGeometry(sim)) console.log(JSON.stringify(row)); }
  }
  const fired: Record<string, string> = {};
  for (const role of ['dreadnought', 'cruiser', 'frigate', 'carrier', 'reaper_capital', 'reaper_destroyer'] as const) {
    const hulls = sim.ships.filter(s => s.role === role);
    if (hulls.length) fired[role] = `${hulls.filter(s => s.stats.shotsFired > 0).length}/${hulls.length}`;
  }
  console.log(JSON.stringify({ finished: sim.finished, time: +sim.time.toFixed(1), result: sim.result?.outcome ?? null, fired,
    alive: { A: sim.ships.filter(s => s.side === 'A' && s.alive && s.role !== 'fighter').length, B: sim.ships.filter(s => s.side === 'B' && s.alive && s.role !== 'fighter').length } }));
}
