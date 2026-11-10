# Simulation tick at high ship counts (10 November 2026)

Simulation only. Results are bit-identical: no rule, number or outcome changes.

## Defect

The simulation runs on the render thread at 20 ticks per second. One tick cost 14 ms at 552 ships, 30 ms at 1,104 and
64 ms at 2,208 (bundled build, this machine), so every tick blocked one or more display frames and above about 1,700
ships the battle could not keep real time at 1× speed.

Profile at 1,104 ships: the separation query was about 30 % of a tick (each hull scanned a block of up to 729 grid
cells through a hash map to find about 17 neighbours, allocating vectors per pair); weapon target searches ran about
10,800 times per tick and visited about 1,300 candidates in total (point-defence mounts with a 2.4 km reach rescanning
with the enemy tens of kilometres away); `shipEngagementRange` allocated three arrays per call, every hull, every tick.

## Change

- `src/simulation/separation.ts`: members in parallel typed arrays; the occupied grid stored as sorted slabs, columns
  and cells, so a query walks only cells that exist; scalar pair maths with no allocation. Neighbours are visited in
  the same order and every operation is the one it replaced.
- `src/simulation/weaponTargetField.ts`: a search returns at once when the enemy's bounding box at the snapshot is out
  of reach; otherwise candidates are collected once around the first mount that asks and reused by the hull's other
  mounts of the same range. Both visit a superset of every enemy in range; callers pick by score and ship index.
- `src/simulation/battle.ts`: a ready mount skips its firing solution when no enemy (and, for point-defence lasers, no
  hostile missile) is within its range plus the hull's largest mount offset of the hull's centre.
- `src/simulation/ai.ts`: `shipEngagementRange` in one pass; two loop invariants hoisted in `chooseTarget`.

## Measurements

Mean simulation tick, `scripts/scale-benchmark.ts` bundled with esbuild, seed 42, 40 simulated seconds, this machine
(a cloud container; a desktop CPU will be faster in absolute terms):

| Ships | Before | After | Share of one core at 1× speed, before → after |
|---:|---:|---:|---:|
| 552 | 14.0 ms | 5.8 ms | 28 % → 12 % |
| 1,104 | 30.0 ms | 12.6 ms | 60 % → 25 % |
| 2,208 | 64.4 ms | 26.8 ms | 129 % → 54 % |

State digests (every ship's position, velocity, heading, hull, target and the full event sequence) of four seeded runs
at 92, 276, 552 and 1,104 ships are identical before and after. `tests/separation-exact.test.ts` compares the new
separation field bit for bit with the implementation it replaced, kept in `tests/helpers/separationReference.ts`.

`scripts/frame-benchmark.mjs` measures the main-thread cost of one tick, one view update and one render call in a
browser page. On the base build it showed the view update at 1–2.4 ms and the render call at 6–8 ms at every fleet
size, the latter from about 1,100 draw calls of which about 700 are individual explosion sprites and about 200 debris
fragments.

## Limits

- The tick still runs on the render thread. At 2,208 ships it is 27 ms here, more than one display frame, so frames
  still drop 20 times a second at that size. Moving the simulation to a worker (stage 2 of
  `docs/EXTREME_SCALE_BRIEF.md`) is the change that removes that; it is not in this work.
- The remaining profile is flat: separation about 12 %, garbage collection about 10 % (vector temporaries in movement
  and AI), target choice about 9 %.
- Nothing here was measured on the owner's hardware, and browser frame rate was not measured at all: headless
  Chromium here rasterises in software.
