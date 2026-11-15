import { describe, expect, it } from 'vitest';
import { buildScenario } from '@/scenarios';
import { BattleSimulation } from '@/simulation/battle';
import { REAPER_ROLL, attitudeOffset, heldRoll, heldTrim, hullRoll } from '@/rendering/attitude';

/**
 * Owner's report, 15 Nov 2026: "reapers all tilt or angle at the same, makes them look copy pasty".
 *
 * A hull was drawn at the shortest turn from "ahead" to its heading, so every hull on one heading had exactly the
 * same roll. Each Reaper now holds a roll of its own. Drawing only.
 */
describe('the roll a Reaper holds', () => {
  const sim = new BattleSimulation(buildScenario('final_battle_of_earth', 'canon_me3', 1));
  const reapers = sim.ships.filter(s => s.role === 'reaper_capital' || s.role === 'reaper_destroyer');
  const degrees = (radians: number) => radians * 180 / Math.PI;

  it('differs from hull to hull, within its limit, both ways', () => {
    const capitals = reapers.filter(s => s.role === 'reaper_capital'), destroyers = reapers.filter(s => s.role === 'reaper_destroyer');
    expect(capitals.length).toBeGreaterThanOrEqual(6);
    expect(destroyers.length).toBeGreaterThanOrEqual(12);
    for (const [group, limit] of [[capitals, REAPER_ROLL.capital], [destroyers, REAPER_ROLL.destroyer]] as const) {
      const rolls = group.map(heldRoll);
      for (const roll of rolls) { expect(Math.abs(roll)).toBeLessThanOrEqual(limit); expect(Math.abs(roll)).toBeGreaterThanOrEqual(limit * 0.3); }
      // No two alike, some each way, a spread of more than half the range, and neighbours in the list (which
      // deploy side by side) a few degrees apart on average.
      expect(new Set(rolls).size).toBe(rolls.length);
      const steps = rolls.slice(1).map((r, i) => Math.abs(degrees(r - rolls[i])));
      expect(steps.reduce((a, b) => a + b, 0) / steps.length).toBeGreaterThan(8);
      expect(rolls.some(r => r > 0) && rolls.some(r => r < 0)).toBe(true);
      expect(Math.max(...rolls) - Math.min(...rolls)).toBeGreaterThan(limit);
    }
  });

  it('is the same hull by hull in another run of the same battle, and sways slowly about its value', () => {
    const again = new BattleSimulation(buildScenario('final_battle_of_earth', 'canon_me3', 1));
    for (const ship of reapers) expect(heldRoll(again.shipById.get(ship.id)!)).toBe(heldRoll(ship));
    const ship = reapers[0];
    let most = 0, fastest = 0;
    for (let t = 0; t < 60; t += 0.05) {
      most = Math.max(most, Math.abs(hullRoll(ship, t) - heldRoll(ship)));
      fastest = Math.max(fastest, Math.abs(hullRoll(ship, t + 0.05) - hullRoll(ship, t)) / 0.05);
    }
    // Under two degrees either way, and never faster than half a degree a second.
    expect(degrees(most)).toBeGreaterThan(1);
    expect(degrees(most)).toBeLessThan(2);
    expect(degrees(fastest)).toBeLessThan(0.5);
  });

  it('each also holds its bow a few degrees off its heading, its own way', () => {
    const trims = reapers.map(heldTrim);
    for (const [i, trim] of trims.entries()) {
      const limit = reapers[i].role === 'reaper_capital' ? REAPER_ROLL.capitalTrim : REAPER_ROLL.destroyerTrim;
      expect(Math.abs(trim.yaw)).toBeLessThanOrEqual(limit);
      expect(Math.abs(trim.pitch)).toBeLessThanOrEqual(limit);
    }
    expect(new Set(trims.map(t => `${t.yaw},${t.pitch}`)).size).toBe(trims.length);
    // Never more than six degrees: the beam still leaves a hull that is looking at what it shoots.
    expect(degrees(Math.max(...trims.map(t => Math.max(Math.abs(t.yaw), Math.abs(t.pitch)))))).toBeLessThanOrEqual(6);
  });

  it('the turn applied to a hull is the same whichever way the hull is drawn, and a banking escort is only banked', () => {
    const reaper = reapers[0];
    const once = attitudeOffset(reaper, 7)!.clone(), twice = attitudeOffset(reaper, 7)!.clone();
    expect(once.equals(twice)).toBe(true);
    expect(once.angleTo(attitudeOffset(reaper, 7.05)!)).toBeLessThan(0.001);
    const frigate = sim.ships.find(s => s.role === 'frigate')!;
    expect(attitudeOffset(frigate, 7)).toBeNull();
    const banked = attitudeOffset(frigate, 7, 0.1)!;
    // A pure roll of 0.1 about the hull's own axis.
    expect(banked.x).toBeCloseTo(0, 9); expect(banked.y).toBeCloseTo(0, 9);
    expect(2 * Math.atan2(banked.z, banked.w)).toBeCloseTo(0.1, 9);
  });

  it('no other hull is rolled', () => {
    for (const ship of sim.ships) if (ship.faction !== 'reaper') { expect(heldRoll(ship)).toBe(0); expect(hullRoll(ship, 12)).toBe(0); }
    // Oculus fighters bank as fighters do; they hold no roll.
    for (const ship of sim.ships) if (ship.faction === 'reaper' && ship.role === 'fighter') expect(hullRoll(ship, 12)).toBe(0);
  });
});
