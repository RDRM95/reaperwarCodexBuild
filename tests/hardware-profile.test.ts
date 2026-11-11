import { describe, expect, it } from 'vitest';
import { DEFAULT_PREFERENCES } from '@/core/storage';
import { applyLocalGpuProfile, detailReach, pixelRatioCapFor, profileFromUrl, scaleCounts, shouldApplyLocalGpuProfile, ULTRA_DETAIL_REACH } from '@/core/hardwareProfile';
import { bloomFor, RESTRAINED_BLOOM, ULTRA_BLOOM } from '@/rendering/bloom';
import { FIGHTER_REDUCED_DISTANCE, lodLevel, lodLevelSquared, POINT_FACTOR, REDUCED_FACTOR } from '@/rendering/lod';

/**
 * The Local GPU Edition opened with the same settings as the web build: the High preset, at most two device pixels
 * per CSS pixel, ship detail dropped beyond 70 hull lengths and the simulation on the drawing thread. Nothing in it
 * used a strong graphics card. The Ultra preset and the local-hardware profile are what the launcher now asks for.
 */
describe('the Ultra preset', () => {
  it('keeps ship detail and ship models three times further out, and only for Ultra', () => {
    expect(detailReach('ultra')).toBe(ULTRA_DETAIL_REACH);
    for (const quality of ['low', 'medium', 'high'] as const) expect(detailReach(quality)).toBe(1);
    const length = 5.2, reach = detailReach('ultra');
    // A cruiser 100 lengths away: hull only on High, every mesh on Ultra.
    expect(lodLevel(length * 100, length, 'cruiser')).toBe('reduced');
    expect(lodLevel(length * 100, length, 'cruiser', true, reach)).toBe('full');
    expect(lodLevel(length * REDUCED_FACTOR * reach + 1, length, 'cruiser', true, reach)).toBe('reduced');
    // 1,000 lengths away: a point on High, still a model on Ultra; a point beyond three times the distance.
    expect(lodLevel(length * 1000, length, 'cruiser')).toBe('point');
    expect(lodLevel(length * 1000, length, 'cruiser', true, reach)).toBe('reduced');
    expect(lodLevel(length * POINT_FACTOR * reach + 1, length, 'cruiser', true, reach)).toBe('point');
    // Fighters follow the same scale.
    expect(lodLevel(FIGHTER_REDUCED_DISTANCE * 2, 0.2, 'fighter')).toBe('reduced');
    expect(lodLevel(FIGHTER_REDUCED_DISTANCE * 2, 0.2, 'fighter', true, reach)).toBe('full');
  });

  it('the squared-distance rule the renderer uses agrees with the plain one at every reach', () => {
    for (const reach of [1, 2, 3]) for (const role of ['fighter', 'frigate', 'cruiser', 'dreadnought', 'reaper_capital'] as const)
      for (const length of [0.2, 1.7, 5.2, 20]) for (const distance of [1, 29, 31, 89, 91, 120, 364, 365, 1100, 3639, 3641, 11000, 15000])
        expect(lodLevelSquared(distance ** 2, length, role, true, reach)).toBe(lodLevel(distance, length, role, true, reach));
  });

  it('draws at up to three device pixels per pixel and antialiases the bloom target eight times', () => {
    expect([pixelRatioCapFor('low'), pixelRatioCapFor('medium'), pixelRatioCapFor('high'), pixelRatioCapFor('ultra')]).toEqual([1, 1.5, 2, 3]);
    expect(bloomFor({ quality: 'ultra' })).toBe(ULTRA_BLOOM);
    expect(ULTRA_BLOOM.samples).toBe(8);
    expect({ ...ULTRA_BLOOM, samples: RESTRAINED_BLOOM.samples }).toEqual(RESTRAINED_BLOOM);
    expect(bloomFor({ quality: 'high' })).toBe(RESTRAINED_BLOOM);
    expect(bloomFor({ quality: 'ultra', bloom: false })).toBeNull();
    expect(bloomFor({ quality: 'medium' })).toBeNull();
  });
});

describe('the local-hardware profile', () => {
  it('is asked for by the launcher address and nothing else', () => {
    expect(profileFromUrl('?profile=local-gpu')).toBe('local-gpu');
    expect(profileFromUrl('?seed=4&profile=local-gpu')).toBe('local-gpu');
    expect(profileFromUrl('')).toBeUndefined();
    expect(profileFromUrl('?profile=other')).toBeUndefined();
  });

  it('sets Ultra, native resolution and the worker simulation, and keeps everything else the player chose', () => {
    const mine = { ...DEFAULT_PREFERENCES, uiScale: 1.5, subtitles: false, audio: { ...DEFAULT_PREFERENCES.audio, music: 0.2 }, graphics: { ...DEFAULT_PREFERENCES.graphics, showEngineGlow: false, bloom: false, lod: false } };
    const applied = applyLocalGpuProfile(mine);
    expect(applied.graphics).toEqual({ quality: 'ultra', showEngineGlow: false, pixelRatioCap: 3, bloom: undefined, lod: true });
    expect(applied.simulationThread).toBe('worker');
    expect(applied.hardwareProfile).toBe('local-gpu');
    expect([applied.uiScale, applied.subtitles, applied.audio.music]).toEqual([1.5, false, 0.2]);
    // The input is not modified.
    expect(mine.graphics.quality).toBe('high');
    expect(mine.simulationThread).toBeUndefined();
  });

  it('is applied once: a setting the player changes afterwards survives the next launch', () => {
    expect(shouldApplyLocalGpuProfile('?profile=local-gpu', DEFAULT_PREFERENCES)).toBe(true);
    expect(shouldApplyLocalGpuProfile('', DEFAULT_PREFERENCES)).toBe(false);
    const applied = applyLocalGpuProfile(DEFAULT_PREFERENCES);
    const changed = { ...applied, graphics: { ...applied.graphics, quality: 'high' as const } };
    expect(shouldApplyLocalGpuProfile('?profile=local-gpu', changed)).toBe(false);
  });
});

describe('fleet scaling for bigger battles', () => {
  it('multiplies every class, keeps empty classes empty and never scales a class away', () => {
    expect(scaleCounts({ alliance_dreadnought: 8, alliance_carrier: 1, alliance_cruiser: 16, harbinger: 0 }, 4)).toEqual({ alliance_dreadnought: 32, alliance_carrier: 4, alliance_cruiser: 64, harbinger: 0 });
    expect(scaleCounts({ alliance_dreadnought: 8, alliance_carrier: 1, alliance_frigate_thanix: 1 }, 0.5)).toEqual({ alliance_dreadnought: 4, alliance_carrier: 1, alliance_frigate_thanix: 1 });
    expect(scaleCounts(undefined, 2)).toEqual({});
    expect(scaleCounts({ a: -3, b: Number.NaN }, 2)).toEqual({ a: 0, b: 0 });
  });
});
