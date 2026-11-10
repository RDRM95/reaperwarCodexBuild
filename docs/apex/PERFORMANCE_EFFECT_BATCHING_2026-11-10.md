# Effects in a handful of draw calls: batched sparks and debris (10 November 2026)

Rendering only. The simulation, the effects' timing, sizes, colours and random stream are unchanged.

## Defect

Every spark was its own `THREE.Sprite` and every generic debris fragment its own `THREE.Mesh`, so each cost a
draw call. In a running battle that was most of the frame's calls, whatever the fleet size, because the ships
themselves are instanced:

| Paused frame, 700 ticks into a battle | Ships alive | Live sparks | Live debris | Draw calls before | After |
|---|---:|---:|---:|---:|---:|
| 6 dreadnoughts, 18 cruisers, 30 frigates ×3 against Reapers | 208 | 440 | 271 | 806 | 101 |
| The same with bloom | 208 | 440 | 271 | 806 | 101 |
| The same fleets ×12 | 988 | 773 | 437 | 1,376 | 174 |

Time inside the render call for those frames (median of 30, cloud Chromium with SwiftShader, so this is the
cost of submitting the frame on the main thread, not GPU time): 3.4 → 0.7 ms, 3.7 → 0.9 ms and 5.5 → 1.0 ms.

## Change

`src/rendering/effectBatches.ts`:

- `SparkBatch`: additive camera-facing quads that share a texture, one instanced draw. Its shader follows
  three's sprite shader (view-space billboard, logarithmic depth, tone mapping, output colour space), so it
  behaves the same with bloom off and on. There is one batch per spark texture (five) and one more for the
  HADES core, which is drawn without a depth test as before: six draws at most, and an empty batch draws nothing.
- `FragmentBatch`: debris fragments of one shape as one `InstancedMesh`, three shapes. Capacity doubles when it
  runs out, so no fragment is dropped (there was no cap before either).

`EffectsSystem` keeps sparks and fragments as plain records and fills the batches each frame. The 900-spark
cap, lifetimes, motion, the fade curve and the order of random draws are as they were. Pieces of a destroyed
ship's own model are still individual meshes (at most 32 for a capital).

## Same picture

`scripts/effects-batch-qa.mjs` stages the same bursts close to the camera on two builds (a capital explosion, a
small one, hull, barrier, beam and glancing impacts, two HADES bursts, a secondary, two muzzle flashes) and
captures five moments, without and with bloom. Compared pixel by pixel against the base build, 1280×720:

| Frame | Lit pixels | Pixels differing by more than 2/255 | By more than 16/255 |
|---|---:|---:|---:|
| Start, +2, +8, +30, +90 updates (bloom off) | 12,143 to 18,399 | 2, 0, 3, 2, 0 | 0, 0, 0, 1, 0 |
| The same with bloom | 31,440 to 49,353 | 4, 2, 7, 2, 0 | 0, 0, 0, 1, 0 |

`qa/effects-batching-20261110/close-before-after.jpg` shows four of those moments, base build above, this one
below. The distant battle frames in the first table are identical at 208 ships (largest difference 1/255 with
bloom) and differ in 74 of 921,600 pixels at 988 ships.

The few differing pixels come from draw order: a batch is drawn after the other transparent layers, where
individual sprites were sorted among them by depth. Additive layers (sparks, beams, barrier shells) give the same
sum in any order; the order only shows where a spark overlaps a fading, normally blended piece of wreckage.

## Checks

`tests/effect-batches.test.ts` (4 tests): what a pushed spark writes, the instance count drawn, the capacity
guard, blending and depth settings, the shader's depth and colour chunks, and fragment growth keeping earlier
fragments. Unit suite, typecheck and build as reported on the pull request.

## Limits

- Cloud software rendering. Draw-call counts are exact; the millisecond figures are main-thread submission time
  on this machine, not a measurement on the owner's RTX 5090. Fewer draw calls helps most where the CPU, not the
  GPU, limits the frame rate, which is the usual case for this game in a browser.
- Not done: the simulation still ticks on the render thread (see `PERFORMANCE_SIM_TICK_2026-11-10.md`); beam
  impact sprites, nuclear rings and ship wreckage pieces are still individual objects (few of each).
