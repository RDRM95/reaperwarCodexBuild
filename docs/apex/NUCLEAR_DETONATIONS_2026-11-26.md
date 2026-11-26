# Nuclear detonations, the weapon hierarchy, sound and accessibility (26 Nov 2026)

Owner's brief, "APEX — Fleet combat and weapons visual overhaul", sections 3 to 7.

## Before

A HADES detonation was one white sprite, a ring of the kind used here for a shock wave, ten sparks and three puffs
of smoke: the same picture at every weight but for its size, drawn at the instant of the strike, at the centre of
the hull. There was no external nuclear detonation. Every main-battery round from 600 damage to 520,000 was drawn
as the same tracer with the same muzzle flash, unless it carried a blast.

## What exists in this simulation, and what does not

The brief names a "nuclear battery" (external detonation) and a "nuclear penetrator" (internal). This build has:

- **A penetrator: the HADES round.** Under timelines with HADES rounds every conventional mass accelerator fires
  one. The simulation reserves 35 % of the round for its warhead and applies it inside the hull only if the round
  reached the hull (`applyProjectileDamage`), reporting `hades_detonation`. That event is the only thing that
  draws an internal detonation. A round that missed, or a missile shot down, never reports one.
- **No external nuclear battery on any Mass Effect faction's ship.** The only weapons here that go off against
  what stops them are missiles and torpedoes. Two of them are nuclear in their own fiction and are now marked so
  (`warhead: 'nuclear'`, a field that changes drawing and sound and nothing else): the Imperial Navy's heavy void
  torpedo (`wh_torpedo`) and Skynet's orbital missile (`skynet_missile`). Their damage is what it was. **If the
  Alliance or the Hierarchy should carry an external nuclear battery, it has to be added as an AU weapon on a
  ship: that is the owner's to decide** (which ships, and at what cost to the balance of fleets that have them).

No yield is stated or invented anywhere. The size and weight of a detonation come from the damage the simulation
already gave the warhead.

## How a detonation is drawn (`src/rendering/nuclear.ts`)

Vacuum: no fireball that rises, no smoke, no blast wave.

| | External warhead | Penetrator's warhead (internal) |
|---|---|---|
| When | At the strike | A beat after it: 0.12 s for an escort's round to 0.24 s for the heaviest, which goes deeper |
| Where | Off the surface that stopped it, on the side it came from | Inside the hull, between where the round went in and the hull's centre; it stays with the hull |
| Flash | White, three times the cloud's size, a tenth of a second, with the streak a sensor makes of it | The glare of it through plating, drawn through the hull, no larger than the hull allows |
| Then | A cloud of luminous vapour that runs out fast and slows, mottled and ragged, cooling from white through yellow and orange to dull red in 1.3 to 2.5 s; ahead of it the fastest vapour as thin broken arcs (material, not a wave) | Shafts of light out through the plating, most of them back the way the round came in; an ember where it went off, cooling for up to 3.4 s. No ball of fire outside the hull |
| Barrier | The barrier's own flare at three times an ordinary hit's strength; its collapse is the existing `barriers_down` effect, when the simulation reports it | (the round is through it) |
| Fragments | Only where hull was reached: white-hot and fast, cooling to orange | The same |
| Breakup | Only if the simulation destroys the hull: the existing death sequences | The same |

**Tiers of a penetrator**, by the warhead's damage in the simulation (60, 600, 3,000 and 30,000). They differ in
what happens:

| Tier | Guns (Prime/Apex) | What is seen |
|---|---|---|
| 0 | frigate guns, broadsides | a glint inside the hull |
| 1 | cruiser guns | the core and two shafts of light; an ember for half a second |
| 2 | a dreadnought's hyper-mass accelerator, the HADES gun | four shafts; light on neighbouring hulls; the exposure answers (12 %) |
| 3 | the Aegis command gun | two pulses, six shafts, a sensor streak, the camera knocked; exposure 30 % |
| 4 | the NOVA Array, the KRONOS Lance | three pulses running through the hull, nine shafts a kilometre long, vapour out of the far side; exposure 55 % |

The KRONOS Lance also keeps its blast (16 Nov), which is a different thing and drawn as it was.

Pictures (software renderer): `docs/apex/qa/nuclear-20261126/`, made by `scripts/nuclear-visual-qa.mjs` (staged,
at known moments) and `scripts/opening-volley-qa.mjs` (in running battles).

## The hierarchy, end to end

| Weapon | In flight | At the muzzle | On the target |
|---|---|---|---|
| Fighter cannon | a fine streak, one round in four drawn | 15 m | a third-size flash, no sparks |
| Frigate and cruiser guns | 9 to 19 m wide | 22 to 51 m | flash and sparks; with HADES rounds, tier 0 or 1 |
| Dreadnought spinal gun | 110 m (119 m for the hyper-mass accelerator) | 360 m (390 m) | flash, sparks, smoke of the plating; with HADES rounds, tier 2 |
| External nuclear warhead | a missile | none | the external detonation above |
| HADES gun | 122 m | 400 m | tier 2 |
| Aegis command gun | 147 m | 470 m | tier 3 |
| NOVA Array | 164 m | 530 m | tier 4 |
| KRONOS Lance | violet, 180 m | 580 m and its discharge ring | tier 4 and its blast |
| Reaper capital beam | the beam | its emitter's light on its own limbs | unchanged |

The widths and flashes above a dreadnought's slug are new (`heavyShare`, `src/rendering/visualWeight.ts`): they
grow with the logarithm of a round's damage from 2,000 to 520,000. A canon dreadnought's slug is drawn as it was.

## Light, exposure, shake, interference

- **Light on hulls.** No detonation makes a light. The effects system has one pooled lamp; a detonation asks for
  it and the strongest has it (tier 2 and up, and every external warhead). The scene's light count is what it was.
- **Exposure.** A detonation pulls the camera's exposure down by as much as it fills the picture (a third as much
  from behind the camera) and it comes back by itself over 0.5 to 1.9 s (`BattleView.exposureDip`).
- **Shake** when close, tier 2 and up.
- **Sensor interference**: scan lines across the picture while the exposure is well down.
- **From a bridge**: the room's lamp at the windows takes a detonation's light by how bright it is from there.

## Sound

- `nuclear_internal` (tier 2 and up, heard when the warhead goes off): the crack of the round going in, a beat, a
  thud with no top to it and the groan of structure. `nuclear_external`: a click as the flash saturates, an
  instant of nothing, then everything from the bottom up and a roar that takes seconds to fall. Both are let
  through the limit on simultaneous sounds. Lighter rounds keep the short knock they had.
- **Settings, Audio, Sound in space**: Observer (as before: the battle is heard, as in a film), or Silent vacuum
  (nothing outside the ship is heard; the interface and, in the gun sight, the ship's own guns and blows remain).

## Accessibility (Settings, Graphics)

- **Flashes**: Full, or Reduced (flashes and streaks at three tenths, the exposure moving three tenths as far, no
  interference). The interference layer is also off under the system's reduced-motion preference.
- **Camera shake**: Full, Half, Off. It scales every shake the camera takes, not only these.

## Cost

One instanced mesh with a procedural shader draws every part of every detonation in the open, and a second the
light inside hulls: two draw calls, 384 and 128 parts at most. Past that the lightest parts are not drawn; a
flash always is. A detonation smaller in the picture than 0.0016 of its distance is its flash alone.

Measured in the browser under Prime/Apex with every round a HADES round (`scripts/frame-benchmark.mjs`, main-thread
milliseconds, previous commit in brackets): at 489 ships a tick 5.98 (6.33), a view update 0.91 (0.94), a render
call 0.88 (1.04), 161 draw calls (219); at 2,129 ships a tick 24.63 (25.55), a view update 1.82 (1.90), a render
call 1.00 (1.15), 215 draw calls (200). A thousand detonations in one frame are still two draw calls
(`tests/nuclear-detonation.test.ts`).

## Tests

- `tests/nuclear-detonation.test.ts` (12): tiers from the real guns' warheads in the order of their weight; tiers
  differ in kind; inside a hull, never larger than the hull, no fragments without hull damage; the external
  warhead; the cooling curve; the delay, staying with the hull, and being over in seconds; a thousand at once;
  reduced flash; the simulation reports where the round went in and only for rounds that reached a hull.
- `tests/visual-weight.test.ts`: the heavier rounds' tracers and flashes.
- `e2e/fire-control.spec.ts`: a confirmed internal detonation in the real renderer is waiting at the strike, goes
  off a beat later, is heard once, and draws no ring.

## Limits

- Nothing here was seen on a graphics card. The flash's brightness with bloom, in particular, is set by eye on a
  software renderer.
- One lamp: of two detonations at once, one lights the hulls round it.
- The shafts of light do not know the hull's shape: they are drawn from where the warhead went off, through
  whatever is there.
- No surface scarring is left on a hull.
- The first-person bridge is lit by a detonation; the gun sight and the fighter canopy are not treated specially.
