import { describe, expect, it } from 'vitest';
import { layoutLabels, type LabelCandidate, type LabelPlacement } from '@/ui/labelLayout';

const label = (id: string, x = 20, y = 40, priority = 0): LabelCandidate => ({ id, x, y, width: 80, height: 16, priority });
const assertClear = (placements: LabelPlacement[], width: number, height: number) => {
  for (let i = 0; i < placements.length; i++) {
    const a = placements[i];
    expect([a.x, a.y, a.width, a.height].every(Number.isFinite)).toBe(true);
    expect(a.x).toBeGreaterThanOrEqual(0);
    expect(a.y).toBeGreaterThanOrEqual(0);
    expect(a.x + a.width).toBeLessThanOrEqual(width);
    expect(a.y + a.height).toBeLessThanOrEqual(height);
    for (let j = 0; j < i; j++) {
      const b = placements[j];
      expect(a.x >= b.x + b.width + 2 || b.x >= a.x + a.width + 2 || a.y >= b.y + b.height + 2 || b.y >= a.y + a.height + 2).toBe(true);
    }
  }
};

describe('tactical label layout', () => {
  it('prioritises the selected ship over overlapping ordinary contacts', () => {
    const candidates = [label('ordinary', 0, 0), label('selected', 0, 0, 1e6)];
    const placements = layoutLabels(candidates, 80, 16);
    expect(placements.map((p) => p.id)).toEqual(['selected']);
  });

  it('uses nearby vertical positions before dropping an overlapping label', () => {
    const placements = layoutLabels([label('first'), label('second'), label('third')], 200, 120);
    expect(placements.map((p) => p.y)).toEqual([40, 20, 60]);
    assertClear(placements, 200, 120);
  });

  it('clamps edge labels inside the viewport and rejects oversized or invalid rectangles', () => {
    const placements = layoutLabels([
      label('top-left', -20, -40),
      label('bottom-right', 300, 300),
      { ...label('too-wide'), width: 201 },
      { ...label('too-tall'), height: 121 },
      { ...label('nan'), x: NaN },
      { ...label('infinite-priority'), priority: Infinity },
      { ...label('empty'), width: 0 },
    ], 200, 120);
    expect(placements.map((p) => p.id)).toEqual(['top-left', 'bottom-right']);
    expect(placements[0]).toMatchObject({ x: 0, y: 0 });
    expect(placements[1]).toMatchObject({ x: 120, y: 104 });
    assertClear(placements, 200, 120);
  });

  it('retains input order for equal priorities without mutating candidates or duplicating IDs', () => {
    const candidates = [label('z-first', 0, 0), label('a-second', 100, 0), label('z-first', 0, 50)];
    const original = structuredClone(candidates);
    expect(layoutLabels(candidates, 300, 100).map((p) => p.id)).toEqual(['z-first', 'a-second']);
    expect(candidates).toEqual(original);
  });

  it('bounds a thousand visible contacts to deterministic priority placements', () => {
    const candidates = Array.from({ length: 1000 }, (_, i) => label(`ship-${i}`, (i % 40) * 90, Math.floor(i / 40) * 30, i === 999 ? 1e6 : 0));
    const placements = layoutLabels(candidates, 3600, 900);
    expect(placements).toHaveLength(60);
    expect(placements[0].id).toBe('ship-999');
    expect(layoutLabels(candidates, 3600, 900)).toEqual(placements);
    expect(layoutLabels(candidates, 3600, 900, 90)).toHaveLength(90);
    assertClear(placements, 3600, 900);
  });

  it('handles a thousand coincident labels without overlaps or unbounded output', () => {
    const candidates = Array.from({ length: 1000 }, (_, i) => label(`contact-${i}`));
    const placements = layoutLabels(candidates, 200, 120);
    expect(placements).toHaveLength(3);
    assertClear(placements, 200, 120);
  });

  it('handles empty viewports and caller budgets', () => {
    expect(layoutLabels([label('ship')], 0, 100)).toEqual([]);
    expect(layoutLabels([label('ship')], 100, Infinity)).toEqual([]);
    expect(layoutLabels([label('ship')], 100, 100, 0)).toEqual([]);
    expect(layoutLabels([label('ship')], 100, 100, -1)).toEqual([]);
  });
});
