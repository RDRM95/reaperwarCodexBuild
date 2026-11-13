/**
 * Controlled gunnery trials: 1, 2, 4, 6 and 8 hulls of one class against one Sovereign-class Reaper, seed 45.
 * Run: node --import tsx/esm scripts/sovereign-trial.ts [rules] [classId] [static|disarmed|armed] [seconds] [distanceKm]
 *
 *   static    the Reaper neither fires nor moves: what the attackers' guns do to it, and nothing else
 *   disarmed  it does not fire but manoeuvres as usual
 *   armed     it fights back
 *
 * For each trial: when its barriers went down, when it was destroyed, rounds fired at it and the share that hit,
 * damage arriving, damage its barriers absorbed, how much they regenerated and for how long, hull damage, and
 * attackers lost. Deterministic. See docs/apex/REAPER_CAPITAL_BARRIER_2026-11-13.md.
 */
import { BattleSimulation } from '../src/simulation/battle';
import { buildCustomBattle } from '../src/scenarios';
const [rulesId = 'canon_me3', classId = 'alliance_dreadnought', mode = 'disarmed', secondsArg = '900', distArg = '30'] = process.argv.slice(2);
const seconds = Number(secondsArg);
console.log(`rules ${rulesId}, ${classId} against one reaper_capital, Reaper ${mode}, start ${distArg} km, limit ${seconds} s`);
console.log(' N | barriers down | destroyed | rounds at it | hit % | raw dmg in | barrier absorbed | regenerated | hull dmg | secs regenerating | dreadnoughts lost');
for (const n of [1, 2, 4, 6, 8]) {
  const sim: any = new BattleSimulation(buildCustomBattle({ seed: 45, rulesId, environment: 'deep_space', startingDistanceKm: Number(distArg), maxDuration: seconds,
    sideA: { faction: 'alliance', name: 'Line', formation: 'line_abreast', counts: { [classId]: n } },
    sideB: { faction: 'reaper', name: 'Sovereign', formation: 'strike_wedge', counts: { reaper_capital: 1 } } } as never));
  const reaper = sim.ships.find((s: any) => s.classId === 'reaper_capital');
  if (mode !== 'armed') { reaper.weapons.length = 0; reaper.hangar = undefined; } if (mode === 'static') { reaper.maxSpeed = 0; reaper.acceleration = 0; }
  let down = -1, dead = -1, raw = 0, absorbed = 0, hull = 0, regen = 0, regenTicks = 0, shots = 0, hits = 0, seen = 0;
  while (!sim.finished && sim.time < seconds) {
    const before = reaper.barriers; sim.step();
    let tickAbsorbed = 0;
    for (; seen < sim.events.length; seen++) { const e = sim.events[seen];
      if (e.type === 'weapon_fired' && e.targetId === reaper.id) shots++;
      if (e.type === 'projectile_impact' && e.targetId === reaper.id) { hits++; raw += e.damage; tickAbsorbed += e.barrierDamage; hull += e.hullDamage; } }
    absorbed += tickAbsorbed;
    const gained = reaper.barriers - before + tickAbsorbed; if (gained > 1e-6) { regen += gained; regenTicks++; }
    if (down < 0 && reaper.barriers <= 0) down = sim.time;
    if (dead < 0 && !reaper.alive) { dead = sim.time; break; }
  }
  const lost = sim.ships.filter((s: any) => s.side === 'A' && s.role !== 'fighter' && !s.alive).length;
  const f = (v: number) => v < 0 ? 'never' : v.toFixed(0) + ' s';
  console.log(`${String(n).padStart(2)} | ${f(down).padStart(13)} | ${f(dead).padStart(9)} | ${String(shots).padStart(12)} | ${(100 * hits / Math.max(1, shots)).toFixed(0).padStart(5)} | ${Math.round(raw).toString().padStart(10)} | ${Math.round(absorbed).toString().padStart(16)} | ${Math.round(regen).toString().padStart(11)} | ${Math.round(hull).toString().padStart(8)} | ${(regenTicks * 0.05).toFixed(0).padStart(17)} | ${lost}/${n}` + (dead < 0 ? `  (left: barriers ${Math.round(reaper.barriers)}/${Math.round(reaper.maxBarriers)}, hull ${Math.round(reaper.hull)}/${Math.round(reaper.maxHull)}, regen ${reaper.barrierRegen.toFixed(0)}/s)` : ''));
}
