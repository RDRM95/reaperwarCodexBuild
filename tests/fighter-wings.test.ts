import { describe, expect, it } from 'vitest';
import { buildCustomBattle, buildScenario } from '@/scenarios';
import { BattleSimulation } from '@/simulation/battle';
import { WING_SIZE, wingLeader } from '@/simulation/ai';
import { measureActivity } from '@/simulation/combatActivity';

/**
 * Fighters attack in wings and keep attacking. Owner's directive: "Fighters attacking in squadrons and making
 * repeated attack runs." Before this change each fighter chose its own target, and an Alliance fighter facing
 * Reapers without Oculus had two torpedoes a sortie and nothing else to fire: its gun engaged only small craft and
 * missiles. Fighters were firing 15 to 18 % of the time.
 */
describe('fighter wings', () => {
  const earth = (rulesId = 'canon_me3') => new BattleSimulation(buildScenario('battle_of_earth', rulesId, 1));

  it('a wing is four craft that launched together, led by the lowest-numbered one still in the fight', () => {
    // At 20 s under prime_apex, when the wings have launched and none has yet turned for home to rearm.
    const sim = earth('prime_apex');
    while (!sim.finished && sim.time < 20) sim.step();
    const fighters = sim.ships.filter(s => s.role === 'fighter' && s.alive && !s.rearming);
    expect(fighters.length).toBe(48);
    const number = (id: string) => Number(id.slice(id.lastIndexOf('-') + 1));
    for (const fighter of fighters) {
      const leader = wingLeader(sim, fighter)!;
      expect(leader.role).toBe('fighter');
      expect(Math.floor((number(leader.id) - 1) / WING_SIZE)).toBe(Math.floor((number(fighter.id) - 1) / WING_SIZE));
      expect(number(leader.id)).toBeLessThanOrEqual(number(fighter.id));
    }
    // When a leader is lost the next craft of the wing leads.
    const wing = fighters.filter(f => wingLeader(sim, f) === wingLeader(sim, fighters[0]));
    if (wing.length > 1) {
      const first = wingLeader(sim, wing[0])!;
      first.alive = false;
      const next = wingLeader(sim, wing.find(f => f !== first)!)!;
      expect(next).not.toBe(first);
      expect(number(next.id)).toBeGreaterThan(number(first.id));
      first.alive = true;
    }
  });

  it('a wing attacks one target', () => {
    const sim = earth('prime_apex');
    let together = 0, looks = 0, next = 30;
    while (!sim.finished && sim.time < 120) {
      sim.step();
      if (sim.time < next) continue;
      next += 5;
      for (const fighter of sim.ships) {
        if (fighter.role !== 'fighter' || !fighter.alive || fighter.escaped || fighter.rearming || fighter.side !== 'A') continue;
        const leader = wingLeader(sim, fighter);
        if (!leader || leader === fighter || !leader.targetId) continue;
        looks++;
        if (fighter.targetId === leader.targetId) together++;
      }
    }
    // Measured: 189 of 208 looks, 91 %. A wing-mate is on another target only between its leader's decision and its
    // own next one.
    expect(looks).toBeGreaterThan(100);
    expect(together / looks).toBeGreaterThan(0.85);
  });

  it('a fighter with no small craft to shoot at strafes the hull it is attacking', () => {
    const sim = new BattleSimulation(buildCustomBattle({ seed: 3, rulesId: 'canon_me3', environment: 'deep_space', startingDistanceKm: 30, maxDuration: 200,
      sideA: { faction: 'alliance', name: 'A', formation: 'fighter_screen', counts: { alliance_frigate: 1, alliance_fighter: 8 } },
      sideB: { faction: 'reaper', name: 'B', formation: 'line_abreast', counts: { reaper_destroyer: 1 } } }));
    const destroyer = sim.ships.find(s => s.role === 'reaper_destroyer')!;
    destroyer.maxHull = destroyer.hull = 1e12;
    // The frigate is there so that side A has a hull: a side of fighters alone ends the battle at once. It holds
    // its fire and the destroyer does no damage, so only the fighters act.
    for (const s of sim.ships) if (s.side === 'B' || s.role === 'frigate') for (const w of s.weapons) w.def = { ...w.def, damage: 0, range: s.role === 'frigate' ? 0 : w.def.range };
    while (!sim.finished && sim.time < 90) sim.step();
    expect(sim.time).toBeGreaterThan(89);
    let guns = 0, torpedoes = 0;
    for (const event of sim.events) if (event.type === 'weapon_fired' && event.targetId === destroyer.id) { if (event.weaponId === 'fighter_gun') guns++; else if (event.weaponId === 'fighter_torpedo') torpedoes++; }
    // Measured: 16 torpedoes (two a craft) and 4,694 gun rounds in 90 s. Before, the 16 torpedoes were all they fired.
    expect(torpedoes).toBe(16);
    expect(guns).toBeGreaterThan(3000);
  });

  it('fighters spend a third of a battle firing and make three attack runs a minute', () => {
    const report = measureActivity(earth(), 300);
    const row = report.rows.get('A fighter')!;
    // Measured, seed 1: firing 37 %, idle 0.4 %, 3.5 attack runs a minute each. Before this change fighters in this
    // battle were firing 20 % of the time (three seeds).
    expect(row.seconds.firing / row.hullSeconds).toBeGreaterThan(0.3);
    expect(row.seconds.idle / row.hullSeconds).toBeLessThan(0.05);
    expect(row.runs / (row.hullSeconds / 60)).toBeGreaterThan(3);
  });
});
