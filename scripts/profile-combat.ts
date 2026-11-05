/** Temporary CPU hotspot profiler for deterministic high-count combat.
 * Run: node --import tsx/esm scripts/profile-combat.ts
 */
import { performance } from 'node:perf_hooks';
import { BattleSimulation } from '../src/simulation/battle';
import { SeparationField } from '../src/simulation/separation';
import { buildCustomBattle } from '../src/scenarios';

type Stats = { ms: number; calls: number };
const stats = new Map<string, Stats>();
function instrument(proto: object, name: string, label = name): void {
  const target = proto as Record<string, (...args: unknown[]) => unknown>;
  const original = target[name];
  if (!original) throw new Error(`Cannot instrument ${label}`);
  target[name] = function (this: object, ...args: unknown[]) {
    const start = performance.now();
    try { return original.apply(this, args); }
    finally {
      const stat = stats.get(label) ?? { ms: 0, calls: 0 };
      stat.calls++;
      stat.ms += performance.now() - start;
      stats.set(label, stat);
    }
  };
}

for (const name of ['updateMovement', 'updateWeapons', 'updateCarrier', 'updateHousekeeping', 'updateProjectiles', 'updateMissiles', 'checkEscapes', 'checkEnd']) {
  instrument(BattleSimulation.prototype, name);
}
instrument(SeparationField.prototype, 'acceleration', 'separation.acceleration');

const seconds = 30;
const sim = new BattleSimulation(buildCustomBattle({
  seed: 42, rulesId: 'prime_apex', environment: 'deep_space', startingDistanceKm: 60, maxDuration: seconds,
  sideA: { faction: 'alliance', name: 'Alliance line', formation: 'line_abreast',
    counts: { alliance_dreadnought: 24, alliance_cruiser: 72, alliance_frigate: 120 } },
  sideB: { faction: 'reaper', name: 'Reaper pressure', formation: 'strike_wedge',
    counts: { reaper_capital: 32, reaper_destroyer: 120 } },
}));
const t0 = performance.now();
while (!sim.finished) sim.step();
const wallMs = performance.now() - t0;
console.log(JSON.stringify({ ships: sim.ships.length, ticks: sim.tick, wallMs: +wallMs.toFixed(1),
  hotspots: [...stats].sort((a,b)=>b[1].ms-a[1].ms).map(([name,s])=>({
    name, ms:+s.ms.toFixed(1), percent:+(100*s.ms/wallMs).toFixed(1), calls:s.calls,
  }))}, null, 2));
