# Reaper limb stances: travel and combat (10 November 2026)

Rendering only. The rig reads the simulation and writes nothing back; no RNG, no hull, hitbox or weapon change.

## Defect, measured on the rig before the change

A probe built each hull, captured its rig and stepped `animateReaperRig` for a minute idle and for 40 s engaged and
firing, tracking the forward tip of every lower limb:

| Hull | Idle cycle, furthest tip travel | Engaged and firing, tip shift | Claw-tip span, idle → engaged |
|---|---:|---:|---:|
| Sovereign-class (20 units, 2 km) | 0.145 units (15 m) | 0.143 units (14 m) | 5.06 → 5.32 units |
| Destroyer (1.6 units, 160 m) | 0.035 units (4 m) | 0.033 units (3 m) | 1.01 → 1.05 units |

The limbs were articulated but, at fifteen metres on a two-kilometre hull, visibly static, and going into combat
changed nothing.

## Change

- Two stances per class in `REAPER_STANCE` (src/rendering/reaperMotion.ts): under way the limbs are gathered and
  swept forward; in a fight the shoulders open outward and the lower limbs curl the claws in around the emitter.
  Each pivot rotates about its own limb hinge (stored on the pivot by the builder), on top of the servo wobble.
- Combat stance when the ship's target is alive and within 1.1 × the reach of its main battery (read in
  `BattleView`), or while a beam is firing; firing flares the shoulders a little further.
- Heavy and independent: an exponential approach with a smoothstep on top, about 7.5 s for a capital and 2.8 s for a
  destroyer, and every limb runs on its own clock (±25 % in pace, ±12 % in reach), so the limbs open one after
  another instead of as a rigid fan. The idle wobble of capitals is slightly larger (22 m of tip travel).
- The hidden static stand-in limbs used beyond the articulated range keep the neutral pose.

## After

| Hull | Idle cycle, furthest tip travel | Engaged and firing, tip shift | Claw-tip span, travel → combat |
|---|---:|---:|---:|
| Sovereign-class | 0.217 units (22 m) | 2.298 units (230 m) | 4.51 → 7.58 units |
| Destroyer | 0.035 units (4 m) | 0.214 units (21 m) | 0.98 → 1.17 units |

Rendered (cloud Chromium with SwiftShader): `qa/reaper-stances-20261110/capital-travel-and-combat.jpg` (travel left,
combat right; aft quarter above, head-on below) and `destroyer-combat.jpg`.

`tests/reaper-stance.test.ts` pins the opening and the return, the pace (a capital is under 55 % open after two
seconds; a destroyer is quicker), that limbs differ mid-transition, that the same rig and inputs give the same pose,
and that the hull and muzzle never move.

## Limits

- Ships beyond the articulated range (ten hull lengths, at most 12 to 24 rigs a frame) and instanced Reapers show
  the neutral pose; a hull crossing that range mid-fight changes pose at a size of about a tenth of the frame.
- Hull rotation, acceleration and inertia are the simulation's and unchanged here.
- Judged from software-rendered stills and the measured numbers, not from motion on target hardware.
