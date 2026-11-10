# Camera presence for capital-scale hulls (10 November 2026)

Rendering only: camera poses. No simulation, picking or gunnery change; small hulls keep their framing.

## Defect, measured before the change

A probe ran `CameraRig` to rest on a 20-unit (2 km) hull heading +z and projected hull reference points:

| View | Before | After |
|---|---|---|
| Reaper view | camera at (0, 10, −3): half a hull length above the hull, looking at the horizon; hood top, hood front and both forward limb tips all outside the frame | camera at (−1.4, 3.4, −8.4): low over the aft blade, off the centre line, looking forward over the hood; all four points in frame |
| Follow, side-on, default wheel | 51 units away; the hull spans 25 % of the frame's width | 31 units; 45 % |
| Solo cinematic orbit | 75.6 units away, 23 units above; 16 % of the width | 44.3 units, 10.6 above; 27 % |
| Follow on a frigate (1.7 units) | 7.08 units | 7.08 units (unchanged) |

## Change

- `followLengths`, `cinematicOrbitLengths` and `cinematicOrbitHeight` in `src/rendering/cameras.ts` give the chase
  and orbit distance in hull lengths by hull size: unchanged up to 6 units (a cruiser is 5.2), easing to a closer
  hold at 20 units and beyond. The wheel still scales the follow distance.
- The Reaper view rides 0.42 hull lengths aft of the centre, 0.17 above and 0.07 to the side, and looks 0.9 lengths
  ahead and slightly down, for any heading.

Rendered in the app (cloud Chromium with SwiftShader), a capital over Earth with an Alliance line ahead:
`qa/reaper-camera-20261110/before-after-reaper-follow-cinematic.jpg` (before left, after right).

A free-camera close-up from under the hood with the limbs in the combat stance, about 1.1 km from the hull:
`qa/reaper-camera-20261110/close-under-the-hood-combat-stance.jpg`.

`tests/camera-presence.test.ts` pins the Reaper view's framing for several headings, the follow share and the
unchanged small-hull distances, and the closer, lower solo orbit.

## Limits

- Two-subject cinematic shots are framed by the distance between the ships and are unchanged; a Reaper fighting a
  target 20 km away is still small in those.
- The tactical and command cameras are unchanged.
- No field-of-view change: the lens stays at 50°.
