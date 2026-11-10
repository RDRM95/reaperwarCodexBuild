# Instanced Reapers merged their hidden stand-in limbs (10 November 2026)

## Defect

`InstancedFleet.createBatch` (src/rendering/instancedFleet.ts) merged every mesh under a ship template into the per-material
batches used for battles of 150 ships and more. The Reaper rig (src/rendering/ships/reaper.ts) carries a static stand-in
limb layer, `reaper-static-arms` and `reaper-static-seams`, kept hidden (`visible = false`) behind the articulated limbs
that heroes animate; the batch ignored visibility, so every instanced Reaper was drawn with both layers.

Measured on `b7c0b36` with a Node probe that builds each template and sums vertices under invisible ancestors:

| Template | Meshes | Vertices | Triangles | Vertices under hidden layers | Visible detail | Visible structural |
|---|---:|---:|---:|---:|---:|---:|
| reaper_capital | 60 | 22,260 | 13,876 | 12,744 (57 %) | 4,392 | 5,124 |
| harbinger | 61 | 27,768 | 15,712 | 12,744 (46 %) | 9,720 | 5,304 |
| reaper_destroyer | 46 | 17,536 | 10,604 | 8,496 (48 %) | 5,328 | 3,712 |
| alliance_dreadnought | 5 | 4,056 | 1,352 | 0 | 1,296 | 2,760 |

The instanced parts of a 1,000-ship battle (60 capitals, 40 destroyers, 800 frigates, 100 cruisers; 48 capitals instanced
once the 96 hero meshes are taken) before the fix: `hull plates reaper-arm-plate reaper-arm-seam reaper-joint
reaper-static-arms(9,864 v) reaper-static-seams(2,880 v) eye eye lights`; after: the same list without the two static parts.

## Fix

The batch now skips any template mesh with an invisible ancestor inside the template. Hero meshes clone the hierarchy
and are unaffected. `tests/instanced-template-batch.test.ts` pins the batch's vertex count to the template's shown
vertices for the three Reaper classes and for a template without hidden layers.

## What a player sees

At rest the static layer coincides with the articulated limbs, so the duplicate was not a second visible set of limbs:
the same 1,000-ship frame captured before and after the fix from a camera inside the Reaper line is the same picture
(33 of 1440000 pixels differ by more than 8/255). The gain is draw work: 57 % fewer vertices per instanced Sovereign-class
hull, 48 % per destroyer, and no coincident surfaces fighting for depth. The remaining instancing gap, plates, eye and
lights dropped at the reduced level because `plates` is a detail mesh name, is left to the carapace rebuild, which names
structural parts deliberately.

## Also in this change

`buildReaperAscendant` scaled from the Sovereign's 20 units instead of the spined rig's 24, so the Ascendant rendered at
360 units (36 km) against its catalogue 30 km. It now scales from its own base length to 300 units.
