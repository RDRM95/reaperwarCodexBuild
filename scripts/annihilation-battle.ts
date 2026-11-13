/**
 * A large battle against a Reaper harvest fleet, with what happened to the Reapers' barriers.
 * Run: node --import tsx/esm scripts/annihilation-battle.ts [scale] [rules] [seconds] [seed] [fleet]
 * Defaults: scale 1, reaper_hardcore (Annihilation), 600 s, seed 45, conventional.
 *
 * Scale 1 is 1,500 Sovereigns and 4,500 destroyers against 8,652 allied warships, the size of the battles the owner
 * reported on 13 Nov 2026. Their fleet lists are not known; these are stand-ins of that size:
 *   conventional  400 dreadnoughts, 2,252 cruisers, 6,000 frigates
 *   apex          the same with 1 Valkyrie, 40 Omaha and 60 Aegis command ships in place of 101 frigates
 * Scale 1 takes about 35 minutes and 4 GB; scale 0.1 a minute. Progress goes to stderr every 20 s of battle.
 *
 * Prints losses by class, and for Sovereigns and destroyers: how many were hit, had their barriers brought down
 * and were destroyed; damage arriving, absorbed by barriers, regenerated, and reaching the hull; how many allied
 * hulls were aiming at how many of them; and rounds fired and landed by weapon. Deterministic (the wall-clock
 * figures are for the reader only). See docs/apex/REAPER_CAPITAL_BARRIER_2026-11-13.md.
 */
import { BattleSimulation } from '../src/simulation/battle';
import { buildCustomBattle } from '../src/scenarios';
const scale = Number(process.argv[2] ?? 1), rulesId = process.argv[3] ?? 'reaper_hardcore', seconds = Number(process.argv[4] ?? 600), seed = Number(process.argv[5] ?? 45), fleetKind = process.argv[6] ?? 'conventional';
const n = (v: number) => Math.max(1, Math.round(v * scale));
const counts: Record<string, number> = fleetKind === 'apex'
  ? { alliance_valkyrie: 1, alliance_omaha: n(40), alliance_aegis_command: n(60), alliance_dreadnought: n(400), alliance_cruiser: n(2252), alliance_frigate: n(5899) }
  : { alliance_dreadnought: n(400), alliance_cruiser: n(2252), alliance_frigate: n(6000) };
const sim: any = new BattleSimulation(buildCustomBattle({ seed, rulesId, environment: 'deep_space', startingDistanceKm: 120, maxDuration: seconds,
  sideA: { faction: 'alliance', name: 'Allied fleet', formation: 'line_abreast', counts },
  sideB: { faction: 'reaper', name: 'Harvest fleet', formation: 'strike_wedge', counts: { reaper_capital: n(1500), reaper_destroyer: n(4500) } } } as never));
const KINDS = ['reaper_capital', 'reaper_destroyer'];
const reapers = sim.ships.filter((s: any) => KINDS.includes(s.classId)); const kindOf = new Map<string, string>(reapers.map((s: any) => [s.id, s.classId]));
type Tally = { raw: number; barrier: number; hull: number; hits: number; down: number };
const per = new Map<string, Tally>();
const byWeapon = new Map<string, { shots: number; hits: number; raw: number; barrier: number; hull: number }>();
const wrow = (k: string) => { let r = byWeapon.get(k); if (!r) byWeapon.set(k, r = { shots: 0, hits: 0, raw: 0, barrier: 0, hull: 0 }); return r; };
let alliedShots = 0; const shotsAt: Record<string, number> = {}; const absorbedTick: Record<string, number> = { reaper_capital: 0, reaper_destroyer: 0 };
sim.onEvent = (e: any) => {
  if (e.type === 'weapon_fired') { const sh = sim.shipById.get(e.shipId); if (sh?.side === 'A') { alliedShots++; const k = kindOf.get(e.targetId) ?? 'other'; shotsAt[k] = (shotsAt[k] ?? 0) + 1; wrow(`${k} < ${e.weaponId}`).shots++; } }
  else if (e.type === 'projectile_impact') { const k = kindOf.get(e.targetId); if (!k) return; let c = per.get(e.targetId); if (!c) per.set(e.targetId, c = { raw: 0, barrier: 0, hull: 0, hits: 0, down: -1 });
    c.raw += e.damage; c.barrier += e.barrierDamage; c.hull += e.hullDamage; c.hits++; absorbedTick[k] += e.barrierDamage;
    const r = wrow(`${k} < ${e.damageType} ${e.damage >= 900 ? 'spinal' : e.damage >= 250 ? 'heavy' : 'light'}`); r.hits++; r.raw += e.damage; r.barrier += e.barrierDamage; r.hull += e.hullDamage; }
  else if (e.type === 'barriers_down') { const c = per.get(e.shipId); if (c && c.down < 0) c.down = sim.time; }
};
const regen: Record<string, number> = { reaper_capital: 0, reaper_destroyer: 0 };
const group: Record<string, any[]> = { reaper_capital: reapers.filter((s: any) => s.classId === 'reaper_capital'), reaper_destroyer: reapers.filter((s: any) => s.classId === 'reaper_destroyer') };
let next = 20, samples = 0; const aim: Record<string, [number, number]> = { reaper_capital: [0, 0], reaper_destroyer: [0, 0] }; const start = Date.now();
while (!sim.finished && sim.time < seconds) {
  const before: Record<string, number> = {}, aliveBefore: Record<string, any[]> = {};
  for (const k of KINDS) { aliveBefore[k] = group[k].filter((s) => s.alive); let t = 0; for (const s of aliveBefore[k]) t += s.barriers; before[k] = t; absorbedTick[k] = 0; }
  sim.step(); sim.events.length = 0;
  for (const k of KINDS) { let after = 0; for (const s of aliveBefore[k]) after += s.barriers; const gained = after - before[k] + absorbedTick[k]; if (gained > 1e-6) regen[k] += gained; }
  if (Math.round(sim.time * 20) % 20 === 0) { const load = new Map<string, number>();
    for (const s of sim.ships) if (s.side === 'A' && s.alive && s.role !== 'fighter' && s.targetId && kindOf.has(s.targetId)) load.set(s.targetId, (load.get(s.targetId) ?? 0) + 1);
    if (load.size) { samples++; for (const [id, c] of load) { const a = aim[kindOf.get(id)!]; a[0] += c; a[1]++; } } }
  if (sim.time >= next) { next += 20; const alive = (side: string, cls?: string) => sim.ships.filter((s: any) => s.side === side && s.alive && s.role !== 'fighter' && (!cls || s.classId === cls)).length;
    console.error(`t ${sim.time.toFixed(0)} s (${((Date.now() - start) / 60000).toFixed(1)} min): allied ${alive('A')}, capitals ${alive('B', 'reaper_capital')}, destroyers ${alive('B', 'reaper_destroyer')}`); }
}
const cls = (side: string) => { const m: Record<string, [number, number]> = {}; for (const s of sim.ships) if (s.side === side && s.role !== 'fighter') { const r = (m[s.classId] ??= [0, 0]); r[0]++; if (!s.alive) r[1]++; } return Object.entries(m).map(([k, [d, l]]) => `${k} ${l}/${d}`).join(', '); };
const q = (a: number[], p: number) => a.length ? a.slice().sort((x, y) => x - y)[Math.min(a.length - 1, Math.floor(p * a.length))] : 0;
console.log(JSON.stringify({ scale, rulesId, seed, fleetKind, ended: +sim.time.toFixed(1), winner: sim.result?.winner ?? 'none', reason: sim.result?.reason }));
console.log('allied lost/deployed:', cls('A')); console.log('reaper lost/deployed:', cls('B'));
console.log(`allied rounds fired ${alliedShots}: ${Object.entries(shotsAt).map(([k, v]) => `${v} at ${k}`).join(', ')}`);
for (const k of KINDS) { const list = group[k]; const hit = list.map((s) => per.get(s.id)).filter(Boolean) as Tally[]; const sum = (f: (c: Tally) => number) => hit.reduce((a, c) => a + f(c), 0);
  console.log(`${k}: hit at least once ${hit.length}/${list.length}; barriers brought down on ${hit.filter((c) => c.down >= 0).length}; destroyed ${list.filter((s) => !s.alive).length}`);
  console.log(`  raw damage ${Math.round(sum((c) => c.raw))}, absorbed by barriers ${Math.round(sum((c) => c.barrier))}, regenerated ${Math.round(regen[k])}, hull damage ${Math.round(sum((c) => c.hull))}`);
  console.log(`  raw damage per hull that was hit: median ${Math.round(q(hit.map((c) => c.raw), 0.5))}, 90th percentile ${Math.round(q(hit.map((c) => c.raw), 0.9))}, most ${Math.round(q(hit.map((c) => c.raw), 0.9999))} (one has ${Math.round(list[0].maxBarriers)} barriers, ${Math.round(list[0].maxHull)} hull, regenerates ${list[0].barrierRegen.toFixed(0)}/s)`);
  console.log(`  targeting, sampled each second: ${(aim[k][0] / Math.max(1, samples)).toFixed(0)} allied hulls aiming at ${(aim[k][1] / Math.max(1, samples)).toFixed(0)} of them (${(aim[k][0] / Math.max(1, aim[k][1])).toFixed(1)} each)`); }
for (const [k, r] of [...byWeapon].sort((a, b) => a[0].localeCompare(b[0]))) console.log('  ', k.padEnd(44), JSON.stringify({ shots: r.shots, hits: r.hits, raw: Math.round(r.raw), barrier: Math.round(r.barrier), hull: Math.round(r.hull) }));
console.log(`wall time ${((Date.now() - start) / 60000).toFixed(1)} min`);
