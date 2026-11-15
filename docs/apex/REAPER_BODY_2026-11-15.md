# Reaper capital proportions and the Reaper view, 15 Nov 2026

## The owner's report

"reaper body, proportions look great, i just feel they might be misaligned, upside down or maybe the body is too small for the legs and its a proportion issue"

## What was checked

**Orientation: sound.** The limbs point the way the hull travels, the tail blade trails, the limbs hang below the body and the emitter is under the hood, facing forward. Nothing is upside down or back to front.

**Proportion: the body was too small for the legs.** Measured on the Sovereign-class model, which is 2 km overall:

| | Before | After |
|---|---:|---:|
| Body length | 1,060 m (53 % of the hull) | 1,281 m (64 %) |
| Body width | 278 m | 471 m |
| Body height | 290 m | 400 m |
| Limb length | 1,343 m | 1,206 m |
| Limb spread | 725 m | 807 m |
| Body width as a share of limb spread | 38 % | 58 % |

The body was shorter than its limbs and little more than a third as wide as they spread: a dart carrying a claw. Harbinger had the same build (36 %) and now has the same correction (55 %). The destroyer is meant to be four heavy legs under a compact body and is unchanged.

## The change

In `src/rendering/ships/reaper.ts`, for the six-limbed hulls only (`MANTLE`):

- the mantle is 1.4 times as broad and 1.3 times as tall above its centre line, filling out from the tail (unchanged at the tip) to the hood; its underside is where it was, so the emitter still hangs below it;
- the limbs are 0.7 of their length; the hull is still fitted to the same overall length, so the body takes up more of it;
- the limbs' outward spread is 0.64 of what it was in body radii, which leaves the knees about where they were.

Because the body is more of the hull's length, the emitter under the hood sits further forward in the fitted model: the capital's muzzle point moved from (0, −1.22, −0.22) to (0, −1.48, 1.82) units, Harbinger's from (0, −1.68, −0.22) to (0, −2.03, 2.22). The beam, the muzzle flash and the glow all read that point from the model and moved with it. `tests/reaper-carapace.test.ts` records the new points and holds the proportions.

## The Reaper view

The Reaper view (key 6) sat over the aft blade and looked forward over the hood. Over a mantle of this size the hood stood between that camera and everything ahead, so the view now sits on the brow of the hood, a little off the centre line, looking forward and down over its front lip: the hood is under the camera, the six claws reach into the frame and the main beam leaves from below it.

The destroyer's Reaper view was broken before this change: the camera sat 0.27 of a unit above the hull's centre, among its carapace plates, with a near plane of 0.2 units, and showed the inside of the hull. It now sits close behind and above the destroyer's back, with a near plane to match.

## Pictures

In `docs/apex/qa/reaper-body-20261115/`: the capital from the side, from above, from the front quarter and from the front, before and after; the Reaper view from a capital and from a destroyer, before and after. They are renders of this project's own model on a software renderer. They show shape and framing. They are not evidence of how it looks on a graphics card, and nobody has yet judged the result against the owner's own eye for the ship.

## Not done

- The limbs' own build (thickness, joints, claws) is unchanged.
- The hood's nose is still a blunt cap; a longer brow over the emitter was considered and left out to keep this change to proportion.
