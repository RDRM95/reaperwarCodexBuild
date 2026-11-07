import { describe, expect, it } from 'vitest';
import { lodLevel, lodLevelSquared } from '@/rendering/lod';

describe('GPU fleet LOD preserves original detail decisions', () => {
  it('matches all threshold boundaries and disabled LOD', () => {
    for (const role of ['fighter', 'frigate', 'cruiser', 'reaper_capital'] as const)
      for (const length of [0.1, 0.5, 1, 5, 30])
        for (const distance of [0, 10, 29.999, 30, 30.001, 89.999, 90, 90.001,
          350, 700, 3000, 20000, 1e6]) {
          expect(lodLevelSquared(distance ** 2, length, role)).toBe(lodLevel(distance, length, role));
          expect(lodLevelSquared(distance ** 2, length, role, false)).toBe('full');
        }
  });
});
