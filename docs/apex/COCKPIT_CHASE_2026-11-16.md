# Cockpit, fixed chase cameras and the automatic gun camera (16 Nov 2026)

Owner's request: "trident fight/oculus fps view, cockpit or unique optic hud, fixed chase cams, auto switch to new
gunnary view, main canon view".

## Before

There was no view from inside a fighter or an Oculus. The only camera behind a ship was the follow camera, which
the mouse turns and which eases behind a turning ship. The gun sight was entered and left by hand.

## The Cockpit camera (key 9, or the Cockpit button)

The eye is in a seat in the followed ship, fixed to the hull, looking where it points. Nothing is eased and the
mouse does not turn it. With no ship followed the seat is a fighter's, if one of ours is flying; asking for the
Cockpit again while in it moves to the next fighter. Its field of view is 66 degrees (every other camera is 50).

What is drawn over the picture depends on the hull:

| Hull | Seat | Overlay |
|---|---|---|
| A piloted fighter (the Trident and the other five) | above the fuselage, a tenth of the craft ahead of centre, so its nose is in the picture | a **canopy**: two struts and a sill, in the faction's colour; speed, hull, barrier, gun, torpedoes; target, range and its barrier or hull |
| An Oculus, and any other Reaper | the front of the eye; a Reaper's brow | an **optic**: a round red field with scan lines and a slow dashed ring; "VELOCITY", "INTEGRITY", "EMITTER", "FIELD", "HARVEST <target>" |
| A warship | a bridge on its back, a fifth of its length ahead of centre, the bow reaching out below | a **bridge** window: brow, sill and two mullions; the same instruments |

A bracket marks the ship's target wherever it is in the picture. The words are rewritten ten times a second; the
bracket follows every frame.

One defect found and fixed on the way: a camera mode normally eases in from where the last camera was. For a
cockpit that meant flying in through the hull, and for its first second the eye was a thousand units from its seat.
The cockpit camera, like the gun sight, is now in place on its first frame.

## The Chase camera (key 0, or the Chase button)

A fixed place behind the followed ship, in the ship's own frame: it turns, climbs and dives with the hull, travels
with it at any frame rate, and the mouse does not turn it. Asking again steps to the next position:

Tail · High tail · Starboard quarter · Port quarter · Close tail

## The automatic gun camera (key G, or the Gun cam button)

While it is on and the camera is with one ship (Ship follow, Chase or Cockpit), the view cuts to that ship's
main-gun sight 1.2 s before the gun is ready, stays for the shot and 2.6 s after it, and cuts back to the camera
it came from. Rules:

- Only a main cannon earns the cut: a gun that reloads in under 8 s is left alone, or the picture would flicker
  between two cameras. That includes the NOVA Array, the KRONOS Lance, the Aegis and Omaha guns and a Reaper's
  main beam, and leaves out an ordinary dreadnought's four-second gun.
- No cut without a target in range.
- If the gun does not fire within 7 s the view goes back, and does not cut in again until that gun has reloaded.
- If you take the camera somewhere else during a cut, it is not pulled back.

Both new cameras are also in theatre mode's strip.

## Checks

- Unit: `tests/cockpit-chase.test.ts` (11): the eye is in the seat and aligned on the first frame and after the
  hull moves and turns; the mouse turns neither camera; each chase position is where its table says; the chase
  camera stays with a ship at speed at an uneven frame rate; the instruments' words; every branch of the gun
  camera's decision.
- Browser: `e2e/cockpit-chase.spec.ts` in a running battle: key 9 seats a fighter with a canopy; again, the next
  fighter; an Oculus gets the optic; key 0 steps the chase positions; with G on, following a Reaper capital, the
  view cuts to its gun sight and back by itself.
- Pictures (software renderer): `docs/apex/qa/cockpit-chase-20261116/`.

## Limits

- The canopy, optic and bridge are flat overlays, not modelled cockpit interiors.
- The camera does not bank with a turning ship: its horizon stays level, as every camera here does.
- A camera-panel button was first labelled "Auto gun cam (G)". At 1280 x 720 that wrapped the camera panel to a
  fourth row and the existing gun-sight test failed (its captions were measured against the panel a frame before the
  panel's new height was laid out). It is labelled "Gun cam (G)" and the panel keeps three rows.
- Nothing here was seen on a graphics card.
