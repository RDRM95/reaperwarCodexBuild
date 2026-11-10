import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { RESTRAINED_BLOOM, bloomFor, bloomWeight } from '@/rendering/bloom';
import { PALETTES } from '@/rendering/materials';

describe('restrained bloom', () => {
  it('is part of the high preset and follows an explicit setting either way', () => {
    expect(bloomFor({ quality: 'high' })).toBe(RESTRAINED_BLOOM);
    expect(bloomFor({ quality: 'medium' })).toBeNull();
    expect(bloomFor({ quality: 'low' })).toBeNull();
    expect(bloomFor({ quality: 'high', bloom: false })).toBeNull();
    expect(bloomFor({ quality: 'low', bloom: true })).toBe(RESTRAINED_BLOOM);
  });

  it('coloured emitters bloom; neutral highlights on lit hulls do not', () => {
    const colour = (hex: number, intensity: number): [number, number, number] => { const c = new THREE.Color(hex); return [c.r * intensity, c.g * intensity, c.b * intensity]; };
    // Every faction's drive glow blooms fully.
    for (const [faction, palette] of Object.entries(PALETTES)) {
      const c = palette.engine.emissive;
      expect(bloomWeight(c.r * palette.engine.emissiveIntensity, c.g * palette.engine.emissiveIntensity, c.b * palette.engine.emissiveIntensity), faction).toBeGreaterThan(0.9);
    }
    // A hot Reaper seam (red-orange at up to 2.6) and a boosted beam core bloom; under the old luminance rule the
    // seam's luminance was about 1.0 and it never did.
    expect(bloomWeight(...colour(0xff3a18, 2.6))).toBeGreaterThan(0.9);
    expect(bloomWeight(1.0 * RESTRAINED_BLOOM.beamBoost, 0.42 * RESTRAINED_BLOOM.beamBoost, 0.3 * RESTRAINED_BLOOM.beamBoost)).toBeGreaterThan(0.9);
    // Measured in the HDR target (hull surfaces only, deep space): sunlit faces of the white Alliance dreadnought and
    // frigate peak at 8.8 and 10.2; they were blooming under the old rule, whose threshold was 1.3 on luminance.
    const allianceHull = new THREE.Color(0xb9c1cc);
    for (const peak of [1.3, 2.8, 4.9, 8.8, 10.2]) {
      const k = peak / Math.max(allianceHull.r, allianceHull.g, allianceHull.b);
      expect(bloomWeight(allianceHull.r * k, allianceHull.g * k, allianceHull.b * k), 'hull glint at ' + peak).toBe(0);
      expect(bloomWeight(peak, peak, peak), 'white glint at ' + peak).toBe(0);
    }
    // A neutral source bright enough to be a light, not paint, still blooms.
    expect(bloomWeight(30, 30, 30)).toBe(1);
    expect(RESTRAINED_BLOOM.neutralThreshold).toBeGreaterThan(10.2 * 1.3);
    // Dim pixels of any colour never bloom.
    expect(bloomWeight(...colour(0x3c9dff, 1.0))).toBe(0);
    // Restrained: a small fraction of the highlight is added back, over a tight spread.
    expect(RESTRAINED_BLOOM.strength).toBeLessThanOrEqual(0.15);
    expect(RESTRAINED_BLOOM.radius).toBeLessThanOrEqual(0.25);
  });

  it('beam cores are HDR so they stay hot in a linear-light frame', () => {
    expect(RESTRAINED_BLOOM.beamBoost).toBeGreaterThan(RESTRAINED_BLOOM.threshold);
  });
});
