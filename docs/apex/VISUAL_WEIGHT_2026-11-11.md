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

## Second pass, same day: the flashes

The picture above was not clean because tracers were only part of it. Three more things made a fighter fight a
field of sparks, and each was a size rule with a floor meant for larger ships:

| What | Before | After |
|---|---|---|
| Muzzle flash of any gun below main calibre | grows to 156 m | in proportion to the round: a fighter's cannon 19 m, a frigate's gun 32 m |
| Hit by a fighter's 6-damage round | a 43 to 100 m burst and two sparks | a 17 to 39 m burst, no sparks |
| Death of a 36 m fighter | a 150 m explosion, 330 m flash, four clouds of smoke for up to 8 s, four pieces of wreckage | a 47 m explosion, one cloud, one piece |

Main-gun flashes, hits of 100 damage or more and the explosions of every hull from the frigate up are exactly as
they were (`tests/visual-weight.test.ts` holds each against the old rule).

Measured over the Battle of Earth (prime_apex, seed 1, first 120 s; 58 main-gun shots and 2,708 lighter ones):

| | Before | After |
|---|---:|---:|
| Main guns' share of muzzle-flash area | 35.5 % | 90.8 % |
| Area light guns' flashes cover | 100 % | 5.6 % |
| Area the flashes of hits under 100 damage cover | 100 % | 59 % |
| Sparks thrown by hits under 100 damage | 494 | 0 |
| Sparks thrown by all hits | 915 | 421 |

`qa/visual-weight-20261111/fighter-melee-before-after.jpg`: 24 Tridents and three frigates against 24 Oculus and a
destroyer, 7.5 s in, same camera, the same shots drawn in both (cloud software rendering). The upper picture is
the build before the fighter models, engine glow and these flashes changed; the lower is with all three. What
stands out in the lower one is the frigate's main gun and the destroyer's beam.

## Not done, from the same report

- "Correct colour for actual organic fighters": nothing was recoloured. The owner was asked which colour is meant.
  With the glow, the lit canopy and the flashes gone, each fighter now shows its faction's own hull colours
  (`FIGHTER_MODELS_2026-11-11.md`).
- The Alliance carrier is rebuilt in its own change; other factions' capitals are still the older block models.
- Whether fighters are now too hard to see is the owner's to judge on their own hardware.

## Tests

`tests/visual-weight.test.ts` (6: three for tracers, point defence and distant fighters; three for flashes, hits and explosions).
