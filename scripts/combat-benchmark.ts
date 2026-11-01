/** Deterministic simulation-only benchmark. Run: node --import tsx/esm scripts/combat-benchmark.ts */
import { performance } from 'node:perf_hooks';
import { BattleSimulation } from '../src/simulation/battle';
import { buildCustomBattle } from '../src/scenarios';

const seconds = Number(process.argv[2] ?? 120);
if (!Number.isFinite(seconds) || seconds < 30 || seconds > 600) throw new Error('Duration must be 30–600 simulated seconds.');
for (const scale of [1, 4]) {
  const sim = new BattleSimulation(buildCustomBattle({
    seed: 42, rulesId: 'prime_apex', environment: 'deep_space', startingDistanceKm: 60, maxDuration: seconds,
    sideA: { faction: 'alliance', name: 'Alliance line', formation: 'line_abreast', counts: { alliance_dreadnought: 6 * scale, alliance_cruiser: 18 * scale, alliance_frigate: 30 * scale } },
    sideB: { faction: 'reaper', name: 'Reaper pressure', formation: 'strike_wedge', counts: { reaper_capital: 8 * scale, reaper_destroyer: 30 * scale } },
  }));
  const start = performance.now();
  let maxStepMs = 0;
  while (!sim.finished) {
    const before = performance.now();
    sim.step();
    maxStepMs = Math.max(maxStepMs, performance.now() - before);
  }
  const wallMs = performance.now() - start;
  const shotsByWindow: number[] = Array.from({ length: Math.ceil(Math.min(sim.time, seconds) / 30) }, () => 0);
  for (const event of sim.events) if (event.type === 'weapon_fired') shotsByWindow[Math.min(shotsByWindow.length - 1, Math.floor(event.t / 30))]++;
  console.log(JSON.stringify({
    seed: 42, ships: sim.ships.length, ticks: sim.tick, simulatedSeconds: Number(sim.time.toFixed(2)),
    wallMs: Number(wallMs.toFixed(1)), averageStepMs: Number((wallMs / sim.tick).toFixed(3)),
    maxStepMs: Number(maxStepMs.toFixed(3)), shotsBy30Seconds: shotsByWindow,
    destroyed: sim.ships.filter(s => !s.alive).length, winner: sim.result?.winner,
  }));
}
