/**
 * A built-in scenario averaged over several seeds. Run: node --import tsx/esm scripts/scenario-batch.ts <scenarioId> [rules] [seeds] [seconds]
 *
 * Prints the means of: battle length, share of each side's hull destroyed, how far apart in altitude each side's
 * fleet anchors are, samples with overlapping hulls, the share of hulls that fired, the first side's firing-line
 * elevation, and the first seed's final anchor altitudes. Deterministic. Use several seeds: one battle is chaotic.
 */
import { buildScenario } from '../src/scenarios';
import { BattleSimulation } from '../src/simulation/battle';
import { sampleGeometry } from '../src/simulation/engagementGeometry';
const [scenarioId, rulesId = 'prime_apex', seedsArg = '6', secondsArg = '150'] = process.argv.slice(2);
const seeds = Number(seedsArg), seconds = Number(secondsArg);
const rows: number[][] = []; let altitudes: number[] = [];
for (let seed = 1; seed <= seeds; seed++) {
  const sim = new BattleSimulation(buildScenario(scenarioId, rulesId, seed));
  let next = 30, spreadA = 0, spreadB = 0, samples = 0, overlaps = 0, elevA = 0;
  const spread = (side: string) => { const ys = [...sim.fleets.values()].filter(f => f.spec.side === side && f.arrived !== false).map(f => f.anchor.y); return ys.length ? Math.max(...ys) - Math.min(...ys) : 0; };
  while (!sim.finished && sim.time < seconds) { sim.step(); if (sim.time < next) continue; next += 10;
    spreadA += spread('A'); spreadB += spread('B'); samples++;
    for (const row of sampleGeometry(sim)) { overlaps += row.overlaps; if (row.side === 'A') elevA += row.elevationDeg; } }
  const hullLost = (side: string) => { const s = sim.ships.filter(x => x.side === side && x.role !== 'fighter'); return 1 - s.reduce((n, x) => n + Math.max(0, x.hull), 0) / s.reduce((n, x) => n + x.maxHull, 0); };
  const fired = sim.ships.filter(s => s.role !== 'fighter' && s.stats.shotsFired > 0).length / sim.ships.filter(s => s.role !== 'fighter').length;
  rows.push([sim.time, hullLost('A'), hullLost('B'), spreadA / Math.max(1, samples), spreadB / Math.max(1, samples), overlaps, fired, elevA / Math.max(1, samples)]);
  if (seed === 1) altitudes = [...sim.fleets.values()].map(f => +f.anchor.y.toFixed(1));
}
const mean = (i: number) => rows.reduce((n, r) => n + r[i], 0) / rows.length;
console.log(JSON.stringify({ scenarioId, rulesId, seeds, duration: +mean(0).toFixed(1), hullLostA: +mean(1).toFixed(3), hullLostB: +mean(2).toFixed(3), altitudeSpreadA: +mean(3).toFixed(2), altitudeSpreadB: +mean(4).toFixed(2),
  overlapSamples: Math.round(mean(5) * rows.length), firedShare: +mean(6).toFixed(3), elevationA: +mean(7).toFixed(1), seed1FinalAnchorY: altitudes }));
