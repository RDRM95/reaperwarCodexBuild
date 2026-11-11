/**
 * How much of the picture a weapon effect or a distant craft may take. Main batteries should read first: a
 * dreadnought's slug and a Reaper's beam. Before this, every small-calibre round was drawn 45 m wide (a main slug is
 * 110 m), point-defence lasers were full-brightness lines flickering ten times a second, and a fighter at distance
 * was a 220 m glow as bright as a frigate's. Pure: no rendering objects, so it can be unit tested.
 */
import type { ShipRole } from '@/data/types';

/** Damage per round from which a round is drawn as a main-battery slug. */
export const MAIN_CALIBRE = 600;

/** Width (render units, 1 = 100 m) and length factor of a tracer, by damage per round. */
export function tracerSize(calibre: number): { width: number; length: number } {
  if (calibre >= MAIN_CALIBRE) return { width: 1.1, length: 1.3 };
  // A light round is a fine streak; it thickens and lengthens toward the main calibre without reaching it.
  const weight = Math.max(0, Math.min(1, calibre / MAIN_CALIBRE));
  // Sized so that main-battery rounds take about half the picture tracers cover; they took an eighth.
  return { width: 0.08 + 0.2 * weight, length: 0.22 + 0.3 * weight };
}

/** Brightness of a point-defence laser line. GARDIAN lasers are infrared: a faint trace, not a searchlight. */
export const pointDefenceBrightness = (reaper: boolean): number => (reaper ? 0.45 : 0.28);

/** Brightness of the glow a craft is drawn as when it is too far away to be a model. */
export const farPointBrightness = (role: ShipRole): number => (role === 'fighter' ? 0.3 : 1);

/**
 * Size of an engine's glow sprite (render units). A hull's glow is a ninth of its length and never under 30 m, so
 * that a frigate's drives still show. That floor made a fighter's glow 30 m on a 36 m craft: a ball of light the
 * size of the fighter at each of its two engines. A fighter's glow is a fifth of its length, and never under 5 m.
 */
export function engineGlowSize(lengthUnits: number, role: ShipRole, reaper: boolean): number {
  if (role === 'fighter') return Math.max(0.05, lengthUnits * 0.2);
  return Math.max(0.3, lengthUnits * (reaper ? 0.12 : 0.11));
}
