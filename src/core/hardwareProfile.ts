/**
 * The local-hardware profile. The web build opens with settings a laptop's integrated graphics can run. The Local
 * GPU Edition (PLAY_LOCAL_GPU.cmd) runs on the player's own machine, so it asks for the settings a strong discrete
 * GPU and a many-core CPU are for: the Ultra preset, native pixel density, and the simulation on its own thread so
 * the picture is not held up by a large battle's tick. Pure: no browser objects, so it can be unit tested.
 */
import type { Preferences } from './storage';

export type GraphicsQuality = 'low' | 'medium' | 'high' | 'ultra';
export const LOCAL_GPU_PROFILE = 'local-gpu';

/** How many times further than the standard distance a hull keeps its detail meshes and stays a model, not a point. */
export const ULTRA_DETAIL_REACH = 3;
export const detailReach = (quality: GraphicsQuality): number => (quality === 'ultra' ? ULTRA_DETAIL_REACH : 1);

/** The most device pixels drawn per CSS pixel. Ultra draws a high-density display at its native resolution. */
export const pixelRatioCapFor = (quality: GraphicsQuality): number =>
  quality === 'ultra' ? 3 : quality === 'high' ? 2 : quality === 'medium' ? 1.5 : 1;

/** The profile named in the page address (`?profile=local-gpu`), which the local launcher opens the game with. */
export function profileFromUrl(search: string): typeof LOCAL_GPU_PROFILE | undefined {
  return new URLSearchParams(search).get('profile') === LOCAL_GPU_PROFILE ? LOCAL_GPU_PROFILE : undefined;
}

/** Preferences with the local-hardware profile applied. Everything else the player has set is kept. */
export function applyLocalGpuProfile(prefs: Preferences): Preferences {
  return {
    ...prefs,
    graphics: { ...prefs.graphics, quality: 'ultra', pixelRatioCap: pixelRatioCapFor('ultra'), bloom: undefined, lod: true },
    simulationThread: 'worker',
    hardwareProfile: LOCAL_GPU_PROFILE,
  };
}

/**
 * Whether to apply the profile on this launch: only when the launcher asks for it and it has not been applied
 * before, so a player who then changes a setting keeps their change the next time they start the game.
 */
export const shouldApplyLocalGpuProfile = (search: string, prefs: Preferences): boolean =>
  profileFromUrl(search) === LOCAL_GPU_PROFILE && prefs.hardwareProfile !== LOCAL_GPU_PROFILE;

/** Every ship count in a custom battle multiplied by `factor`, never below one hull for a class that had any. */
export function scaleCounts(counts: Record<string, number> | undefined, factor: number): Record<string, number> {
  const scaled: Record<string, number> = {};
  for (const [id, n] of Object.entries(counts ?? {})) {
    const count = Math.max(0, Number(n) || 0);
    scaled[id] = count === 0 ? 0 : Math.max(1, Math.round(count * factor));
  }
  return scaled;
}
