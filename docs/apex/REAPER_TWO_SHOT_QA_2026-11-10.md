# Cinematic two-shot: a Reaper and a distant target, over the Reaper's shoulder (10 November 2026)

Camera only. Simulation, models and the director's choice of pair are unchanged.

## Defect

A two-ship cinematic shot stood off to the side of the midpoint between the ships, at a distance proportional to
their separation. That suits two ships a few lengths apart. For a 2 km Reaper firing at a target several kilometres
away it made both ships small: the Reaper spanned a fifth of the frame's width at two hull lengths and less with
every kilometre (`qa/reaper-two-shot-20261110/before-after-two-shot.jpg`, left column).

| Separation (a 20-unit Reaper and a cruiser) | Reaper's share of frame width, before | After |
|---|---:|---:|
| 40 units (2 hull lengths) | 20.1 % | 24.4 % |
| 80 units | 19.6 % | 46.6 % |
| 120 units | 14.4 % | 46.6 % |
| 200 units | 9.7 % | 46.6 % |
| 400 units | 4.9 % | 46.6 % |
| Frigate pair, 30 units apart | 5.5 % | 5.5 % |

## Change

`overShoulderWeight(size, separation)` in `src/rendering/cameras.ts` is 0 for small hulls and close pairs and reaches
1 for a capital-scale hull whose partner is 3.5 hull lengths away or more. The two-shot blends by that weight from
the side-on framing to a position behind and beside the larger ship (0.8 lengths back along the line to its partner,
0.55 to the side, 0.27 up), looking 1.1 lengths ahead of it down that line. The larger ship is the foreground
whichever end of the pair the director named first, and the partner stays in the picture.

## Evidence

- `tests/camera-presence.test.ts`: the Reaper spans more than 40 % of the frame at 80, 120, 200 and 400 units with
  the target in frame; the same when the Reaper is the second ship of the pair; frigate pairs and close pairs keep
  the exact side-on camera position.
- `qa/reaper-two-shot-20261110/before-after-two-shot.jpg`: the same firing Reaper and its target in the cinematic
  camera at 1.9, 4.3 and 9.8 km separation, before and after. Reproduce with `scripts/cinematic-two-shot-qa.mjs`.
- Captures are cloud Chromium with SwiftShader. Nothing here was run on a hardware GPU.

## Limits

- At long range the target is a small shape at the end of the beam; the shot shows the Reaper and the line of fire,
  not the target's detail. The director still cuts to the target's own shots as before.
- The camera does not check for other hulls between it and the Reaper.
- Wide battlegroup shots and solo orbits are unchanged.
