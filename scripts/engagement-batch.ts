/**
 * Outcome and geometry of one battle averaged over many seeds. Run: node --import tsx/esm scripts/engagement-batch.ts [seeds] [rules] [order]
 *
 * A single seeded battle is chaotic: two builds that differ by almost nothing diverge by about a fifth in who
 * hits what. Use this, not one seed, to judge whether a movement change makes a fleet fight better or worse.
 * 54 Alliance hulls against 38 Reapers for up to 150 s per seed; prints the means. Deterministic.
 * `order` gives the Alliance fleet a standing order at the start (for example hold_formation or withdraw).
 */
import { BattleSimulation } from '../src/simulation/battle';
import { buildCustomBattle } from '../src/scenarios';
import { sampleGeometry } from '../src/simulation/engagementGeometry';
import type { OrderType } from '../src/simulation/types';

const seeds = Number(process.argv[2] ?? 12);
const rulesId = process.argv[3] ?? 'prime_apex';
const order = process.argv[4] as OrderType | undefined;
const rows: number[][] = [];
for (let seed = 1; seed <= seeds; seed++) {
  const sim = new BattleSimulation(buildCustomBattle({ seed, rulesId, environment: 'deep_space', startingDistanceKm: 60, maxDuration: 150,
    sideA: { faction: 'alliance', name: 'Alliance line', formation: 'line_abreast', counts: { alliance_dreadnought: 6, alliance_cruiser: 18, alliance_frigate: 30 } },
    sideB: { faction: 'reaper', name: 'Reaper pressure', formation: 'strike_wedge', counts: { reaper_capital: 8, reaper_destroyer: 30 } } }));
  if (order) sim.issueOrders([...sim.fleets.values()].find(fleet => fleet.spec.side === 'A')!.spec.id, { order });
  let next = 40, thickness = 0, abaft = 0, samples = 0, overlaps = 0;
  while (!sim.finished && sim.time < 150) {
    sim.step();
    if (sim.time < next) continue;
    next += 5;
    const alliance = sampleGeometry(sim).find(row => row.side === 'A');
    if (alliance) { thickness += alliance.thickness; abaft += alliance.abaftShare; overlaps += alliance.overlaps; samples++; }
  }
  const frigates = sim.ships.filter(s => s.role === 'frigate');
  const reapers = sim.ships.filter(s => s.side === 'B' && s.role !== 'fighter');
  const mine = sim.ships.filter(s => s.side === 'A' && s.role !== 'fighter');
  rows.push([sim.time, frigates.reduce((n, s) => n + s.stats.hits, 0),
    1 - reapers.reduce((n, s) => n + Math.max(0, s.hull), 0) / reapers.reduce((n, s) => n + s.maxHull, 0),
    reapers.filter(s => !s.alive).length, thickness / Math.max(1, samples), abaft / Math.max(1, samples), overlaps,
    1 - mine.reduce((n, s) => n + Math.max(0, s.hull), 0) / mine.reduce((n, s) => n + s.maxHull, 0)]);
}
const mean = (column: number) => rows.reduce((n, row) => n + row[column], 0) / rows.length;
const alliance = (column: number) => +mean(column).toFixed(3);
console.log(JSON.stringify({ seeds, rulesId, order: order ?? 'attack', allianceHullLost: alliance(7), durationSeconds: +mean(0).toFixed(1), frigateHits: +mean(1).toFixed(0), reaperHullLost: +mean(2).toFixed(3),
  reapersDestroyed: +mean(3).toFixed(2), allianceThickness: +mean(4).toFixed(3), allianceAbaftShare: +mean(5).toFixed(3), overlapSamples: Math.round(mean(6) * rows.length) }));
