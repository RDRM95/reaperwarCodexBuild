import { describe, expect, it } from 'vitest';
import { RESTRAINED_BLOOM, bloomFor } from '@/rendering/bloom';
import { PALETTES } from '@/rendering/materials';

describe('restrained bloom', () => {
  it('is part of the high preset and follows an explicit setting either way', () => {
    expect(bloomFor({ quality: 'high' })).toBe(RESTRAINED_BLOOM);
    expect(bloomFor({ quality: 'medium' })).toBeNull();
    expect(bloomFor({ quality: 'low' })).toBeNull();
    expect(bloomFor({ quality: 'high', bloom: false })).toBeNull();
    expect(bloomFor({ quality: 'low', bloom: true })).toBe(RESTRAINED_BLOOM);
  });

  it('only light sources pass the threshold: emitters are above it, lit paint cannot reach it', () => {
    const { threshold, strength, radius } = RESTRAINED_BLOOM;
    // A white diffuse surface facing the 2.6 sun reflects 2.6 / pi; ambient and fill add well under 0.4.
    expect(threshold).toBeGreaterThan(2.6 / Math.PI + 0.4);
    // Every faction's engines are brighter than the threshold, so drives glow on every hull.
    for (const [faction, palette] of Object.entries(PALETTES)) {
      expect(palette.engine.emissiveIntensity, faction).toBeGreaterThan(threshold);
    }
    // Restrained: a small fraction of the highlight is added back, over a tight spread.
    expect(strength).toBeLessThanOrEqual(0.15);
    expect(radius).toBeLessThanOrEqual(0.25);
  });

  it('beam cores are HDR so they stay hot in a linear-light frame', () => {
    expect(RESTRAINED_BLOOM.beamBoost).toBeGreaterThan(RESTRAINED_BLOOM.threshold);
  });
});
