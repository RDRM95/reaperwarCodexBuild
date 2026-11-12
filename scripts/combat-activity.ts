/**
 * What ships spend a battle doing. Run: npx tsx scripts/combat-activity.ts <scenario|custom> [rules] [seeds] [seconds] [scale]
 *
 * Every second, every armed hull that is alive and has not left is put in one class:
 *   firing   it fired within one cycle of its quickest anti-ship weapon (at least 4 s), or has a beam on
 *   silent   it has a target inside its main-battery range and is not firing
 *   closing  its target is out of range and the gap shrank over the last second
 *   chasing  its target is out of range and the gap did not shrink
 *   idle     it has no target
 * Hull-seconds are counted from the battle's first shot to its end ("active combat time"), by side and class.
 * Also printed: the seconds before the first shot, target changes per hull-minute, how far from its target a hull
 * sits as a share of its range, how fast it is moving while it fires, and shots (and beam-seconds) per hull-minute. Fighters are reported separately, with
 * the number of attack runs each makes per minute (a run: closing on its target, then opening).
 *
 * `custom` is the default Custom Battle (55 Alliance hulls with a carrier against 12 Reapers) times `scale`.
 * Deterministic: the same arguments print the same table.
 */
import { BattleSimulation } from '../src/simulation/battle';
import { buildCustomBattle, buildScenario } from '../src/scenarios';
import { ACTIVITIES, hullTotals, measureActivity, type ActivityRow } from '../src/simulation/combatActivity';

export { ACTIVITIES, hullTotals, measureActivity, type Activity, type ActivityReport, type ActivityRow } from '../src/simulation/combatActivity';

export function customBattle(seed: number, rulesId: string, scale: number, seconds: number): BattleSimulation {
  return new BattleSimulation(buildCustomBattle({ seed, rulesId, environment: 'deep_space', theatreLayout: 'three_dimensional', startingDistanceKm: 76, maxDuration: seconds,
    sideA: { faction: 'alliance', name: 'Alliance Task Force', formation: 'line_abreast', counts: { alliance_dreadnought: 8 * scale, alliance_carrier: scale, alliance_cruiser: 16 * scale, alliance_frigate: 30 * scale, alliance_frigate_thanix: scale } },
    sideB: { faction: 'reaper', name: 'Reaper harvest group', formation: 'strike_wedge', counts: { reaper_capital: 4 * scale, reaper_destroyer: 8 * scale } } } as never));
}

if (process.argv[1]?.endsWith('combat-activity.ts')) {
  const [scenario = 'custom', rulesId = 'prime_apex', seedsArg = '3', secondsArg = '240', scaleArg = '1'] = process.argv.slice(2);
  const seeds = Number(seedsArg), seconds = Number(secondsArg), scale = Number(scaleArg);
  const sum = new Map<string, ActivityRow>();
  let firstShot = 0, duration = 0; const winners: string[] = [];
  for (let seed = 1; seed <= seeds; seed++) {
    const sim = scenario === 'custom' ? customBattle(seed, rulesId, scale, seconds) : new BattleSimulation(buildScenario(scenario, rulesId, seed));
    const report = measureActivity(sim, seconds);
    firstShot += report.firstShot; duration += report.duration; winners.push(report.winner);
    for (const r of report.rows.values()) {
      const s = sum.get(r.key);
      if (!s) { sum.set(r.key, { ...r, seconds: { ...r.seconds } }); continue; }
      for (const a of ACTIVITIES) s.seconds[a] += r.seconds[a];
      s.rangeShare += r.rangeShare; s.rangeSamples += r.rangeSamples; s.firingSpeed += r.firingSpeed; s.firingSamples += r.firingSamples;
      s.targetChanges += r.targetChanges; s.hullSeconds += r.hullSeconds; s.runs += r.runs; s.shots += r.shots;
    }
  }
  const pct = (n: number, d: number) => (d ? (100 * n / d).toFixed(0).padStart(4) + '%' : '    -');
  console.log(`${scenario} ${rulesId} x${scale}, ${seeds} seeds, up to ${seconds} s: first shot at ${(firstShot / seeds).toFixed(1)} s, battle ${(duration / seeds).toFixed(0)} s, winners ${winners.join(',')}`);
  console.log('class                 hull-s firing silent closing chasing  idle  gap/range  speed-firing  switches/min  shots/min  runs/min');
  for (const r of [...sum.values()].sort((a, b) => a.key.localeCompare(b.key))) {
    console.log(r.key.padEnd(20), String(r.hullSeconds).padStart(7), ...ACTIVITIES.map(a => pct(r.seconds[a], r.hullSeconds)),
      (r.rangeSamples ? (r.rangeShare / r.rangeSamples).toFixed(2) : '-').padStart(9), (r.firingSamples ? (r.firingSpeed / r.firingSamples).toFixed(2) : '-').padStart(12),
      (r.hullSeconds ? (r.targetChanges / (r.hullSeconds / 60)).toFixed(1) : '-').padStart(12), (r.hullSeconds ? (r.shots / (r.hullSeconds / 60)).toFixed(0) : '-').padStart(10), (r.key.endsWith('fighter') && r.hullSeconds ? (r.runs / (r.hullSeconds / 60)).toFixed(1) : '').padStart(9));
  }
  const totals = hullTotals({ firstShot: 0, duration: 0, rows: sum, winner: '' });
  console.log('all hulls (no fighters)'.padEnd(20), String(totals.hullSeconds).padStart(4), ...ACTIVITIES.map(a => (100 * totals.share[a]).toFixed(0).padStart(4) + '%'), `  switches/min ${totals.targetChangesPerMinute.toFixed(1)}`);
}
