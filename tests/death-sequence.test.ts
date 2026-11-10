import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { Rng } from '@/core/rng';
import { breakupVelocity } from '@/rendering/breakup';
import { LIGHTS_FAIL, deathDuration, deathLight, deathList, deathPlan } from '@/rendering/deathSequence';

describe('how a destroyed hull dies on screen', () => {
  it('a Reaper dies slowly; other classes keep their timing', () => {
    // Before: 2.2 s for a capital Reaper and 0.9 s for a destroyer, the same as a dreadnought and a cruiser.
    expect(deathDuration('reaper_capital')).toBe(5.2);
    expect(deathDuration('reaper_destroyer')).toBe(2.4);
    expect(deathDuration('dreadnought')).toBe(2.2);
    expect(deathDuration('carrier')).toBe(2.2);
    expect(deathDuration('cruiser')).toBe(0.9);
    expect(deathDuration('frigate')).toBe(0.15);
    expect(deathPlan('frigate', 'f1').bursts).toHaveLength(0);
  });

  it('every burst is on the hull, in the ship\'s own axes', () => {
    // Before: bursts were scattered in a world-axis box a full hull length wide and deep, whatever the heading.
    for (const role of ['reaper_capital', 'reaper_destroyer', 'dreadnought', 'cruiser']) {
      for (const seed of ['a', 'b', 'c']) {
        const plan = deathPlan(role, seed);
        expect(plan.bursts.length).toBeGreaterThan(1);
        for (const burst of plan.bursts) {
          expect(Math.abs(burst.along)).toBeLessThanOrEqual(0.5);
          expect(Math.abs(burst.across)).toBeLessThanOrEqual(0.08);
          expect(Math.abs(burst.up)).toBeLessThanOrEqual(0.06);
          expect(burst.t).toBeGreaterThanOrEqual(0);
          expect(burst.t).toBeLessThan(plan.duration);
        }
      }
    }
  });

  it('a Reaper\'s bursts march from the hood aft and quicken', () => {
    const plan = deathPlan('reaper_capital', 'sovereign');
    expect(plan.staged).toBe(true);
    expect(plan.bursts.length).toBe(16);
    for (let i = 1; i < plan.bursts.length; i++) expect(plan.bursts[i].t).toBeGreaterThan(plan.bursts[i - 1].t);
    const third = Math.floor(plan.bursts.length / 3);
    const mean = (xs: number[]): number => xs.reduce((a, b) => a + b, 0) / xs.length;
    expect(mean(plan.bursts.slice(0, third).map(b => b.along))).toBeGreaterThan(0);
    expect(mean(plan.bursts.slice(-third).map(b => b.along))).toBeLessThan(-0.3);
    // Seven of the sixteen bursts fall in the last 28 % of the death, three at most in its first quarter.
    expect(plan.bursts.filter(b => b.t > plan.duration * 0.72).length).toBe(7);
    expect(plan.bursts.filter(b => b.t < plan.duration * 0.25).length).toBeLessThanOrEqual(3);
    // The same ship always dies the same way; another ship differs.
    expect(deathPlan('reaper_capital', 'sovereign')).toEqual(plan);
    expect(deathPlan('reaper_capital', 'harbinger').bursts[3].across).not.toBe(plan.bursts[3].across);
    expect(deathPlan('dreadnought', 'd').staged).toBe(false);
  });

  it('the lights surge, then fail', () => {
    let peakEarly = 0, peakLate = 0;
    for (let i = 0; i <= 200; i++) {
      const f = i / 200, light = deathLight(f, f * 5.2, 1.3);
      expect(light).toBeGreaterThan(0);
      expect(light).toBeLessThan(2.3);
      if (f < LIGHTS_FAIL) { expect(light).toBeGreaterThanOrEqual(1); peakEarly = Math.max(peakEarly, light); }
      if (f > 0.9) peakLate = Math.max(peakLate, light);
    }
    expect(peakEarly).toBeGreaterThan(1.3);
    expect(peakLate).toBeLessThan(0.15);
    expect(deathLight(1, 5.2, 1.3)).toBeCloseTo(0.06, 6);
  });

  it('the hull lists slowly at first and faster at the end', () => {
    expect(deathList(0).roll).toBeLessThan(0.05);
    expect(deathList(1).roll).toBeGreaterThan(deathList(0).roll * 4);
    for (let i = 0; i < 20; i++) expect(deathList((i + 1) / 20).roll).toBeGreaterThan(deathList(i / 20).roll);
    // The whole death turns the hull by less than a quarter of a turn: heavy, not tumbling.
    let roll = 0;
    for (let i = 0; i < 520; i++) roll += deathList(i / 520).roll * 0.01;
    expect(roll).toBeLessThan(Math.PI / 4);
  });

  it('hull pieces separate outward from the centre of the break', () => {
    // Before: every piece left in a random direction at about 0.2 of the explosion's size per second.
    const rng = new Rng('pieces');
    const size = 12;
    for (let i = 0; i < 200; i++) {
      const offset = new THREE.Vector3(rng.gaussian(0, 4), rng.gaussian(0, 2), rng.gaussian(0, 6));
      if (offset.length() < 0.5) continue;
      const velocity = breakupVelocity(offset, size, rng);
      expect(velocity.dot(offset)).toBeGreaterThan(0);
      expect(velocity.length()).toBeGreaterThan(size * 0.02);
      expect(velocity.length()).toBeLessThan(size * 0.25);
    }
    const core = breakupVelocity(new THREE.Vector3(), size, rng);
    expect(Number.isFinite(core.length())).toBe(true);
    expect(core.length()).toBeLessThan(size * 0.15);
  });
});
