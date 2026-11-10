/**
 * Simulation cost against ship count. Run: node --import tsx/esm scripts/scale-benchmark.ts [seconds] [scales]
 * Prints one JSON line per fleet size: ships, ticks, mean and worst step in milliseconds, and the share of a
 * 60 Hz frame that one simulated tick costs. Deterministic (seed 42); wall times are this machine's.
 */
import { performance } from 'node:perf_hooks';
import { BattleSimulation } from '../src/simulation/battle';
import { buildCustomBattle } from '../src/scenarios';

const seconds = Number(process.argv[2] ?? 40);
const scales = (process.argv[3] ?? '1,3,6,12,24').split(',').map(Number);
for (const scale of scales) {
  const sim = new BattleSimulation(buildCustomBattle({
    seed: 42, rulesId: 'prime_apex', environment: 'deep_space', startingDistanceKm: 60, maxDuration: seconds,
    sideA: { faction: 'alliance', name: 'Alliance line', formation: 'line_abreast', counts: { alliance_dreadnought: 6 * scale, alliance_cruiser: 18 * scale, alliance_frigate: 30 * scale } },
    sideB: { faction: 'reaper', name: 'Reaper pressure', formation: 'strike_wedge', counts: { reaper_capital: 8 * scale, reaper_destroyer: 30 * scale } },
  }));
  const dt = (sim as unknown as { dt?: number }).dt;
  const start = performance.now();
  let worst = 0;
  const samples: number[] = [];
  while (!sim.finished && sim.time < seconds) {
    const before = performance.now();
    sim.step();
    const ms = performance.now() - before;
    samples.push(ms); worst = Math.max(worst, ms);
  }
  const wall = performance.now() - start;
  samples.sort((a, b) => a - b);
  const tickSeconds = sim.time / sim.tick;
  console.log(JSON.stringify({
    ships: sim.ships.length, ticks: sim.tick, tickSeconds: Number(tickSeconds.toFixed(4)), dt,
    meanStepMs: Number((wall / sim.tick).toFixed(3)), p95StepMs: Number(samples[Math.floor(samples.length * 0.95)].toFixed(3)), worstStepMs: Number(worst.toFixed(2)),
    simMsPerRealSecondAt1x: Number(((wall / sim.tick) / tickSeconds).toFixed(1)), events: sim.events.length,
  }));
}
