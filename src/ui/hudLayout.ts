/** A box on the screen, in pixels from the HUD's top-left corner. */
export interface Box { left: number; right: number; top: number; bottom: number }

/** The gap kept between a top-bar panel and what starts below it. */
export const HUD_GAP = 10;
/** Where the side columns start when nothing above them reaches lower. */
export const COLUMN_FLOOR = 118;
/** Where the centre notice sits when nothing above it reaches lower. */
export const NOTICE_FLOOR = 90;
/** Half the width allowed for the centre notice: "REINFORCEMENTS DETECTED" is 328 px wide and the longest is a
 * sixth longer. */
export const NOTICE_HALF_WIDTH = 220;

/**
 * Where something spanning `left` to `right` must start so that no top-bar panel above it covers it: below the
 * lowest panel that shares any of its span, and never above `floor`.
 *
 * The side columns of the battle HUD used to start at a fixed 118 px. The top bar is that tall only on a wide
 * screen: its camera panel wraps to more rows, and its status line to two, as the window narrows. At 1920 px wide
 * the status panel ended at 128 px and covered the head of the allied fleet list by 10 px; at 1600 and 1280 px by
 * 23 px, hiding the last status line. The centre notice ("REINFORCEMENTS DETECTED") sat at 90 px, across the camera
 * buttons, at every width up to 1920 px.
 */
export function startBelow(panels: readonly Box[], left: number, right: number, floor: number, gap = HUD_GAP): number {
  let top = floor;
  for (const panel of panels) {
    if (panel.right <= panel.left || panel.bottom <= panel.top) continue; // Hidden or empty: covers nothing.
    if (panel.right > left && panel.left < right) top = Math.max(top, panel.bottom + gap);
  }
  return top;
}
