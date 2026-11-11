# Local GPU Edition: the local hardware profile (11 November 2026)

## Defect

The Local GPU Edition (`PLAY_LOCAL_GPU.cmd`) built and served the game on the player's own machine and then
opened it with the web build's settings: the High preset, at most two device pixels per CSS pixel, ship detail
dropped beyond 70 hull lengths, the simulation on the drawing thread. Nothing in it used a strong graphics card
or a many-core processor, and a bigger battle meant typing every ship count by hand.

## Change

- **Ultra quality preset.** Ship detail meshes (windows, accents, engines, lights) and the switch from model to
  point both hold three times further out; the canvas is drawn at up to three device pixels per pixel (a 4K display
  at 150 % scaling is drawn at its native 3840×2160); bloom is on with eight-sample antialiasing of the scene, capped
  by what the GPU offers.
- **Local hardware profile.** Ultra, native resolution, and the simulation in a Web Worker so a large battle's
  tick does not hold up the picture. The launcher opens the game at `/?profile=local-gpu`, which applies the profile
  the first time; anything the player changes afterwards is kept. Settings has it as a button.
- **Fleet scaling.** Custom Battle has *Halve fleets*, *Double fleets* and *Fleets ×4*, applied to every fleet on
  both sides and to reinforcements.

## Measured

`scripts/local-gpu-profile-qa.mjs`, a real browser on a 3x-density 1280×720 display, the same seeded 184-hull
battle from one fixed camera, opened as the web build and as the launcher opens it:

| | Web address | Launcher address |
|---|---|---|
| Quality preset | high | ultra |
| Drawing buffer | 2560×1440 | 3840×2160 |
| Hulls in full detail | 28 of 184 | 64 of 184 |
| Hulls drawn hull-only | 156 | 120 |
| Simulation | drawing thread | worker |
| WebGL errors, page errors | none | none |

The Settings button gives the same preferences. Fleet scaling took the default custom battle from 68 hulls to
136, then 544, then back to 272.

## What this does not show

- **No real GPU has drawn this.** The measurements are from cloud Chromium with a software renderer: they show
  what the game asks for, not the frame rate or the look on an RTX 5090. Ultra draws 2.25 times the pixels of
  High on that display and more geometry; whether that holds 60 frames a second in a 2,000-hull battle is for the
  owner's machine to say.
- The launcher itself is a Windows script and was not run here. What was run is the address it opens.
- The worker simulation is still marked experimental in Settings.
- Fleet scaling changes counts only; nothing was tuned for very large battles.

## Tests

`tests/hardware-profile.test.ts` (7), `e2e/local-gpu-profile.spec.ts` (2).
