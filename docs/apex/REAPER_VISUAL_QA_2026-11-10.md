# Reaper visual overhaul, slice 1: carapace, limbs and graphite materials (10 November 2026)

Rendering only. No simulation, data, collision or weapon change. Original procedural geometry; no extracted or
licensed meshes, and no reference imagery is stored in the repository.

## Defect, reproduced before any change

Captured from `b7c0b36` with `scripts/reaper-visual-qa.mjs` (cloud Chromium with SwiftShader):

- The rendered lengths already matched the catalogue (Sovereign-class 20 units = 2,000 m, Harbinger 24, destroyer
  1.6, frigate 1.7; 1 unit = 100 m), so the hulls were not undersized. They read as small because of what they were
  made of.
- Six smooth glossy tubes with ball joints carried the whole silhouette; the body was a short smooth lathe with no
  layered plating, cavity, dorsal ridge or tail housing.
- The palette was a navy, plastic-like gloss with pink running lights; nothing on the surface gave a sense of size.

Before: `qa/reaper-visual-20261110/before-capital-quarter.jpg`, `before-capital-close.jpg`,
`before-destroyer-quarter.jpg`, `before-fleet-20-tactical.jpg`.

## What changed

- **Carapace.** A lofted hull from superellipse sections replaces the lathe: a long tapering aft blade with a dorsal
  ridge and a split tail housing, overlapping longitudinal armour bands, and a bulky forward hood of stepped shells.
  Per-part albedo offsets of about ±6 % ride in vertex colours, so plates are not one flat tone. No textures.
- **Ventral cavity.** A recessed, ribbed underside in the charcoal recess material where the limbs root.
- **Limbs.** The rig's pivots and names are unchanged; the tube segments are faceted tapered sleeves wrapped in
  overlapping plate rings, with mechanical knuckles instead of spheres and blade claws. The static stand-in limbs
  match the articulated ones.
- **Class identity.** Harbinger keeps a broader hood, dorsal fins, lateral scythes and its warm tint; the destroyer
  is a compact body on four dominant legs with cheek guards. The Ascendant still builds from the same rig.
- **Materials.** The design note's palette (0x0e1016 at metalness 0.85) left about 1 % albedo and almost no diffuse
  term: rendered, every hull was a flat black cut-out. Hull, recess and plate tones are now a mid-dark graphite at
  metalness 0.5–0.68 with broad highlights. Seams are thin and pale; the running lights are few and small; the
  aperture is a single warm emitter in a dark cowl under the hood.

After: `after-capital-quarter.jpg`, `after-capital-close.jpg`, `after-capital-aft-quarter.jpg`,
`after-capital-frigate-scale.jpg`, `after-capital-medium.jpg`, `after-capital-distant.jpg`,
`after-fleet-20-tactical.jpg`, `after-capital-earth-orbit-*.jpg`; six views plus quarter and close views of each
class as `after-<class>-{top,bottom,left,right,front,rear,quarter,close}.jpg`.

## Measured

| Template | Length (units) | Muzzle | First engine node | Triangles shown, before → after | Vertices shown | Structural share of vertices | Materials |
|---|---:|---|---|---:|---:|---:|---:|
| reaper_capital | 20 → 20 | unchanged (0, −1.223, −0.219) | unchanged (0, 0, −9.928) | 9,628 → 12,432 (1.29×) | 9,516 → 30,227 | 54 % → 84 % | 5 → 7 |
| harbinger | 24 → 24 | unchanged (0, −1.678, −0.224) | unchanged (0, 0, −11.85) | 11,464 → 13,352 (1.16×) | 15,024 → 32,987 | 35 % → 75 % | 5 → 7 |
| reaper_destroyer | 1.6 → 1.6 | unchanged (0, −0.196, 0.028) | unchanged (0, 0, −0.765) | 7,772 → 10,056 (1.29×) | 9,040 → 23,687 | 41 % → 77 % | 5 → 7 |
| reaper_ascendant | 300 → 300 | unchanged | unchanged | 9,784 → 12,616 (1.29×) | 9,888 → 30,683 | 56 % → 84 % | 6 → 8 |

- Vertices grew more than triangles because the armour is flat-shaded (faces do not share vertices).
- "Structural" means not in `DETAIL_MESH_NAMES`: the carapace and limb armour now survive the reduced level of
  detail and instanced batches, where the old plates were dropped beyond 70 hull lengths.
- Two more materials per class means two more instanced draw calls per Reaper class in battles of 150 ships or more.
- `tests/reaper-carapace.test.ts` pins the lengths, the muzzle and engine positions within 2 %, the triangle
  budgets and the structural share. Gate: typecheck clean; full unit suite green; build clean.

## What still falls short

- Surfaces are faceted plates, not continuously curved shells; up close the facets read as panels, at a few hull
  lengths as banding. There are no normal maps or surface micro-detail.
- The limbs still reach forward in a tight bundle at rest; the travel and combat poses and heavier motion belong
  to the motion slice.
- The emitter sits under the hood between the limb roots and is hard to see from most angles until it fires.
- No bloom or exposure work in this build; light response to nearby weapons fire and damage is unchanged.
- Hero Reapers never drop to the reduced level because `applyLod` only walks a visual's direct children; that and
  the remaining detail-level policy are the next slice.
- All captures are software-rendered in the cloud. They show shape, materials and framing, not performance, and
  nothing here was measured on the target RTX 5090.
