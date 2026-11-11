import { describe, expect, it } from 'vitest';
import { buildScenario } from '@/scenarios';
import { BattleSimulation } from '@/simulation/battle';
import { farPointBrightness, MAIN_CALIBRE, pointDefenceBrightness, tracerSize } from '@/rendering/visualWeight';
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

  it('in the Battle of Earth the main guns take half of the tracer picture instead of an eighth of it', () => {
    const sim = new BattleSimulation(buildScenario('battle_of_earth', 'prime_apex', 1));
    let mainBefore = 0, allBefore = 0, mainNow = 0, allNow = 0, next = 30;
    while (!sim.finished && sim.time < 120) {
      sim.step();
      if (sim.time < next) continue;
      next += 10;
      for (const p of sim.projectiles) {
        const calibre = p.weapon.damage, speed = Math.hypot(p.vel.x, p.vel.y, p.vel.z);
        const was = area(calibre, speed, before(calibre)), now = area(calibre, speed, tracerSize(calibre));
        allBefore += was; allNow += now;
        if (calibre >= MAIN_CALIBRE) { mainBefore += was; mainNow += now; }
      }
    }
    // Measured (7 main rounds and 507 lighter ones over the looks): main guns were 12 % of the area tracers cover
    // and are 53 %; all tracers together cover 22 % of what they did. The Final Battle of Earth measures 13 % and
    // 52 %.
    expect(mainBefore / allBefore).toBeLessThan(0.2);
    expect(mainNow / allNow).toBeGreaterThan(0.45);
    expect(allNow / allBefore).toBeLessThan(0.3);
    expect(mainNow).toBeCloseTo(mainBefore, 6);
  });

  it('point-defence lasers are faint and a distant fighter is a faint mote', () => {
    expect(pointDefenceBrightness(false)).toBeLessThan(0.35);
    expect(pointDefenceBrightness(true)).toBeLessThan(0.5);
    expect(pointDefenceBrightness(true)).toBeGreaterThan(pointDefenceBrightness(false));
    expect(farPointBrightness('fighter')).toBeLessThanOrEqual(0.3);
    for (const role of ['frigate', 'cruiser', 'dreadnought', 'carrier', 'reaper_destroyer', 'reaper_capital'] as const) expect(farPointBrightness(role)).toBe(1);
  });
});
