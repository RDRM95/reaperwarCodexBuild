/**
 * What a snapshot costs. Run: node --import tsx/esm scripts/snapshot-benchmark.ts [seconds] [scales]
 *
 * For each fleet size: the mean simulation tick (the work that would leave the drawing thread), the mean time to
 * encode a snapshot (worker side), the mean time to clone the parts of it that are not transferable typed arrays
 * (what `postMessage` costs on arrival), and the mean time to apply it to the mirror (what stays on the drawing
 * thread). Wall times are this machine's; bundle the script for figures closer to a production build.
 */
import { performance } from 'node:perf_hooks';
import { BattleSimulation } from '../src/simulation/battle';
import { buildCustomBattle } from '../src/scenarios';
import { SimMirror, SnapshotEncoder } from '../src/simulation/snapshot';

const seconds = Number(process.argv[2] ?? 30);
const scales = (process.argv[3] ?? '3,12,24').split(',').map(Number);
for (const scale of scales) {
  const sim = new BattleSimulation(buildCustomBattle({
    seed: 42, rulesId: 'prime_apex', environment: 'deep_space', startingDistanceKm: 60, maxDuration: seconds,
    sideA: { faction: 'alliance', name: 'Alliance line', formation: 'line_abreast', counts: { alliance_dreadnought: 6 * scale, alliance_cruiser: 18 * scale, alliance_frigate: 30 * scale } },
    sideB: { faction: 'reaper', name: 'Reaper pressure', formation: 'strike_wedge', counts: { reaper_capital: 8 * scale, reaper_destroyer: 30 * scale } },
  }));
  const encoder = new SnapshotEncoder(sim), mirror = new SimMirror(sim.config);
  mirror.apply(structuredClone(encoder.encode()));
  let step = 0, encode = 0, clone = 0, apply = 0, bytes = 0, ticks = 0;
  while (!sim.finished && sim.time < seconds) {
    let t = performance.now(); sim.step(); step += performance.now() - t;
    t = performance.now(); const snapshot = encoder.encode(); encode += performance.now() - t;
    // Typed arrays are transferred, not copied; only the rest is cloned on its way to the drawing thread.
    const { ships, weapons, projectiles, missiles, flashes, ...rest } = snapshot;
    t = performance.now(); const arrived = structuredClone(rest); clone += performance.now() - t;
    t = performance.now(); mirror.apply({ ...arrived, ships, weapons, projectiles, missiles, flashes }); apply += performance.now() - t;
    bytes += ships.byteLength + weapons.byteLength + projectiles.byteLength + missiles.byteLength + flashes.byteLength;
    ticks++;
  }
  const mean = (total: number) => +(total / ticks).toFixed(3);
  console.log(JSON.stringify({ ships: sim.ships.length, ticks, stepMs: mean(step), encodeMs: mean(encode), cloneMs: mean(clone), applyMs: mean(apply),
    drawingThreadMs: mean(clone + apply), kilobytesPerTick: Math.round(bytes / ticks / 1024) }));
}
