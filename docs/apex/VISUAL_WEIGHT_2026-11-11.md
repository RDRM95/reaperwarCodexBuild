# Visual weight of weapon fire and fighters (11 November 2026)

## Report

Owner, from playing: fighters "draw too much visual attention compared to main weapons, looks messy like rat a tat
gunfire or sparks, sloppy, want it improved or gone".

## What it was

Looked at in a rendered frame of the Battle of Earth at 65 s (47 fighters aloft), it was three things, and the
fighters' own guns were the least of them:

1. **Secondary guns.** Every round below main calibre was drawn 45 m wide; a dreadnought's slug is 110 m. Over
   the looks taken in that battle there were 507 lighter rounds in the air and 7 main rounds, 92 % of them from
   cruisers and frigates. Main-battery rounds took 12 % of the picture area tracers cover (13 % in the Final
   Battle of Earth).
2. **Point-defence lasers.** GARDIAN and Reaper anti-fighter fire was drawn as full-brightness additive lines,
   each lasting a tenth of a second.
3. **Distant fighters.** A craft too far away to be drawn as a model is drawn as a 220 m glow in its faction's
   engine colour. A fighter got the same brightness as a frigate.

## Change

`src/rendering/visualWeight.ts`, used by the tracer, point-defence and far-point code:

- A round below main calibre is a fine streak sized by its damage: a fighter's cannon 8 m wide (was 45 m), a
  frigate gun 11 m, a cruiser gun 15 m, and shorter in proportion. Main-battery slugs are drawn as they were.
- Point-defence lines are drawn at 0.28 of their old brightness (0.45 for the Reapers' red ones).
- A distant fighter's glow is drawn at 0.3 of its old brightness. Other classes are unchanged.

Nothing in the simulation changes: the same shots are fired and hit.

## Measured

| | Before | After |
|---|---:|---:|
| Main-battery share of tracer area, Battle of Earth | 12 % | 53 % |
| Main-battery share, Final Battle of Earth | 13 % | 52 % |
| Area all tracers cover | 100 % | 22 % |

`qa/visual-weight-20261111/weapon-noise-before-after.jpg`: the same moment and camera before and after (cloud
software rendering). In it the fighters' blue glows are plainly fainter and the tracers finer. **It is not a clean
picture yet:** the count of bright pixels over space fell only from 1,055 to 941, because most of what is left in
that frame is something else (see below). No point-defence line happens to be in that frame, so its dimming is
shown by the code and the unit test, not by the picture.

## Not done, from the same report

- The loose grey specks around a fight are hull debris and close fighters drawn as models, not weapon fire.
  They are untouched.
- "Correct colour for actual organic fighters" and "improve ship": the fighter model and its colours are
  unchanged. I was not sure which colour is meant; the distant glow uses each faction's engine colour.
- "Rework low grade blocky designs for better likeness as per reference pack": not started. The Alliance
  dreadnought, cruiser and frigate were rebuilt on 10 November; the carrier, the fighters and the other factions'
  hulls are still the older block models.

## Tests

`tests/visual-weight.test.ts` (3).
