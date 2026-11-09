/** Large-fleet acceptance probe. Wall time is headless CPU time, never GPU FPS.
 * npm exec tsx scripts/engagement-coverage.ts 1000 42 180 harmless mixed
 * Harmless controls retain navigation, ranges, arcs, heat and ammo, with zero
 * damage so early front-rank kills cannot hide permanently idle rear ranks.
 */
import { performance } from 'node:perf_hooks';
import { dot, length, sub } from '../src/core/vec3';
import { buildCustomBattle } from '../src/scenarios';
import { BattleSimulation, SIM_DT } from '../src/simulation/battle';
import { shipEngagementRange } from '../src/simulation/ai';
import type { ShipState } from '../src/simulation/types';

const [sizeArg = '1000', seedArg = '42', secondsArg = '180', mode = 'harmless', roster = 'mixed'] = process.argv.slice(2);
const size = Number(sizeArg), seed = Number(seedArg), seconds = Number(secondsArg);
if (![size, seed, seconds].every(Number.isFinite) || size < 2 || size > 20000 || seconds <= 0 ||
    !['harmless', 'natural'].includes(mode) || !['mixed', 'gunline'].includes(roster)) {
  throw new Error('Expected total ships (2..20000), seed, seconds (>0), harmless|natural, mixed|gunline');
}
const a = Math.floor(size / 2), b = Math.ceil(size / 2);
const aDN = Math.max(1, Math.floor(a * .1)), aCR = Math.floor(a * .4);
const bRC = Math.max(1, Math.floor(b * .25));
const sim = new BattleSimulation(buildCustomBattle({
  seed, rulesId: 'prime_apex', environment: 'deep_space', startingDistanceKm: 90, maxDuration: seconds + SIM_DT * 2,
  sideA: { faction: 'alliance', name: 'Coverage A', formation: 'line_abreast', counts: roster === 'gunline' ?
    { alliance_dreadnought: a } : { alliance_dreadnought: aDN, alliance_cruiser: aCR, alliance_frigate: a - aDN - aCR } },
  sideB: { faction: 'reaper', name: 'Coverage B', formation: 'line_abreast', counts: roster === 'gunline' ?
    { reaper_capital: b } : { reaper_capital: bRC, reaper_destroyer: b - bRC } },
}));
const original = [...sim.ships];
const groups = new Map<string, ShipState[]>();
for (const side of ['A', 'B'] as const) {
  const mine = original.filter(s => s.side === side);
  const heading = sim.fleets.get(mine[0].fleetId)!.heading;
  const ordered = [...mine].sort((x, y) => dot(y.pos, heading) - dot(x.pos, heading));
  for (const [index, ship] of ordered.entries()) {
    const third = ['front', 'middle', 'rear'][Math.min(2, Math.floor(index * 3 / ordered.length))];
    const key = `${side}:${third}`;
    const group = groups.get(key) ?? [];
    group.push(ship); groups.set(key, group);
  }
}
if (mode === 'harmless') for (const ship of original) for (const weapon of ship.weapons) weapon.def = { ...weapon.def, damage: 0 };
const firstShot = new Map<string, number>();
const firstBattery = new Map<string, number>();
let eventCursor = 0;
const motion = new Map<string, { samples: number; speed: number; reverse: number; lateral: number; peak: number }>();
const started = performance.now();
function snapshot() {
  return [...groups].map(([group, ships]) => {
    const alive = ships.filter(s => s.alive && !s.escaped);
    const enemies = original.filter(s => s.side !== ships[0].side && s.alive && !s.escaped);
    const inRange = alive.filter(s => enemies.some(e => length(sub(e.pos, s.pos)) <= shipEngagementRange(s))).length;
    const first = ships.map(s => firstShot.get(s.id)).filter((t): t is number => t !== undefined).sort((x,y) => x-y);
    const batteryFired = ships.filter(s => firstBattery.has(s.id)).length;
    return { group, deployed: ships.length, alive: alive.length, fired: first.length, batteryFired,
      firedPercent: +(100 * first.length / ships.length).toFixed(1), inRange,
      medianFirstShot: first.length ? +first[Math.floor(first.length / 2)].toFixed(2) : null };
  });
}
const checkpoints = [30, 60, 120, 180, 300].filter(t => t < seconds);
checkpoints.push(seconds);
let next = 0;
for (let tick = 0; tick < Math.ceil(seconds / SIM_DT) && !sim.finished; tick++) {
  sim.step();
  for (; eventCursor < sim.events.length; eventCursor++) {
    const event = sim.events[eventCursor];
    if (event.type === 'weapon_fired') {
      if (!firstShot.has(event.shipId)) firstShot.set(event.shipId, event.t);
      const weapon = sim.getShip(event.shipId)?.weapons.find(w => w.def.id === event.weaponId);
      if (weapon?.def.antiCapital && !weapon.def.antiSmall && !firstBattery.has(event.shipId)) firstBattery.set(event.shipId, event.t);
    }
  }
  if (tick % 20 === 19) for (const ship of original) {
    if (!ship.alive || ship.escaped) continue;
    const m = motion.get(ship.classId) ?? { samples: 0, speed: 0, reverse: 0, lateral: 0, peak: 0 };
    const speed = length(ship.vel), axial = dot(ship.vel, ship.heading);
    m.samples++; m.speed += speed / ship.maxSpeed; m.peak = Math.max(m.peak, speed / ship.maxSpeed);
    if (axial < -ship.maxSpeed * .1) m.reverse++;
    if (length(sub(ship.vel, { x: ship.heading.x * axial, y: ship.heading.y * axial, z: ship.heading.z * axial })) > ship.maxSpeed * .35) m.lateral++;
    motion.set(ship.classId, m);
  }
  if (sim.time + 1e-6 >= checkpoints[next]) {
    console.log(JSON.stringify({ time: +sim.time.toFixed(2), coverage: snapshot() }));
    next++;
  }
}
console.log(JSON.stringify({ size, seed, mode, roster, duration: +sim.time.toFixed(2),
  wallSeconds: +((performance.now() - started) / 1000).toFixed(3),
  motion: [...motion].map(([classId, m]) => ({ classId, meanSpeedFraction: +(m.speed / m.samples).toFixed(3),
    peakSpeedFraction: +m.peak.toFixed(3), reversePercent: +(m.reverse * 100 / m.samples).toFixed(1),
    lateralPercent: +(m.lateral * 100 / m.samples).toFixed(1) })),
  geometry: ['A', 'B'].map(side => {
    const initial = original.filter(s => s.side === side), alive = initial.filter(s => s.alive && !s.escaped);
    const span = (values: number[]) => values.length ? Math.max(...values) - Math.min(...values) : 0;
    return { side, initialWidth: +span(initial.map(s => s.slot.x)).toFixed(2), width: +span(alive.map(s => s.pos.x)).toFixed(2),
      depth: +span(alive.map(s => s.pos.z)).toFixed(2), height: +span(alive.map(s => s.pos.y)).toFixed(2) };
  }), final: snapshot(), result: sim.result?.outcome ?? 'running' }));
