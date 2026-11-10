# Compatibility with the newly published carapace PR #29

During the pass, original geometry head `ee3cc8022e10d8609587ae03755a4c9c161ef1ec` appeared on `feat/reaper-carapace-limbs-20261110`. It puts structural armour in `carapace` and smaller decorative overlays in `plates`. The shared classifier now detects that layout once during hero/batch creation: legacy structural plates survive, while the new decorative plates reduce; optics remain structural in both layouts.

An isolated local worktree based on that exact geometry head received only the five renderer adapter/helper files and this feature's existing capture script. The owner branch was not modified, merged, or published as part of the LOD feature.

Checks: TypeScript plus 18 existing carapace/model/template regression tests passed. An independent real-model probe checked four classes' complete reduced vertex totals against the authored visible structural layers, plus nested carapace, eye, decorative-plate and arm-seam masks. The capture script produced 54 actual Chromium frames; all reported zero runtime/WebGL errors and unchanged simulation time/RNG. The three contact sheets were inspected. Geometry and render summaries are alongside them.

To reproduce, check out the pinned geometry head in a separate worktree, overlay `lod.ts`, `shipLod.ts`, `instancedFleet.ts`, `battleView.ts`, `reaperMotion.ts` and `scripts/reaper-lod-review.mjs` from this feature, install the normal dependencies, serve that worktree with Vite, then run the documented capture script against its local URL. Do not copy its geometry into the LOD feature or replace either repository wholesale.

This proves compatibility with that head, not independent source-reference likeness approval or permission to bypass PR #29's own CI/review. These are original procedural models from the public owner branch. Target-GPU 4K acceptance remains open.

## Subsequent upstream merge

The geometry author subsequently merged PR #29 into the actual integration base as `2270474`. This LOD feature then reconciled that base with a normal merge. The compatibility checkout and the resulting feature have byte-identical entire `src` trees; the captures therefore represent the combined renderer. The owner branch remains unmodified. The combined tree passed all 370 unit tests and 39 production browser tests.
