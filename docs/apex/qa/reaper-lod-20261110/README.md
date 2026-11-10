# Reaper structural LOD correction — 10 November 2026

Current integration note: upstream PR #29 has now merged as `2270474`. This feature reconciles those layered graphite hulls and keeps their dedicated carapace/optics while reducing decorative overlays. The original legacy-hull comparison below remains a historical control; the current hull contact sheets and measured totals are in `carapace-compatibility/`. The combined tree passes 370 unit tests and 39 production browser tests.

The reduced fleet representation removed Reaper carapace plates and both central optic meshes because the global detail-name list classified `plates` and `eye` as decorative. Hero LOD only visited direct children, leaving articulated arm seams illuminated at range; switching to static limbs also re-enabled their seam layer. These are rendering defects independent of the unpublished carapace/material overhaul.

## Correction and ownership

A shared role-aware classifier retains Reaper plates and eyes and reduces arm seams. Hero details are captured recursively once at creation and toggled on transitions. Authored hidden parts remain hidden, and the rig separately controls its articulated/static replacement layers with the current LOD. Class batches use the same policy. Geometry, materials, muzzle/engine nodes, hull dimensions, camera thresholds, simulation, seed consumption and save formats are unchanged. The current geometry/material owner's work and open combat PRs remain separate.

Source: `src/rendering/lod.ts`, new `shipLod.ts`, `instancedFleet.ts`, `battleView.ts`, `reaperMotion.ts`. Coverage: `tests/reaper-lod.test.ts`, `e2e/reaper-lod.spec.ts`. Reusable original-model capture: `scripts/reaper-lod-review.mjs`.

## Reproduction and measured cost

Baseline: `f8e9681937ca7c1e063265550cc4ee59aeb0ddf8`. A separate archived baseline with identical dependencies reproduces invisible plates/eyes and all 12 Sovereign nested seams staying visible at reduced detail. The new real-browser regression fails on that baseline and passes on the correction.

| Model | Baseline reduced vertices | Corrected reduced vertices | Full vertices, unchanged | Corrected reduced shared parts |
| --- | ---: | ---: | ---: | ---: |
| Sovereign-class | 5,124 | 7,716 | 9,516 | 6 |
| Harbinger | 5,304 | 13,224 | 15,024 | 7 |
| Destroyer | 3,712 | 7,552 | 9,040 | 6 |
| Ascendant | 5,496 | 8,088 | 9,888 | 8 |

Keeping the armour and separate optics intentionally retains more geometry and two additional shared batch parts per class at reduced LOD. It does not create per-vessel meshes or draw calls. Full-detail batch counts and geometry remain unchanged. Hero traversal is cached rather than repeated per frame. These counts are geometry/draw-work measurements, not FPS improvements.

## Visual and automated evidence

`baseline/` and `fixed/` contain three contact sheets and machine-readable metrics each. The capture script produces 54 frames per build: front/rear/left/right/top/bottom and three-quarter views at both LODs, a correctly sized Alliance frigate comparison, reduced GPU instances, and deep-space/Earth-orbit lighting. LOD is deliberately magnified at matched framing to expose missing structural layers; these are not distance-based performance screenshots. Individual PNGs stayed outside Git. Only original procedural game output is included.

The fixed Sovereign, Harbinger and destroyer sheets were visually inspected. Armour and optics remain visible at reduced detail, decorative seams disappear, and full-detail frames remain unchanged. In the matched three-quarter comparison, no full-detail pixels differ above 8/255 after excluding the QA toolbar. Both capture runs report zero runtime/WebGL errors and unchanged simulation time/RNG. See `comparison.json` and `geometry-metrics.json` for exact methods and counts.

Validation before the final full-browser gate: 353 existing unit tests across 56 files passed, 10 new LOD tests passed, TypeScript and production build passed. The focused browser regression passed on the correction and failed on the unmodified baseline. Final suite and remote status are recorded in the programme checkpoint.

## Acceptance limits and next work

This pass fixes LOD consistency; it does not complete the Reaper carapace, material, articulation or 43-class reference programme. Six-view screenshots are review evidence, not manual approval against private Mass Effect source references. Issues #16 and #19 remain open. The renderer is Chromium ANGLE/Vulkan SwiftShader on this cloud host; target-machine 4K/RTX 5090 performance and listening acceptance remain unverified.

Next: reconcile the geometry owner's original carapace/limb/palette slice when it is published; rerun these captures against that actual head, then address class-specific motion/presence without changing combat outcomes.

## New carapace compatibility

See [PR #29 compatibility evidence](carapace-compatibility/README.md) for the dedicated-carapace layout, its additional regression and the isolated real-model/six-view checks. The stable feature does not import or overwrite that geometry branch.
