import { describe, expect, it } from 'vitest';
import { DRAG_THRESHOLD, assignAreaTargets, isArea, meanLevel, pointOnLevel, rectBetween, rectContains, type Placed } from '@/ui/areaOrders';

/**
 * Orders by dragging an area. Owner's request, 16 Nov 2026: "drag and select area for fleet movement and attack".
 * Before this the mouse could select one ship at a time and order an attack on one target; there was no way to
 * mark a group of either side, and no way to send ships to a place.
 */
const at = (id: string, x: number, y = 0, z = 0): Placed => ({ id, pos: { x, y, z } });

describe('a dragged rectangle', () => {
  it('is the same rectangle whichever corner it was dragged from', () => {
    const r = { left: 10, top: 20, right: 110, bottom: 80 };
    expect(rectBetween({ x: 10, y: 20 }, { x: 110, y: 80 })).toEqual(r);
    expect(rectBetween({ x: 110, y: 80 }, { x: 10, y: 20 })).toEqual(r);
    expect(rectBetween({ x: 110, y: 20 }, { x: 10, y: 80 })).toEqual(r);
  });

  it('contains what is on or inside its edges', () => {
    const r = rectBetween({ x: 0, y: 0 }, { x: 100, y: 50 });
    expect(rectContains(r, { x: 50, y: 25 })).toBe(true);
    expect(rectContains(r, { x: 0, y: 50 })).toBe(true);
    expect(rectContains(r, { x: 101, y: 25 })).toBe(false);
    expect(rectContains(r, { x: 50, y: -1 })).toBe(false);
  });

  it('is an area only once the pointer has travelled: under the threshold a press is a click', () => {
    expect(isArea(rectBetween({ x: 5, y: 5 }, { x: 5 + DRAG_THRESHOLD, y: 5 + DRAG_THRESHOLD }))).toBe(false);
    expect(isArea(rectBetween({ x: 5, y: 5 }, { x: 5 + DRAG_THRESHOLD + 1, y: 5 }))).toBe(true);
    expect(isArea(rectBetween({ x: 5, y: 5 }, { x: 5, y: 5 - DRAG_THRESHOLD - 1 }))).toBe(true);
  });
});

describe('a point on a fleet’s level', () => {
  it('is where the view ray meets the plane at that height', () => {
    // Looking down and forward at 45 degrees from 100 up: it meets level 0 a hundred ahead.
    const p = pointOnLevel({ x: 0, y: 100, z: 0 }, { x: 0, y: -Math.SQRT1_2, z: Math.SQRT1_2 }, 0)!;
    expect(p.x).toBeCloseTo(0, 9); expect(p.y).toBe(0); expect(p.z).toBeCloseTo(100, 9);
    // A higher level is met sooner.
    expect(pointOnLevel({ x: 0, y: 100, z: 0 }, { x: 0, y: -Math.SQRT1_2, z: Math.SQRT1_2 }, 40)!.z).toBeCloseTo(60, 9);
    // From below, looking up.
    expect(pointOnLevel({ x: 5, y: -10, z: 0 }, { x: 0, y: 1, z: 0 }, 0)).toEqual({ x: 5, y: 0, z: 0 });
  });

  it('is nowhere when the ray runs level, points away from the plane, or meets it beyond reach', () => {
    expect(pointOnLevel({ x: 0, y: 100, z: 0 }, { x: 0, y: 0, z: 1 }, 0)).toBeUndefined();
    expect(pointOnLevel({ x: 0, y: 100, z: 0 }, { x: 0, y: Math.SQRT1_2, z: Math.SQRT1_2 }, 0)).toBeUndefined();
    expect(pointOnLevel({ x: 0, y: 100, z: 0 }, { x: 0, y: -0.01, z: 0.99995 }, 0, 5000)).toBeUndefined();
  });

  it('the level of a selection is the mean height of its ships', () => {
    expect(meanLevel([at('a', 0, 4), at('b', 0, 8), at('c', 0, -3)])).toBeCloseTo(3, 9);
    expect(meanLevel([])).toBe(0);
  });
});

describe('sharing marked enemies among the ships sent at them', () => {
  it('a marked group is engaged as a group: ten ships at five enemies put two on each', () => {
    // The attackers are bunched at one end; without sharing, all ten would take the nearest enemy.
    const attackers = Array.from({ length: 10 }, (_, i) => at(`a${i}`, i * 0.1));
    const targets = Array.from({ length: 5 }, (_, i) => at(`t${i}`, 50 + i * 10));
    const assigned = assignAreaTargets(attackers, targets);
    expect([...assigned.keys()].sort()).toEqual(['t0', 't1', 't2', 't3', 't4']);
    for (const ships of assigned.values()) expect(ships).toHaveLength(2);
    expect([...assigned.values()].flat().sort()).toEqual(attackers.map(a => a.id).sort());
  });

  it('each ship takes the enemy nearest it when there is one apiece', () => {
    const assigned = assignAreaTargets([at('left', -100), at('right', 100)], [at('east', 90), at('west', -90)]);
    expect(assigned.get('west')).toEqual(['left']);
    expect(assigned.get('east')).toEqual(['right']);
  });

  it('more enemies than ships: every ship has a target and no two share one', () => {
    const assigned = assignAreaTargets([at('a', 0), at('b', 1)], [at('t0', 10), at('t1', 11), at('t2', 12), at('t3', 13)]);
    expect([...assigned.values()].flat().sort()).toEqual(['a', 'b']);
    for (const ships of assigned.values()) expect(ships).toHaveLength(1);
  });

  it('the same order always makes the same assignment, and nothing is assigned from nothing', () => {
    const attackers = Array.from({ length: 7 }, (_, i) => at(`a${i}`, i * 3, i % 2, -i));
    const targets = Array.from({ length: 3 }, (_, i) => at(`t${i}`, 40, i * 5, i * 9));
    const once = [...assignAreaTargets(attackers, targets)], twice = [...assignAreaTargets(attackers, targets)];
    expect(twice).toEqual(once);
    expect(assignAreaTargets([], targets).size).toBe(0);
    expect(assignAreaTargets(attackers, []).size).toBe(0);
  });
});
