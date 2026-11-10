# Alliance line hulls: dreadnought and cruiser rebuilt, matt paint (10 November 2026)

Rendering only. Simulation, catalogue, weapons, lengths, muzzle and engine nodes are unchanged.

## Source and limits

The owner supplied a private pack of fleet reference frames for analysis. None of it is in this repository: no
frame, no video, no mesh. Everything here is original procedural geometry written as outlines and boxes in
`src/rendering/ships/alliance.ts`, and every image under `qa/alliance-hulls-20261110/` is a render of this
project's own models.

## Defect

Compared with the reference silhouettes, our Alliance line ships had four visible faults
(`qa/alliance-hulls-20261110/dreadnought-before-after.jpg` and `cruiser-before-after.jpg`, upper row of each pair):

1. The dreadnought and the cruiser were the same three-rail box at two scales, so the classes could not be told
   apart by outline.
2. Neither had the Alliance capital shape: a broad flat deck narrowing to a long spinal blade, with the command
   citadel stepped up over the aft third. Ours was a narrow box with a small bridge forward.
3. The paint was a half-metal gloss (metalness 0.5, roughness 0.42). Sunlit decks clipped to white.
4. Lit ports were eight large blocks a side, which made a 900 m ship read as a small one.

## Change

- `buildAllianceDreadnought`: a mirrored arrowhead deck outline, 0.30 of the length wide aft, narrowing to a blade
  around the main gun; a raised second armour tier; a stepped citadel over the aft third with a dark sensor block,
  bridge strip and masts; a raised slab fin on a pylon each side of it; a dark ventral tier and keel under the pale
  deck; blue deck inlays; panel lines; broadside casemates; 36 small lit ports a side along the deck edge.
- `buildAllianceCruiser`: its own outline, a deck that forks into two forward prongs either side of the gun spine,
  a low bridge aft, a blue stripe along each prong, 26 ports a side, two drives.
- Alliance palette (`src/rendering/materials.ts`), which every Alliance class shares: hull to matt paint
  (metalness 0.16, roughness 0.76, slightly greyer), `hullDark` darker and less glossy, accent a deeper blue.
- `buildAllianceGunship` now only builds the heavy hull of the Omaha, Aegis and Valkyrie, which is what it was
  still used for; its geometry is identical (1,952 triangles, same bounds).

## Measured

| | Before | After |
|---|---:|---:|
| Dreadnought triangles | 1,352 | 1,660 |
| Cruiser triangles | 1,064 | 1,176 |
| Dreadnought length : beam, length : height | 3.40, 6.48 | 3.12, 6.13 |
| Dreadnought half-beam at stations -0.25, +0.05, +0.30, +0.42 of length | 0.122, 0.117, 0.065, 0.018 | 0.150, 0.106, 0.026, 0.016 |
| Cruiser half-beam at the same stations | 0.117, 0.113, 0.063, 0.060 | 0.135, 0.135, 0.135, 0.016 |
| Clipped-white pixels (all channels at 250 or more), dreadnought quarter / close view | 3,414 / 3,998 | 0 / 0 |
| Clipped-white pixels, cruiser quarter / close view | 3,559 / 4,042 | 0 / 0 |
| Muzzle and engine nodes, both classes | | identical to five decimals |
| Meshes per hull | 5 | 5 (`hull, hullDark, accent, engine, windows`) |

The extra triangles are almost all ports (876 of the dreadnought's 1,660), which sit in the `windows` mesh that
the reduced level of detail hides, so distant ships cost less than before: the dreadnought's two meshes that
remain at distance (`hull`, `hullDark`) fall from 920 to 556 triangles.

The clipped-pixel counts were taken on the base build, where bloom still spread sunlit white paint into a glare
(the separate fix for that is the colour-aware bloom threshold). The paint change alone removes the clipping in
these views; the two changes are independent.

## Level of detail and instancing

`qa/alliance-hulls-20261110/fleet-206-instanced.jpg`: 24 dreadnoughts, 120 cruisers and 60 frigates (206 ships
with the two Reaper destroyers, above the 150-ship instancing threshold) from three distances. The hulls draw
through the instanced path, drop to the reduced tier and then to points as before; no page or shader errors.

## Also affected

- `compact_siege` and `compact_gunship` are restyled copies of these two hulls and take the new shapes. They are
  rescaled from measured bounds, so their catalogue lengths still hold.
- Every other Alliance class takes the matt paint (`frigate-paint-before-after.jpg`). The frigate, carrier and
  fighter geometry is not changed here.

## Checks

`tests/alliance-hulls.test.ts` (8 tests): length, exact muzzle and engine nodes, five merged meshes, triangle
ceilings, proportions, the arrowhead and fork outlines, the citadel aft, the port rows, the paint bounds, and the
Omaha hull unchanged. Unit suite: 66 files, 404 tests pass. Typecheck and build clean.

Renders are from cloud Chromium with SwiftShader (software). They show shape, paint and lighting. They are not a
check on the owner's hardware, and the look has not been judged by the owner.

## Not done

Hull weathering and fine panel texture (the hulls are flat-shaded paint), the Alliance mark, the frigate's
silhouette, the carrier, and the other factions' fleets.

Reproduce: `node --import tsx/esm scripts/alliance-hull-qa.mjs <outDir> <baseURL> <label> <repoRoot>`.
