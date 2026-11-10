# Local weapon light at the Reaper emitter (10 November 2026)

Rendering only. Nothing reads back into the simulation; no RNG.

## Defect

A Reaper's main weapon sits under the hood between the limb roots, so its lens is hidden from most angles, and
nothing lit the hull when it charged or fired: in the captures of a firing Sovereign-class hull the beam leaves a
dark cavity and the claws beside it are unlit (`qa/reaper-emitter-20261110/before-after-firing.jpg`, left column).

## Change

- `src/rendering/emitterLights.ts`: a fixed pool of two point lights. Every frame each hero Reaper's emitter glow
  eases toward 1 while its main beam fires and 0.55 when a shot at a target within reach is imminent (0.45 s to
  rise, 1.6 s to fade); the pool goes to the emitters that put most light on screen (charge × hull size ÷ distance,
  ties by id).
- Strength and reach scale with the hull (inverse-square; limbs a fifth of a hull length away receive roughly
  sunlight-level light at full charge; cutoff 0.6 hull lengths), so a destroyer and a capital light their own limbs
  alike. The colour is the hull's own emitter colour (Harbinger's is warmer).
- The pool never changes size and unused lights stay in the scene at zero intensity, so the scene's light count,
  and with it every compiled shader, is constant.

After: the right column of the same image. The glow sits on the inner faces of the limbs and the cavity at the beam
root; it does not wash the hull.

`tests/emitter-lights.test.ts` pins the rise and fade, the ranking and its independence from order, the scaling
with hull size, and the constant light count.

## Limits and cost

- Two lights: with more than two Reapers charging close to the camera, the rest stay unlit.
- Two more point lights are evaluated by every lit material in the scene, whether or not they are on. This was not
  measured on target hardware; the captures are cloud software rendering.
- Point lights cast no shadows here: the glow also reaches faces a real hull would shade.
- Only hero meshes (near the camera) feed the pool; instanced Reapers do not.
