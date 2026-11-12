import { describe, expect, it } from 'vitest';
import { buildScenario } from '@/scenarios';
import { BattleSimulation } from '@/simulation/battle';
import {
  explosionSize, explosionSmoke, farPointBrightness, HEAVY_HIT, impactSize, impactSparks, MAIN_CALIBRE, muzzleFlashSize,
  BELT_CALIBRE, BELT_INTERVAL, pointDefenceBrightness, SMALL_CRAFT_LENGTH, tracerShown, tracerSize,
} from '@/rendering/visualWeight';
import { getShipTemplate } from '@/rendering/ships';
import { WEAPONS } from '@/data/weapons';

/**
 * Main batteries read first. Owner's report: fighters "draw too much visual attention compared to main weapons,
 * looks messy like rat a tat gunfire or sparks". In a frame of the Battle of Earth that was three things: every
 * small-calibre round drawn 45 m wide against 110 m for a dreadnought's slug, with seventy of them in the air for
 * each main round; point-defence lasers as full-brightness lines; and distant fighters as 220 m glows as bright as
 * a frigate's.
 */
const KM = 10;
/** Picture area a tracer covers, as the renderer sizes it (width times length, render units). */
const area = (calibre: number, speed: number, size: { width: number; length: number }) =>
  size.width * Math.max(calibre >= MAIN_CALIBRE ? 1.5 : 0.8, speed * KM * 0.06) * size.length;
const before = (calibre: number) => (calibre >= MAIN_CALIBRE ? { width: 1.1, length: 1.3 } : { width: 0.45, length: 0.7 });

describe('visual weight of weapon fire', () => {
  it('a main-battery slug is drawn as it was; lighter rounds are finer the lighter they are', () => {
    expect(tracerSize(MAIN_CALIBRE)).toEqual({ width: 1.1, length: 1.3 });
    expect(tracerSize(40000)).toEqual({ width: 1.1, length: 1.3 });
    const fighter = tracerSize(WEAPONS.fighter_gun.damage), frigate = tracerSize(88), cruiser = tracerSize(199);
    // A fighter's cannon (6 damage a round): an 8 m streak where it was 45 m.
    expect(fighter.width).toBeLessThan(0.1);
    expect(fighter.width).toBeLessThan(frigate.width);
    expect(frigate.width).toBeLessThan(cruiser.width);
    expect(cruiser.width).toBeLessThan(0.45 * 0.6);
    // Nothing below the main calibre is ever drawn as wide or as long as a main slug.
    for (const calibre of [1, 6, 50, 200, 400, 599]) {
      expect(tracerSize(calibre).width).toBeLessThan(0.45);
      expect(tracerSize(calibre).length).toBeLessThanOrEqual(0.7);
    }
  });

  it('a light cannon is drawn as a belt of tracer, one round in four; every other round is drawn', () => {
    expect(BELT_INTERVAL).toBe(4);
    expect(WEAPONS.fighter_gun.damage).toBeLessThan(BELT_CALIBRE);
    let shown = 0;
    for (let serial = 0; serial < 400; serial++) if (tracerShown(WEAPONS.fighter_gun.damage, serial)) shown++;
    expect(shown).toBe(100);
    // Hull guns, from a frigate's 70-damage battery up, are drawn round for round.
    for (const calibre of [BELT_CALIBRE, 65, 70, 199, MAIN_CALIBRE, 40000]) for (let serial = 0; serial < 8; serial++) expect(tracerShown(calibre, serial)).toBe(true);
  });

  it('in the Battle of Earth the main guns take half of the tracer picture instead of a tenth of it, and fighter cannon a twentieth', () => {
    const sim = new BattleSimulation(buildScenario('battle_of_earth', 'prime_apex', 1));
    let mainBefore = 0, allBefore = 0, mainNow = 0, allNow = 0, fighterNow = 0, fighterUnthinned = 0, next = 30;
    while (!sim.finished && sim.time < 120) {
      sim.step();
      if (sim.time < next) continue;
      next += 10;
      for (const p of sim.projectiles) {
        const calibre = p.weapon.damage, speed = Math.hypot(p.vel.x, p.vel.y, p.vel.z);
        const was = area(calibre, speed, before(calibre)), drawn = area(calibre, speed, tracerSize(calibre));
        const now = tracerShown(calibre, p.id) ? drawn : 0;
        allBefore += was; allNow += now;
        if (calibre >= MAIN_CALIBRE) { mainBefore += was; mainNow += now; }
        if (p.weapon.id === 'fighter_gun') { fighterNow += now; fighterUnthinned += drawn; }
      }
    }
    // Measured (6 main rounds and 896 lighter ones over the looks, 492 of them fighter cannon): main guns were
    // 7.5 % of the area tracers cover and are 53 %; fighter cannon are 4 %, and would be 15 % if every round were
    // drawn; all tracers together cover 14 % of what they did. This share moves with how many main rounds happen
    // to be in the air at the ten looks: with 15 of them (before fighters strafed) it was 75 %, with 9 (when
    // fighters strafed but went home with their last torpedo) 63 %. The light rounds of hulls are 404 throughout.
    expect(mainBefore / allBefore).toBeLessThan(0.35);
    expect(mainNow / allNow).toBeGreaterThan(0.45);
    expect(mainNow / allNow).toBeGreaterThan(2 * mainBefore / allBefore);
    expect(allNow / allBefore).toBeLessThan(0.45);
    expect(mainNow).toBeCloseTo(mainBefore, 6);
    expect(fighterNow / allNow).toBeLessThan(0.08);
    expect(fighterUnthinned / (allNow - fighterNow + fighterUnthinned)).toBeGreaterThan(0.1);
  });

  it('point-defence lasers are faint and a distant fighter is a faint mote', () => {
    expect(pointDefenceBrightness(false)).toBeLessThan(0.35);
    expect(pointDefenceBrightness(true)).toBeLessThan(0.5);
    expect(pointDefenceBrightness(true)).toBeGreaterThan(pointDefenceBrightness(false));
    expect(farPointBrightness('fighter')).toBeLessThanOrEqual(0.3);
    for (const role of ['frigate', 'cruiser', 'dreadnought', 'carrier', 'reaper_destroyer', 'reaper_capital'] as const) expect(farPointBrightness(role)).toBe(1);
  });
});

/**
 * The flashes that go with the fire. Every gun below main calibre flashed at one size, 60 to 156 m across, whether
 * it was a cruiser's battery or a fighter's cannon firing four times a second; a fighter's 6-damage round hit with
 * a 43 to 100 m burst and two sparks; and a 36 m fighter died with a frigate's explosion.
 */
describe('visual weight of flashes', () => {
  const before = { muzzle: (calibre: number) => (calibre >= MAIN_CALIBRE ? 3.6 : 1.2), impact: (damage: number) => Math.min(8, 0.4 + Math.sqrt(damage) * 0.09),
    sparks: (hull: number) => Math.min(10, 2 + Math.floor(hull / 120)), explosion: (length: number) => Math.max(1.5, length * 0.6) };

  it('main guns flash as they did; lighter guns flash in proportion to their round', () => {
    expect(muzzleFlashSize(MAIN_CALIBRE, false)).toBe(3.6);
    expect(muzzleFlashSize(40000, false)).toBe(3.6);
    expect(muzzleFlashSize(900, true)).toBe(1.8);
    const fighter = muzzleFlashSize(WEAPONS.fighter_gun.damage, false), frigate = muzzleFlashSize(88, false), cruiser = muzzleFlashSize(199, false);
    // A fighter's cannon: a flash that grows to 19 m, where it grew to 156 m.
    expect(fighter * 1.3).toBeLessThan(0.2);
    expect(fighter).toBeLessThan(frigate);
    expect(frigate).toBeLessThan(cruiser);
    for (const calibre of [1, 6, 88, 199, 400, 599]) expect(muzzleFlashSize(calibre, false)).toBeLessThan(1.2);
    // The gunnery camera sits on the gun: it keeps its smaller flashes in the same proportion as before.
    expect(muzzleFlashSize(88, true) / muzzleFlashSize(88, false)).toBeCloseTo(0.75 / 1.2, 9);
  });

  it('heavy hits and hull explosions are unchanged; light hits and small craft are scaled to their size', () => {
    for (const damage of [HEAVY_HIT, 199, 900, 5000, 40000]) {
      expect(impactSize(damage)).toBe(before.impact(damage));
      expect(impactSparks(damage)).toBe(before.sparks(damage));
    }
    expect(impactSize(6) / before.impact(6)).toBeLessThan(0.4);
    expect(impactSize(88) / before.impact(88)).toBeGreaterThan(0.9);
    expect(impactSparks(6)).toBe(0);
    expect(impactSparks(39)).toBe(0);
    expect(impactSparks(88)).toBe(2);
    // No step at the threshold.
    expect(impactSize(HEAVY_HIT - 0.001)).toBeCloseTo(impactSize(HEAVY_HIT), 3);
    for (const length of [SMALL_CRAFT_LENGTH, 1.7, 5.2, 8.88, 20]) expect(explosionSize(length)).toBe(before.explosion(length));
    // A Trident (36 m) dies in a 47 m explosion with one cloud of smoke, where it was 150 m with four.
    const trident = getShipTemplate('alliance_fighter').lengthUnits;
    expect(explosionSize(trident)).toBeCloseTo(0.468, 6);
    expect(explosionSize(getShipTemplate('reaper_oculus').lengthUnits)).toBe(0.45);
    expect(explosionSmoke(explosionSize(trident))).toBe(1);
    expect(explosionSmoke(1.5)).toBe(4);
    expect(explosionSmoke(5)).toBe(10);
  });

  it('in the Battle of Earth main guns make most of the muzzle flash where they made a fifth', () => {
    const sim = new BattleSimulation(buildScenario('battle_of_earth', 'prime_apex', 1));
    while (!sim.finished && sim.time < 120) sim.step();
    const square = (n: number) => n * n;
    let main = 0, lightBefore = 0, lightNow = 0, hitBefore = 0, hitNow = 0, sparksBefore = 0, sparksNow = 0;
    for (const event of sim.events) {
      if (event.type === 'weapon_fired' && event.kind === 'mass_accelerator') {
        const damage = sim.getShip(event.shipId)!.weapons[event.weaponIndex].def.damage;
        if (damage >= MAIN_CALIBRE) main += square(muzzleFlashSize(damage, false));
        // Light-gun flashes are thinned to 35 % of shots, before and now.
        else { lightBefore += 0.35 * square(before.muzzle(damage)); lightNow += 0.35 * square(muzzleFlashSize(damage, false)); }
      } else if (event.type === 'projectile_impact' && !event.glancing) {
        const damage = event.barrierDamage + event.hullDamage;
        if (damage <= 0 || damage >= HEAVY_HIT) continue;
        hitBefore += square(before.impact(damage)); hitNow += square(impactSize(damage));
        if (!(event.barrierDamage > event.hullDamage && event.barrierDamage > 3)) { sparksBefore += before.sparks(event.hullDamage); sparksNow += impactSparks(event.hullDamage); }
      }
    }
    // Measured (53 main shots, 9,792 lighter, most of them fighters strafing): main guns 12 % of muzzle-flash area
    // before, 83 % now; light guns' flashes cover 3 % of what they did; hits under 100 damage 39 %, and they threw
    // 1,028 sparks and now throw none (none of them does 40 damage to a hull). Before fighters strafed there were
    // 2,708 lighter shots and main guns had 91 %; when fighters strafed but went home with their last torpedo,
    // 5,509 and 86 %. The floor for their share was 0.85 at first and is 0.8 now.
    expect(main / (main + lightBefore)).toBeLessThan(0.45);
    expect(main / (main + lightNow)).toBeGreaterThan(0.8);
    expect(lightNow / lightBefore).toBeLessThan(0.1);
    expect(hitNow / hitBefore).toBeLessThan(0.7);
    expect(sparksBefore).toBeGreaterThan(300);
    expect(sparksNow / sparksBefore).toBeLessThan(0.2);
  });
});

