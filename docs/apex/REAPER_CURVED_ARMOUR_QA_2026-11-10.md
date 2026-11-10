# Curved armour shading on the Reaper hulls (10 November 2026)

Rendering only; geometry attachment points, lengths and materials are unchanged.

## Defect

After the hull rebuild every armour part was flat-shaded. Up close the eight-sided limb sleeves and the three-quad
armour bands read as low-polygon facets, with single faces flashing near-white under the camera fill light
(`qa/reaper-curved-20261110/before-limbs-close.jpg`).

## Change

- `tinted` in `src/rendering/ships/reaper.ts` gains two shading modes built on Three's `toCreasedNormals`:
  `'curved'` smooths faces that meet at under 38° (armour bands and hood shells) and `'round'` at under 52° (the
  eight-sided limb sleeves and their plate rings). Plate lips, ring edges and end caps exceed those angles and stay
  hard, so a plate reads as a curved shell with a crisp edge. Mechanical parts (knuckles, bearings, claws, cowl)
  stay faceted.
- Armour bands are five quads across instead of three and hood panels are cut at half the angular step, so the
  smoothed normals follow the section's curve.

| Template | Triangles shown, before → after | Budget in `tests/reaper-carapace.test.ts` |
|---|---:|---:|
| reaper_capital | 12,432 → 13,824 | 14,000 |
| harbinger | 13,352 → 14,672 | 15,000 |
| reaper_destroyer | 10,056 → 11,024 | 11,500 |

Lengths, muzzle and engine nodes are unchanged (the same test pins them).

After: `after-limbs-close.jpg`; pairs at three distances in `before-after-curved-armour.jpg` (cloud Chromium with
SwiftShader).

## Limits

- Silhouettes are unchanged: an eight-sided sleeve still has an eight-sided outline up close.
- No normal maps or micro-detail; the smooth shading is per vertex.
- The triangle budgets are nearly used up; further geometric detail needs a level-of-detail split first.
