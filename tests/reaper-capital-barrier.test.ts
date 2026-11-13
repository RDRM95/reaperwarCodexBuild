import { describe, expect, it } from 'vitest';
import { buildCustomBattle } from '@/scenarios';
import { FOCUS_SECONDS, fireOn, scoreTarget, shipEngagementRange } from '@/simulation/ai';
import { BattleSimulation } from '@/simulation/battle';

/**
 * Conventional dreadnoughts against a Sovereign-class Reaper.
 *
 * Owner's report, 13 Nov 2026: in two Annihilation battles 8,652 allied warships fired about a million and a half
 * rounds at 1,500 Sovereigns and destroyed 15 and 20 of them; suspicion, that their barriers regenerate faster
 * than dreadnought fire can overcome.
 *
 * Measured on the build before this change. Regeneration works as written (240 a second for a Sovereign, 288
 * under Annihilation, starting three seconds after the last hit) and is no faster for a Reaper than for anyone
 * else: a Sovereign refills 0.6 % of its barriers a second, an Alliance dreadnought 1.1 %. What was wrong:
 *   - dreadnoughts and cruisers turned beam-on to Reapers and fought with their broadsides, whose rounds reach a
 *     Reaper's hull at 15 % of their strength, while the spinal guns fell silent (25 rounds from four
 *     dreadnoughts in five minutes). Four dreadnoughts needed 614 s to destroy a Sovereign that neither moved
 *     nor fired; eight that it fired back at were all lost and left it with 71 % of its hull;
 *   - a fleet spread its fire thinner than barriers regenerate: in a tenth-size Annihilation battle 350 hulls
 *     aimed at 51 destroyers, seven each, and four fifths of the barrier damage they did was regenerated.
 */
const trial = (rulesId: string, dreadnoughts: number, seed: number, reaper: 'passive' | 'fighting', limit: number) => {
  const sim = new BattleSimulation(buildCustomBattle({ seed, rulesId, environment: 'deep_space', startingDistanceKm: 60, maxDuration: limit,
    sideA: { faction: 'alliance', name: 'Line', formation: 'line_abreast', counts: { alliance_dreadnought: dreadnoughts } },
    sideB: { faction: 'reaper', name: 'Sovereign', formation: 'strike_wedge', counts: { reaper_capital: 1 } } }));
  const sovereign = sim.ships.find(s => s.classId === 'reaper_capital')!;
  if (reaper === 'passive') { sovereign.weapons.length = 0; sovereign.hangar = undefined; sovereign.maxSpeed = 0; sovereign.acceleration = 0; }
  let destroyedAt = -1, barriersDownAt = -1;
  while (!sim.finished && sim.time < limit) {
    sim.step();
    if (barriersDownAt < 0 && sovereign.barriers <= 0) barriersDownAt = sim.time;
    if (!sovereign.alive) { destroyedAt = sim.time; break; }
  }
  const mainGunRounds = sim.events.filter(e => e.type === 'weapon_fired' && e.weaponId === 'alliance_dn_main').length;
  const broadsideRounds = sim.events.filter(e => e.type === 'weapon_fired' && e.weaponId === 'alliance_broadside').length;
  const lost = sim.ships.filter(s => s.side === 'A' && s.role !== 'fighter' && !s.alive).length;
  return { sim, sovereign, destroyedAt, barriersDownAt, mainGunRounds, broadsideRounds, lost };
};

describe('dreadnoughts against a Sovereign under canon rules', () => {
  it('four destroy one that neither moves nor fires in under three minutes, with their main guns', () => {
    const { destroyedAt, barriersDownAt, mainGunRounds, broadsideRounds, lost } = trial('canon_me3', 4, 45, 'passive', 400);
    // Measured, seed 45: barriers down at 83 s, destroyed at 152 s, 136 main-gun rounds and no broadside rounds
    // (131 to 152 s over seven seeds). Before: barriers down at 96 s, destroyed at 614 s, 25 main-gun rounds and
    // 1,440 from the broadsides.
    expect(barriersDownAt).toBeGreaterThan(60);
    expect(barriersDownAt).toBeLessThan(110);
    expect(destroyedAt).toBeGreaterThan(110);
    expect(destroyedAt).toBeLessThan(200);
    expect(mainGunRounds).toBeGreaterThan(100);
    expect(broadsideRounds).toBeLessThan(mainGunRounds);
    expect(lost).toBe(0);
  });

  it('one alone does not break its barriers in five minutes: they regenerate between its shots', () => {
    const { sovereign, barriersDownAt, mainGunRounds } = trial('canon_me3', 1, 45, 'passive', 300);
    // A dreadnought fires every four seconds and lands two rounds in three; regeneration starts three seconds
    // after a hit, at 240 a second. Measured: 150,000 damage in fifteen minutes, 104,500 regenerated, barriers
    // down at 832 s. This is kept: a Sovereign's barriers are meant to hold off a ship or two.
    expect(barriersDownAt).toBe(-1);
    expect(mainGunRounds).toBeGreaterThan(55);
    expect(sovereign.barriers).toBeGreaterThan(sovereign.maxBarriers * 0.3);
    expect(sovereign.barrierRegen).toBeCloseTo(240, 6);
  });

  it('eight destroy one that fights back, and lose three doing it', () => {
    for (const seed of [1, 2, 45]) {
      const { destroyedAt, lost } = trial('canon_me3', 8, seed, 'fighting', 300);
      // Measured over seven seeds: destroyed at 78 to 96 s, three dreadnoughts lost every time. Before (seed 45):
      // all eight lost, the Sovereign left with 71 % of its hull.
      expect(destroyedAt, `seed ${seed}`).toBeGreaterThan(60);
      expect(destroyedAt, `seed ${seed}`).toBeLessThan(130);
      expect(lost, `seed ${seed}`).toBeGreaterThanOrEqual(2);
      expect(lost, `seed ${seed}`).toBeLessThanOrEqual(5);
    }
  });
});

describe('dreadnoughts against a Sovereign under Annihilation rules', () => {
  it('its main gun still destroys a dreadnought at every contact: eight are lost for nothing', () => {
    const { destroyedAt, lost, sovereign } = trial('reaper_hardcore', 8, 45, 'fighting', 300);
    // Measured: all eight destroyed having fired 32 rounds; the Sovereign keeps its hull and 26,700 of its
    // 42,000 barriers. Annihilation is unchanged by this fix.
    expect(destroyedAt).toBe(-1);
    expect(lost).toBe(8);
    expect(sovereign.hull).toBe(sovereign.maxHull);
    expect(sovereign.barrierRegen).toBeCloseTo(288, 6);
  });

  it('twenty-four destroy it, and lose seven to ten', () => {
    for (const seed of [1, 45]) {
      const { destroyedAt, lost } = trial('reaper_hardcore', 24, seed, 'fighting', 300);
      // Measured over seven seeds: destroyed at 42 to 53 s with 7 to 10 dreadnoughts lost. Sixteen manage it in
      // four seeds of seven, losing 11 to 15.
      expect(destroyedAt, `seed ${seed}`).toBeGreaterThan(30);
      expect(destroyedAt, `seed ${seed}`).toBeLessThan(80);
      expect(lost, `seed ${seed}`).toBeGreaterThanOrEqual(5);
      expect(lost, `seed ${seed}`).toBeLessThanOrEqual(13);
    }
  });
});

describe('concentration of fire', () => {
  it('a target is worth as much to one more attacker until those on it would destroy it in ten seconds', () => {
    const sim = new BattleSimulation(buildCustomBattle({ seed: 5, rulesId: 'canon_me3', environment: 'deep_space', startingDistanceKm: 20, maxDuration: 100,
      sideA: { faction: 'alliance', name: 'A', formation: 'line_abreast', counts: { alliance_cruiser: 1 } },
      sideB: { faction: 'reaper', name: 'B', formation: 'line_abreast', counts: { reaper_destroyer: 1 } } }));
    const cruiser = sim.ships.find(s => s.side === 'A')!, destroyer = sim.ships.find(s => s.side === 'B' && s.role !== 'fighter')!;
    const fleet = sim.fleets.get(cruiser.fleetId)!, range = shipEngagementRange(cruiser);
    const worth = (load: number) => {
      const ctx: BattleSimulation = Object.create(sim);
      ctx.targetLoad = () => load;
      return scoreTarget(ctx, cruiser, fleet, destroyer, range);
    };
    const alone = worth(0);
    expect(FOCUS_SECONDS).toBe(10);
    // Fire that would take twenty seconds, then exactly ten: no discount. Fire that would take five, then two
    // and a half: the target is worth a half, then a quarter.
    expect(worth(0.05)).toBeCloseTo(alone, 9);
    expect(worth(0.1)).toBeCloseTo(alone, 9);
    expect(worth(0.2)).toBeCloseTo(alone / 2, 9);
    expect(worth(0.4)).toBeCloseTo(alone / 4, 9);
    // One cruiser is a long way from that: it can expect to need 317 s for a Reaper destroyer, so
    // thirty-odd cruisers may take the same destroyer before any is turned away. Under the first version of the
    // rule the seventh was already worth half.
    const rate = fireOn(cruiser, destroyer);
    expect(1 / rate).toBeGreaterThan(200);
    expect(1 / rate).toBeLessThan(500);
  });
});
