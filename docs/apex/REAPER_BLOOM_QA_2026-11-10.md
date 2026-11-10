# Restrained bloom on light sources (10 November 2026)

Rendering only. On with the high preset; a Bloom control in Settings turns it on or off for any preset.

## Defect

The Codex build drew straight to the canvas, so nothing that emits light spilled any. A firing Reaper's emitter, its
beam, hot damage seams, drives and windows all ended at their own edges, and the emitter in particular read as a small
orange patch (`qa/reaper-bloom-20261110/bloom-off-on.jpg`, left column).

## Change

- `src/rendering/bloom.ts`: with bloom on, the scene is drawn into a half-float target with 4× MSAA, an
  `UnrealBloomPass` adds back the blurred highlights (strength 0.1, radius 0.15, threshold 1.3 in linear scene
  light) and tone mapping happens once in the output pass. White paint in full sun is about 0.83 and cannot reach the
  threshold; every faction's drives (2.6–3.6) and the hot Reaper seams (up to 2.6) are above it.
- Beam cores get HDR brightness in the beam's own hue (`EffectsSystem.setHdrBeams`). In a linear-light frame a core
  at 0.95 no longer burns out the way stacked tone-mapped layers did on the canvas; at 2.6 it reads hot again and its
  spill keeps the beam's colour.
- `src/rendering/sceneColour.ts`: the three hand-written shaders (atmosphere, starfield, barrier shells) write
  display-referred colours. In the HDR target they would be tone mapped and encoded a second time (Earth's limb went
  from RGB 8,30,105 to 28,100,184). With bloom on they convert their output to the scene value that shows the same:
  sRGB decode, then the exact inverse of Three's ACES filmic fit. With bloom off the helpers pass colours through, so
  that path is unchanged.
- `BattleView.drawCalls` still reports the scene pass alone.

## Measurements (cloud Chromium with SwiftShader, 1280×720)

| Check | Bloom off | Bloom on |
|---|---|---|
| Earth's limb, two sample pixels | (8,30,105), (8,29,100) | (9,30,104), (10,29,99) |
| Stars brighter than level 60 in a sky crop, three frames | 69, 81, 76 | 70, 82, 77 |
| Brightest star level | 251–253 | 235 (held at the ceiling so a star is not a 9× source) |
| Mean frame luminance, Earth orbit wide | 2.55 | 2.53 |
| Mean frame luminance, Reaper firing from the side | 8.82 | 10.33 |
| Mean frame luminance, Reaper firing, beam across the frame | 24.26 | 33.84 |

The increase in the last two rows is the beam and emitter themselves: hulls, planet, moon and stars are unchanged in
the pairs.

Reproduce with `scripts/bloom-qa.mjs`.

## Limits

- Nothing here was run on a hardware GPU. The extra cost is one half-float MSAA scene target and the bloom's mip
  chain; it was not measured on the RTX 5090, and SwiftShader frame times say nothing about it.
- The brightest stars are 16 levels dimmer with bloom on (the ceiling above).
- Additive sprites (explosions, engine glow sprites, impact flashes) now add up in linear light before tone mapping,
  so dense stacks read a little hotter than before; their materials were not retuned.
- Medium and low presets are unchanged unless the Bloom control is set to On.
