# Reaper hulls break apart when destroyed (10 November 2026)

Rendering only; simulation, lengths, attachment nodes and materials are unchanged.

## Defect

A destroyed Reaper vanished whole. `BattleView.finishDeath` turned a visual's direct child meshes into debris, which
suits the other factions' flat models. A Reaper's meshes sit under one model root with its limbs on pivot groups, so
the rule found nothing: the hull disappeared in one frame and only the generic box and tetrahedron fragments were
left (`qa/reaper-breakup-20261110/before-after-breakup.jpg`, left column).

| Template | Direct child meshes (old rule) | Pieces (new rule) | Of which limbs and mandibles |
|---|---:|---:|---:|
| reaper_capital | 0 | 23 | 11 |
| harbinger | 0 | 23 | 11 |
| reaper_destroyer | 0 | 21 | 9 |
| alliance_dreadnought | 5 | 5 | 0 |
| alliance_frigate | 5 | 5 | 0 |

## Change

- `src/rendering/breakup.ts` adds `collectBreakupPieces`. It walks the visible model: each limb (the whole shoulder
  pivot subtree, so a limb stays in one piece with its claws) and each mandible becomes a piece, and so does every
  other visible mesh (carapace, hood shells, armour bands, seams, emitter housing). Hidden layers, such as the static
  stand-in limbs behind the articulated ones, never become pieces. Pieces are capped at 32 per hull, largest first.
- Every piece gets its own material clones, one per distinct source material, because debris is faded and disposed
  while the originals are shared across the fleet.
- `finishDeath` uses the collector for every faction. Flat models produce the same pieces as before.

Debris objects in the capture scene 3.2 s after the death: 36 before, 59 after (36 generic fragments plus 23 hull
pieces).

## Evidence

- `tests/breakup.test.ts`: the old rule finds nothing on a Reaper; the new one returns every limb as one piece, the
  carapace, no hidden stand-ins, no nested pieces and no material shared with the fleet; an ordinary hull is
  unchanged; the cap keeps the largest pieces.
- `qa/reaper-breakup-20261110/before-after-breakup.jpg`: the same destroyed capital 3.2 s and 7 s after its death,
  before (left) and after (right). Reproduce with `scripts/reaper-death-qa.mjs`.
- Captures are cloud Chromium with SwiftShader. Nothing here was run on a hardware GPU.

## Limits

- Pieces keep the hull's travel velocity plus a small random drift and spin; there is no directional blast from the
  killing hit and no secondary explosions along the limbs.
- The carapace separates along its existing meshes; it does not fracture.
- Ships drawn through the instanced path (150 ships and more) still die without hull pieces unless they are drawn
  as hero meshes at that moment, as before.
