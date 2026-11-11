/**
 * Hull contacts counted at every tick. Run: node --import tsx/esm scripts/contact-check.ts <scenarioId|line> [rules] [fromSeed] [toSeed] [seconds]
 *
 * `line` is the 54 v 38 control battle of scripts/engagement-batch.ts; anything else is a built-in scenario id.
 * A contact is a tick on which two live hulls (fighters aside) are closer than the sum of their radii; a radius is
 * half a hull's length, so this is the first moment two hulls could meet end to end. Prints, per seed, the number of
 * pair-ticks in contact, how many were at deployment, and the deepest as a share of the two radii, then the totals.
 * A sampler that looks every few seconds misses these: a pass at a kilometre a second is over in about one.
 */
import { buildCustomBattle, buildScenario } from '../src/scenarios';
import { BattleSimulation } from '../src/simulation/battle';

const [what = 'line', rulesId = 'prime_apex', from = '1', to = '12', secondsArg = '150'] = process.argv.slice(2);
const seconds = Number(secondsArg);
let total = 0, seedsWith = 0, worst = 0, deployment = 0;
for (let seed = Number(from); seed <= Number(to); seed++) {
  const sim = new BattleSimulation(what === 'line'
    ? buildCustomBattle({ seed, rulesId, environment: 'deep_space', startingDistanceKm: 60, maxDuration: seconds,
      sideA: { faction: 'alliance', name: 'Alliance line', formation: 'line_abreast', counts: { alliance_dreadnought: 6, alliance_cruiser: 18, alliance_frigate: 30 } },
      sideB: { faction: 'reaper', name: 'Reaper pressure', formation: 'strike_wedge', counts: { reaper_capital: 8, reaper_destroyer: 30 } } })
    : buildScenario(what, rulesId, seed));
  let pairTicks = 0, deepest = 0, atDeployment = 0, first = '';
  const check = (deploying: boolean) => {
    const ships = sim.ships.filter(s => s.alive && !s.escaped && s.role !== 'fighter');
    for (let i = 0; i < ships.length; i++) {
      const a = ships[i];
      for (let j = 0; j < i; j++) {
        const b = ships[j], reach = a.radiusKm + b.radiusKm, dx = a.pos.x - b.pos.x;
        if (dx > reach || dx < -reach) continue;
        const gap = Math.hypot(dx, a.pos.y - b.pos.y, a.pos.z - b.pos.z);
        if (gap >= reach) continue;
        pairTicks++; deepest = Math.max(deepest, (reach - gap) / reach);
        if (deploying) atDeployment++;
        if (!first) first = `${sim.time.toFixed(2)} s ${a.id} / ${b.id}`;
      }
    }
  };
  check(true);
  while (!sim.finished && sim.time < seconds) { sim.step(); check(false); }
  console.log(JSON.stringify({ seed, pairTicks, atDeployment, deepestPct: +(deepest * 100).toFixed(1), first }));
  total += pairTicks; deployment += atDeployment; worst = Math.max(worst, deepest); if (pairTicks) seedsWith++;
}
console.log(JSON.stringify({ what, rulesId, seeds: Number(to) - Number(from) + 1, seedsWithContact: seedsWith, pairTicks: total, atDeployment: deployment, deepestPct: +(worst * 100).toFixed(1) }));
