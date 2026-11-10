/** npm exec tsx scripts/oculus-damage-qa.ts
 * Natural four-versus-four fighter encounters. Parent batteries/launches are
 * held to isolate the dogfight; fighter navigation, hit rolls and damage run.
 */
import { BattleSimulation, SIM_DT } from '../src/simulation/battle';
import { buildCustomBattle } from '../src/scenarios';
import { applyRulesToWeapon } from '../src/timelines/rules';
import { getPreset } from '../src/timelines/presets';
import { WEAPONS } from '../src/data/weapons';
import { SHIP_CLASSES } from '../src/data/ships';

for (const rulesId of ['canon_me3', 'reaper_hardcore']) {
  const rules = getPreset(rulesId);
  const pulse = applyRulesToWeapon(WEAPONS.oculus_beam, 'reaper', SHIP_CLASSES.reaper_oculus, rules, WEAPONS);
  const main = applyRulesToWeapon(WEAPONS.reaper_capital_beam, 'reaper', SHIP_CLASSES.reaper_capital, rules, WEAPONS);
  console.log(JSON.stringify({ type: 'weapon', rulesId, oculusDps: pulse.damage,
    oculusBurstBudget: pulse.damage * pulse.beamDuration!, mainDps: main.damage }));
  for (const seed of [7, 42, 1337]) {
    const sim = new BattleSimulation(buildCustomBattle({ seed, rulesId, environment: 'deep_space',
      startingDistanceKm: 20, maxDuration: 90,
      sideA: { faction: 'alliance', name: 'Trident wing', formation: 'fighter_screen', counts: { alliance_carrier: 1, alliance_fighter: 4 } },
      sideB: { faction: 'reaper', name: 'Oculus wing', formation: 'fighter_screen', counts: { reaper_capital: 1, reaper_oculus: 4 } },
    }));
    sim.issueOrders('custom-a', { order: 'hold_formation' });
    sim.issueOrders('custom-b', { order: 'hold_formation' });
    for (const ship of sim.ships) if (ship.role !== 'fighter') {
      for (const weapon of ship.weapons) weapon.cooldown = 1000;
      if (ship.hangar) ship.hangar.remaining = 0;
    }
    for (let tick = 0; tick < Math.round(30 / SIM_DT) && !sim.finished; tick++) sim.step();
    const fighters = sim.ships.filter(s => s.role === 'fighter');
    console.log(JSON.stringify({ type: 'dogfight', rulesId, seed, duration: sim.time,
      sides: ['A', 'B'].map(side => {
        const mine = fighters.filter(s => s.side === side);
        return { side, alive: mine.filter(s => s.alive).length, shots: mine.reduce((n,s) => n+s.stats.shotsFired,0),
          damageDealt: +mine.reduce((n,s) => n+s.stats.damageDealt,0).toFixed(3) };
      }),
    }));
  }
}
