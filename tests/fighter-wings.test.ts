import { describe, expect, it } from 'vitest';
import { buildCustomBattle, buildScenario } from '@/scenarios';
import { BattleSimulation, STATION_SECONDS } from '@/simulation/battle';
import { WING_SIZE, WING_SPACING, wingLeader, wingStation } from '@/simulation/ai';
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
    // Measured: 268 of 272 looks, 99 % (189 of 208 when first measured, before fighters stayed over their target
    // or flew in formation). A wing-mate is on another target only between its leader's decision and its own
    // next one.
    expect(looks).toBeGreaterThan(100);
    expect(together / looks).toBeGreaterThan(0.85);
  });

  it('on the way in a wing flies in formation, each craft in its place off its leader\'s quarter', () => {
    // One carrier's six wings crossing 90 km to a destroyer; at 14 s all are launched and none has arrived.
    const sim = new BattleSimulation(buildCustomBattle({ seed: 3, rulesId: 'canon_me3', environment: 'deep_space', startingDistanceKm: 90, maxDuration: 200,
      sideA: { faction: 'alliance', name: 'A', formation: 'line_abreast', counts: { alliance_carrier: 1 } },
      sideB: { faction: 'reaper', name: 'B', formation: 'line_abreast', counts: { reaper_destroyer: 1 } } }));
    while (sim.time < 14) sim.step();
    const number = (id: string) => Number(id.slice(id.lastIndexOf('-') + 1));
    let mates = 0;
    for (const fighter of sim.ships) {
      if (fighter.role !== 'fighter' || !fighter.alive) continue;
      const wing = wingStation(sim, fighter);
      if (!wing) { expect(wingLeader(sim, fighter)).toBe(fighter); continue; }
      mates++;
      // Measured: every wing-mate is 175 to 250 m (0.07 to 0.10 simulation units) from its place; the places are
      // 400 m apart. Before, a wing-mate flew its own line to the target.
      expect(Math.hypot(wing.station.x - fighter.pos.x, wing.station.y - fighter.pos.y, wing.station.z - fighter.pos.z), fighter.id).toBeLessThan(WING_SPACING * 0.75);
      // Second craft on the leader's right, third on its left, fourth on the right again and a rank further back.
      const place = number(fighter.id) - number(wing.leader.id), leader = wing.leader;
      const across = (fighter.pos.x - leader.pos.x) * leader.heading.z - (fighter.pos.z - leader.pos.z) * leader.heading.x;
      const behind = -((fighter.pos.x - leader.pos.x) * leader.heading.x + (fighter.pos.z - leader.pos.z) * leader.heading.z);
      expect(place).toBeGreaterThanOrEqual(1);
      expect(place).toBeLessThan(WING_SIZE);
      expect(Math.sign(across), fighter.id).toBe(place % 2 === 1 ? 1 : -1);
      expect(behind, fighter.id).toBeGreaterThan(0);
    }
    expect(mates).toBe(18);
  });

  it('a wing stays together while it attacks', () => {
    for (const [rulesId, floor] of [['canon_me3', 0.9], ['prime_apex', 0.9]] as const) {
      const sim = earth(rulesId);
      let looks = 0, near = 0, next = 1;
      while (!sim.finished && sim.time < 240) {
        sim.step();
        if (sim.time < next) continue;
        next += 1;
        for (const fighter of sim.ships) {
          if (fighter.role !== 'fighter' || !fighter.alive || fighter.escaped || fighter.rearming || fighter.side !== 'A') continue;
          const leader = wingLeader(sim, fighter), target = fighter.targetId ? sim.getShip(fighter.targetId) : undefined;
          if (!leader || leader === fighter || !target) continue;
          // Only while attacking: within 20 km of its target.
          if (Math.hypot(target.pos.x - fighter.pos.x, target.pos.y - fighter.pos.y, target.pos.z - fighter.pos.z) > 8) continue;
          looks++;
          if (Math.hypot(leader.pos.x - fighter.pos.x, leader.pos.y - fighter.pos.y, leader.pos.z - fighter.pos.z) <= 1) near++;
        }
      }
      // Measured: a wing-mate is within 2.5 km of its leader in 98 % of looks under canon rules (649 looks) and
      // 97 % under prime_apex (1,150). Before wings flew in formation: 78 % and 62 %.
      expect(looks, rulesId).toBeGreaterThan(500);
      expect(near / looks, rulesId).toBeGreaterThan(floor);
    }
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

  it('a fighter out of torpedoes stays over its target with its guns before it turns for its carrier', () => {
    // One carrier's wings against a destroyer that cannot be hurt and does no damage; the carrier holds its fire.
    const sim = new BattleSimulation(buildCustomBattle({ seed: 3, rulesId: 'canon_me3', environment: 'deep_space', startingDistanceKm: 40, maxDuration: 200,
      sideA: { faction: 'alliance', name: 'A', formation: 'line_abreast', counts: { alliance_carrier: 1 } },
      sideB: { faction: 'reaper', name: 'B', formation: 'line_abreast', counts: { reaper_destroyer: 1 } } }));
    const destroyer = sim.ships.find(s => s.role === 'reaper_destroyer')!;
    destroyer.maxHull = destroyer.hull = 1e12;
    for (const s of sim.ships) if (s.side === 'B' || s.role === 'carrier') for (const w of s.weapons) w.def = { ...w.def, damage: 0, range: s.role === 'carrier' ? 0 : w.def.range };
    const spent = new Map<string, number>(), turned = new Map<string, number>();
    let seen = 0;
    while (!sim.finished && sim.time < 150) {
      sim.step();
      for (; seen < sim.events.length; seen++) {
        const event = sim.events[seen];
        if (event.type === 'ammunition_depleted' && !spent.has(event.shipId) && sim.getShip(event.shipId)?.role === 'fighter') spent.set(event.shipId, event.t);
      }
      for (const fighter of sim.ships) if (fighter.role === 'fighter' && fighter.rearming && !turned.has(fighter.id)) turned.set(fighter.id, sim.time);
    }
    // Measured: all 24 fighters spend their torpedoes, and each turns for the carrier exactly STATION_SECONDS later,
    // having fired 2,049 gun rounds between them in that time. Before, each turned in the tick its last torpedo left.
    expect(spent.size).toBe(24);
    expect(turned.size).toBe(24);
    let rounds = 0;
    for (const [id, at] of turned) {
      expect(at - spent.get(id)!).toBeGreaterThan(STATION_SECONDS - 0.1);
      expect(at - spent.get(id)!).toBeLessThan(STATION_SECONDS + 0.1);
    }
    for (const event of sim.events) {
      if (event.type !== 'weapon_fired' || event.weaponId !== 'fighter_gun' || !spent.has(event.shipId)) continue;
      if (event.t > spent.get(event.shipId)! && event.t <= turned.get(event.shipId)!) rounds++;
    }
    expect(rounds).toBeGreaterThan(1500);
    // They still go home, reload and come back: measured, three reloads each in 150 s.
    expect(sim.events.filter(e => e.type === 'fighter_rearmed').length).toBeGreaterThanOrEqual(48);
  });

  it('fighters spend four tenths of a battle firing and make more than four attack runs a minute', () => {
    const report = measureActivity(earth(), 300);
    const row = report.rows.get('A fighter')!;
    // Measured, seed 1: firing 55 %, idle 0.4 %, 5.8 attack runs a minute each (prime_apex: 42 % and 2.8). Before
    // wings flew in formation, 49 % and 5.9 (41 % and 3.9): a wing now makes its passes together, and under
    // prime_apex there are fewer of them. When a fighter turned for its carrier the moment its torpedoes were gone this battle measured
    // 37 % and 3.5; before fighters strafed at all, 20 % (three seeds).
    expect(row.seconds.firing / row.hullSeconds).toBeGreaterThan(0.42);
    expect(row.seconds.idle / row.hullSeconds).toBeLessThan(0.05);
    expect(row.runs / (row.hullSeconds / 60)).toBeGreaterThan(4.5);
  });
});
