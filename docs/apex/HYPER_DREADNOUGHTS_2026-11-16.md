# Hyper-dreadnoughts and the blast (16 Nov 2026)

Owner's request: "more unique au vessels, create hyper dreadnuaghts, ships that are byond super dreadnaughts, and
equal to or bigger than reapers with very powerful, capital one shot, barrier deplete, armour destroying teraton
yield, using them should be like a nuke, area of effect, the absolute nuclear equiv when it comes to mass round
kinetic weapons, also unique colour due to the speed and nature of the weapon, massive railguns and spinal guns,
and make some others, what fits in the au".

Everything here is an original AU design. Figures are from the headless simulation; pictures are of the project's
own models on a software renderer, which shows shape and colour and says nothing about how it runs on a graphics
card.

## The two ships

| | Titan-class (Systems Alliance) | Imperator-class (Turian Hierarchy) | Sovereign, for scale | Valkyrie, for scale |
|---|---|---|---|---|
| Length | 5,200 m | 4,400 m | 2,000 m | 2,020 m |
| Hull / barriers / armour | 60,000 / 48,000 / 420 | 54,000 / 38,000 / 480 | 32,000 / 42,000 / 320 | 21,000 / 14,000 / 260 |
| Spinal gun | KRONOS Lance, one | Siege rails, two | — | NOVA Array, one |
| Damage a round | 520,000 | 60,000 | — | 145,000 |
| Reload, magazine | 60 s, 5 rounds | 30 s, 18 rounds a rail | — | 48 s, 8 rounds |
| Range, firing arc | 90 km, 5° | 80 km, 7° | 54 km (its beam) | 70 km, 6° |
| Blast: radius, damage at the centre, armour stripped | 25 km, 60,000, 60 % | 10 km, 14,000, 35 % | — | none |
| Heavy railgun turrets (3,400 a round, 60 km) | 4 | 2 | — | none |
| Points | 16,000 | 13,000 | 2,600 | 6,400 |

**Titan.** Two armoured hulls carried either side of an open accelerator five kilometres long, held to it by a
yoke every four hundred metres; command citadel aft of centre; ten drives. `buildAllianceTitan`.

**Imperator.** A tall narrow Hierarchy hull whose split bow is its two siege rails; a dorsal fin, swept blade
wings; five drives. `buildTurianImperator`. Both in `src/rendering/ships/hyperDreadnought.ts`, each merged into the
usual five material batches (about 14,000 and 10,000 vertices).

Pictures: `docs/apex/qa/hyper-dreadnought-20261116/`.

## The blast

A new property of a weapon (`blast` in `src/data/types.ts`), carried only by these two rounds. When the round
strikes a hull:

- the hull struck takes the round itself, and loses the blast's full share of its armour if it survives;
- every other **enemy** hull whose plating is within the radius of the impact takes the blast's damage, falling
  with the square of the distance to nothing at the edge, and loses armour in the same proportion. Barriers absorb
  it first, as they do any kinetic round, so near the centre a blast empties them;
- a glancing hit delivers its share of both; a miss sets off nothing;
- the firing side's own ships are not caught. That is a choice: a fleet does not fire such a round where its own
  ships are, and the alternative would need every fleet to plan round it.

Hulls are taken in ship order, so a seeded battle replays identically. The simulation reports each one as a
`blast` event with how many hulls were caught and destroyed.

Why 25 km: Reaper hulls stand 5 to 11 km from their nearest neighbour in battle (the median, in three battles). At the first trial radius of 14 km
a round caught 0 to 3 other hulls. At 25 km it catches 6 to 14, destroys the destroyers within about 15 km and
takes most of the barriers off a Sovereign within 5 km.

**One KRONOS round destroys a fresh Sovereign** under canon, Prime/Apex and Annihilation rules (tested). An
Imperator round takes a Sovereign's barriers and at least 35 % of its armour; the second destroys it.

These guns have a magazine of capital-killing rounds, so the rule merged on 15 Nov applies to them unchanged: the
rounds are kept for capital ships while the enemy has one, the ship hunts capital ships, and the Prime/Apex refit
leaves the gun in place.

## The colour

An ordinary slug is drawn amber, as tracer burns. A round with a blast is thrown several times faster (150 km/s on
the catalogue's scale against the NOVA Array's 64) and is drawn from blue to violet with its speed: the siege rail
`#9ab2ff`, the KRONOS round `#c79bff`. The muzzle discharge, the detonation's fireball and its shock ring take the
same colour. `tracerColour` in `src/rendering/visualWeight.ts`; the tracers are still one instanced draw call,
tinted per round.

The detonation (`kineticBlast` in `src/rendering/effects.ts`): a white flash wider than the blast for a quarter of
a second, a fireball in the round's colour that swells to the blast's edge, two shock rings at right angles that
run out to the radius, forty fragments, a light, and a camera shake. It is drawn from the existing spark batches
and ring pool and adds no draw call.

## Measured

Rounds strike as often as their stated chance: 38 of 44 KRONOS rounds over twelve battles (86 %, stated mean 86 %).

Two hyper-dreadnoughts and sixty escorts against twenty Sovereigns and sixty destroyers (seed 45). The allied side
is heavily outnumbered on purpose, to see what the ships do before they are lost:

| Rules | Ship | Winner | Sovereigns left | Destroyers left | Blasts | Hulls caught | Destroyed by blast |
|---|---|---|---|---|---|---|---|
| Canon | Titan | Reapers, 218 s | 17 of 20 | 48 of 60 | 3 | 27 | 7 |
| Canon | Imperator | Reapers, 187 s | 15 | 58 | 10 | 16 | 0 |
| Prime/Apex | Titan | Reapers, 250 s | 16 | 34 | 3 | 32 | 5 |
| Prime/Apex | Imperator | Reapers, 240 s | 11 | 43 | 9 | 8 | 0 |
| Annihilation | Titan | Reapers, 168 s | 20 | 56 | 0 | 0 | 0 |
| Annihilation | Imperator | Reapers, 137 s | 17 | 58 | 6 | 11 | 0 |

In the Annihilation Titan row both rounds fired were long shots at 96 km (72 % chance each) and both missed.

New scenario **"APEX — The Titan Line"** (`apex_titan_line`): two Titans, an Imperator and 176 conventional hulls
against 40 Sovereigns and 120 destroyers. Over three seeds the allies win two with 15 and 20 hulls left of 179, and
the Reapers win one with 3 Sovereigns and 16 destroyers left; 20 to 23 hyper-dreadnought rounds fired, 15 to 18
blasts, 23 to 28 hulls caught. The outcome is not scripted.

## Not done, and open

- The firing side's ships are never caught by a blast (above). Say if you want it to be a hazard to both sides.
- No other faction has a hyper-dreadnought yet. The request also asked for "some others"; these two are the first.
- The KRONOS reload was set at 60 s after a trial at 75 s in which a Titan fired two or three times in a battle.
- Nothing here was seen on a graphics card.

Tests: `tests/hyper-dreadnought.test.ts` (14), `e2e/hyper-dreadnought.spec.ts` (1).
