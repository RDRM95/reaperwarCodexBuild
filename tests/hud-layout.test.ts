import { describe, expect, it } from 'vitest';
import { COLUMN_FLOOR, HUD_GAP, NOTICE_FLOOR, startBelow } from '@/ui/hudLayout';

/**
 * The battle HUD's side columns started at a fixed 118 px, and its top bar is that tall only on a wide screen.
 * The boxes below are the top bar as measured in the browser at 1920 x 1080 and at 1280 x 720 (Battle of Earth,
 * prime_apex, 56 s): status, simulation, camera, timeline, menu.
 */
describe('what starts below the HUD top bar', () => {
  const at1920 = [
    { left: 12, right: 312, top: 12, bottom: 128 }, { left: 322, right: 691, top: 12, bottom: 125 },
    { left: 701, right: 1538, top: 12, bottom: 157 }, { left: 1558, right: 1818, top: 12, bottom: 109 },
    { left: 1828, right: 1908, top: 12, bottom: 48 },
  ];
  const at1280 = [
    { left: 12, right: 232, top: 12, bottom: 141 }, { left: 242, right: 460, top: 12, bottom: 125 },
    { left: 470, right: 944, top: 12, bottom: 191 }, { left: 964, right: 1178, top: 12, bottom: 125 },
    { left: 1188, right: 1268, top: 12, bottom: 48 },
  ];

  it('a column starts below the lowest panel over it, not below panels beside it', () => {
    // Left column, 12 to 312 px: under the status panel only at 1920 (the camera panel, lower, is beside it).
    expect(startBelow(at1920, 12, 312, COLUMN_FLOOR)).toBe(128 + HUD_GAP);
    // At 1280 the status and simulation panels are both over it; the status panel is the lower.
    expect(startBelow(at1280, 12, 312, COLUMN_FLOOR)).toBe(141 + HUD_GAP);
    // Right column, the last 320 px: under the timeline panel and the menu button.
    expect(startBelow(at1920, 1588, 1908, COLUMN_FLOOR)).toBe(109 + HUD_GAP);
    expect(startBelow(at1280, 948, 1268, COLUMN_FLOOR)).toBe(125 + HUD_GAP);
  });

  it('never starts above its floor', () => {
    expect(startBelow([], 12, 312, COLUMN_FLOOR)).toBe(COLUMN_FLOOR);
    expect(startBelow([{ left: 12, right: 312, top: 12, bottom: 60 }], 12, 312, COLUMN_FLOOR)).toBe(COLUMN_FLOOR);
  });

  it('the centre notice clears the camera panel where that crosses the middle of the screen', () => {
    // 1920 wide: the camera panel runs from 701 to 1538 px, across the centre at 960.
    expect(startBelow(at1920, 960 - 220, 960 + 220, NOTICE_FLOOR)).toBe(157 + HUD_GAP);
    // 1280 wide: the centre is at 640, under the camera panel again, which is four rows tall there.
    expect(startBelow(at1280, 640 - 220, 640 + 220, NOTICE_FLOOR)).toBe(191 + HUD_GAP);
  });

  it('a hidden panel covers nothing, and touching edges are not an overlap', () => {
    expect(startBelow([{ left: 0, right: 0, top: 0, bottom: 0 }, { left: 12, right: 12, top: 12, bottom: 400 }], 12, 312, COLUMN_FLOOR)).toBe(COLUMN_FLOOR);
    expect(startBelow([{ left: 312, right: 600, top: 12, bottom: 400 }], 12, 312, COLUMN_FLOOR)).toBe(COLUMN_FLOOR);
  });
});
