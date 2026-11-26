/**
 * How a battle opens. Run: npx tsx scripts/opening-engagement.ts <scenario|custom> [rules] [seeds] [seconds] [scale]
 *
 * For each side: when its first anti-ship shot was fired and from how far (catalogue kilometres); for each class,
 * the middle distance of each hull's first main-battery shot; how many of side A's main-battery shots were in the
 * air before side B's first shot; the most main-battery shots side A fired in any one second and in any three of
 * the first twenty after its first; how many targets those shots were shared among; and how the battle ended.
 * Deterministic: the same arguments print the same lines.
 */
import { buildScenario } from '../src/scenarios';
import { BattleSimulation } from '../src/simulation/battle';
import { BATTLESPACE_SCALE } from '../src/simulation/constants';
import { customBattle } from './combat-activity';

export interface Opening {
  first: Record<string, { t: number; km: number } | undefined>;
  byClass: Map<string, number[]>;
  beforeReply: number;
  peak1: number; peak3: number; targets: number; openers: number; eligible: number;
  winner: string; duration: number; lostA: number; lostB: number;
}

const km = (a: { x: number; y: number; z: number }, b: { x: number; y: number; z: number }): number => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z) / BATTLESPACE_SCALE;

export function measureOpening(sim: BattleSimulation, seconds: number): Opening {
  const first: Opening['first'] = {}, byClass = new Map<string, number[]>(), seen = new Set<string>();
  const shotsA: { t: number; target: string; ship: string }[] = [];
  let cursor = 0;
  while (!sim.finished && sim.time < seconds) {
    sim.step();
    for (; cursor < sim.events.length; cursor++) {
      const e = sim.events[cursor];
      if (e.type !== 'weapon_fired') continue;
      const ship = sim.getShip(e.shipId), target = sim.getShip(e.targetId);
      if (!ship || !target || ship.role === 'fighter') continue;
      const w = ship.weapons[e.weaponIndex];
      if (!w || w.def.antiSmall) continue;
      const d = km(ship.pos, target.pos);
      first[ship.side] ??= { t: e.t, km: d };
      // A hull's main battery: its heaviest anti-ship weapon.
      const heaviest = ship.weapons.filter((x) => !x.def.antiSmall).reduce((a, b) => (b.def.damage > a.def.damage ? b : a));
      if (w.def.id !== heaviest.def.id) continue;
      if (ship.side === 'A') shotsA.push({ t: e.t, target: target.id, ship: ship.id });
      if (seen.has(ship.id)) continue;
      seen.add(ship.id);
      const key = `${ship.side} ${ship.role}`;
      if (!byClass.has(key)) byClass.set(key, []);
      byClass.get(key)!.push(d);
    }
  }
  const t0 = first.A?.t ?? Infinity, reply = first.B?.t ?? Infinity;
  const opening = shotsA.filter((s) => s.t <= t0 + 20);
  const peak = (window: number): number => { let best = 0; for (let i = 0, j = 0; i < opening.length; i++) { while (opening[i].t - opening[j].t > window) j++; best = Math.max(best, i - j + 1); } return best; };
  const volley = shotsA.filter((s) => s.t <= t0 + 3);
  const hullLost = (side: string): number => { const s = sim.ships.filter((x) => x.side === side && x.role !== 'fighter'); return 1 - s.reduce((n, x) => n + Math.max(0, x.hull), 0) / s.reduce((n, x) => n + x.maxHull, 0); };
  return { first, byClass, beforeReply: shotsA.filter((s) => s.t < reply).length, peak1: peak(1), peak3: peak(3),
    targets: new Set(volley.map((s) => s.target)).size, openers: new Set(volley.map((s) => s.ship)).size,
    eligible: sim.ships.filter((s) => s.side === 'A' && s.role !== 'fighter' && s.weapons.some((w) => !w.def.antiSmall)).length,
    winner: sim.finished ? (sim.result?.winner ?? '?') : 'unfinished', duration: sim.time, lostA: hullLost('A'), lostB: hullLost('B') };
}

if (process.argv[1]?.endsWith('opening-engagement.ts')) {
  const [scenario = 'battle_of_earth', rulesId = 'canon_me3', seedsArg = '3', secondsArg = '300', scaleArg = '1'] = process.argv.slice(2);
  const seeds = Number(seedsArg), seconds = Number(secondsArg), scale = Number(scaleArg);
  const mid = (v: number[]): number => [...v].sort((a, b) => a - b)[Math.floor(v.length / 2)];
  const all: Opening[] = [], classes = new Map<string, number[]>();
  for (let seed = 1; seed <= seeds; seed++) {
    const sim = scenario === 'custom' ? customBattle(seed, rulesId, scale, seconds) : new BattleSimulation(buildScenario(scenario, rulesId, seed));
    const o = measureOpening(sim, seconds);
    all.push(o);
    for (const [k, v] of o.byClass) classes.set(k, [...(classes.get(k) ?? []), ...v]);
  }
  const mean = (f: (o: Opening) => number): number => all.reduce((n, o) => n + f(o), 0) / all.length;
  console.log(`${scenario} ${rulesId} x${scale}, ${seeds} seeds: A first fires at ${mean((o) => o.first.A?.t ?? NaN).toFixed(1)} s from ${mean((o) => o.first.A?.km ?? NaN).toFixed(0)} km; B at ${mean((o) => o.first.B?.t ?? NaN).toFixed(1)} s from ${mean((o) => o.first.B?.km ?? NaN).toFixed(0)} km`);
  console.log(`  A main-battery shots before B's first: ${mean((o) => o.beforeReply).toFixed(0)}; most in 1 s: ${mean((o) => o.peak1).toFixed(0)}, in 3 s: ${mean((o) => o.peak3).toFixed(0)}; first 3 s: ${mean((o) => o.openers).toFixed(0)} of ${mean((o) => o.eligible).toFixed(0)} hulls on ${mean((o) => o.targets).toFixed(1)} targets`);
  console.log(`  first main-battery shot, middle distance by class: ${[...classes].sort().map(([k, v]) => `${k} ${mid(v).toFixed(0)} km (${v.length})`).join('; ')}`);
  console.log(`  winners ${all.map((o) => o.winner).join(',')}; length ${mean((o) => o.duration).toFixed(0)} s; hull lost A ${(100 * mean((o) => o.lostA)).toFixed(0)} %, B ${(100 * mean((o) => o.lostB)).toFixed(0)} %`);
}
