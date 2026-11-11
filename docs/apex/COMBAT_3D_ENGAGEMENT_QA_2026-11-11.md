# Three-dimensional engagement, slice 1: attack bearings (11 November 2026)

Simulation change (movement goals only). Weapons, damage, targeting, formations at deployment, orders and the
random stream are untouched; battles remain deterministic for a seed.

## Defect

Both fleets fought as sheets in one plane. An engaging hull's firing station was its deployment slot pushed
forward along the fleet heading, plus a small trim, so the only depth a fleet had was the kilometre or two its
formation was laid out with. Measured with `scripts/engagement-geometry.ts` on the build before this change
(samples from 40 s on, hulls other than fighters):

| Battle (Alliance line against a Reaper wedge) | Fleet thickness, Alliance / Reapers | Firing-line elevation | Lines steeper than 15° | Attackers abaft their target's beam (Alliance) |
|---|---:|---:|---:|---:|
| 54 v 38, seed 42, `prime_apex` | 0.079 / 0.058 | 11.3° / 4.5° | 0.27 / 0.04 | 0.07 |
| 54 v 38, seed 7 | 0.096 / 0.056 | 7.3° / 5.8° | 0.11 / 0.07 | 0.05 |
| 162 v 114, seed 42 | 0.064 / 0.038 | 6.1° / 5.2° | 0.06 / 0.04 | 0.03 |
| 162 v 114, seed 7 | 0.034 / 0.038 | 5.6° / 4.3° | 0.04 / 0.03 | 0.14 |
| 108 v 76, seed 42, `canon_me3` | 0.052 / 0.054 | 10.4° / 5.9° | 0.24 / 0.05 | 0.23 |
| 108 v 76, seed 42, `reaper_hardcore` | 0.058 / 0.053 | 6.1° / 3.5° | 0.02 / 0.00 | 0.01 |

Thickness is a fleet's extent out of its own best-fit plane over its extent within it: 0 is a sheet, 1 is as
deep as it is wide.

## Change

`src/simulation/manoeuvre.ts` gives every hull of a manoeuvring class an attack bearing: a direction in which
it swings its firing station round its target, at an unchanged distance from it, by an angle its class allows.
`movementGoal` applies it as the last step of the engaged station, after the range band, leash and trim.

| Class | Swing round the target | What it is for |
|---|---|---|
| Dreadnought | 5° to 14° | Keeps a firing line; the line is stepped into tiers above and below |
| Cruiser | 22° to 55° | Works the flanks |
| Frigate | 45° to 105° | Gets round the beam of its target |
| Reaper capital | 3° to 12° | Advances almost straight |
| Reaper destroyer | 20° to 60° | Hunts wide |
| Carrier, fighter | none | Carriers keep their standoff; fighters already fly their own passes |

The direction of a hull's swing follows from where it deployed in its class's line, for tactical reasons:

- An enemy wall's open flank is above and below it, where its neighbours are not. Hulls from the middle of the
  line go over or under; only the wings go round the sides, each round its own side, so paths do not cross.
- Consecutive hulls on a side alternate above and below and step through three depths of swing, so neighbours
  never share a bearing or stand in each other's line of fire.
- The swing opens as the hull closes: none beyond twice its range from the target, all of it inside 1.15 times.
  A fleet still deploys and approaches in formation; it fights in depth.

Nothing is random: bearings come from deployment slots and are cached with the fleet's role stations.

## Measured after

| Battle | Fleet thickness, Alliance / Reapers | Firing-line elevation | Lines steeper than 15° | Attackers abaft the beam (Alliance) | Hull overlaps |
|---|---:|---:|---:|---:|---:|
| 54 v 38, seed 42, `prime_apex` | 0.279 / 0.324 | 25.8° / 18.7° | 0.65 / 0.46 | 0.31 | 0 |
| 54 v 38, seed 7 | 0.381 / 0.351 | 34.1° / 18.4° | 0.74 / 0.50 | 0.30 | 0 |
| 162 v 114, seed 42 | 0.256 / 0.176 | 27.1° / 14.5° | 0.66 / 0.39 | 0.18 | 0 |
| 162 v 114, seed 7 | 0.203 / 0.160 | 23.9° / 14.6° | 0.60 / 0.38 | 0.12 | 0 |
| 108 v 76, seed 42, `canon_me3` | 0.217 / 0.247 | 28.5° / 18.6° | 0.65 / 0.51 | 0.36 | 0 |
| 108 v 76, seed 42, `reaper_hardcore` | 0.122 / 0.227 | 20.4° / 10.1° | 0.63 / 0.22 | 0.08 | 0 |

In the rendered battle (108 v 76 at the start, seed 42) the height of the whole engagement is 5.6 km at 10 s on
both builds (still in formation), then 4.7 km before and 19.9 km after at 45 s, and 4.7 km against 18.1 km at 70 s.

**Guns still take part.** Hulls that fired at least once by the end, before → after:

| Battle | Dreadnoughts | Cruisers | Frigates | Reaper capitals | Reaper destroyers |
|---|---|---|---|---|---|
| 162 v 114, seed 42 | 17/18 → 18/18 | 48/54 → 48/54 | 76/90 → 73/90 | 23/24 → 23/24 | 80/90 → 88/90 |
| 162 v 114, seed 7 | 18/18 → 18/18 | 47/54 → 51/54 | 68/90 → 75/90 | 23/24 → 24/24 | 83/90 → 86/90 |
| 108 v 76, `reaper_hardcore` | 12/12 → 12/12 | 36/36 → 36/36 | 35/60 → 42/60 | 13/16 → 14/16 | 42/60 → 48/60 |
| 108 v 76, `canon_me3` | 12/12 → 12/12 | 36/36 → 35/36 | 51/60 → 50/60 | 16/16 → 16/16 | 60/60 → 58/60 |

**Outcomes.** The same side wins every battle above. The Alliance lasts longer where it is wiped out (90.6 →
100.1 s and 86.8 → 102.9 s at 54 v 38; 75.2 → 108.0 s under `reaper_hardcore`). At 162 v 114 after 120 s the
Alliance has 30 → 22 hulls left on seed 42 and 12 → 28 on seed 7. This slice was not tuned for balance.

**Cost.** Mean simulation tick, bundled, cloud CPU: 13.7 and 13.9 ms before, 14.9 and 13.9 ms after at 1,104
ships (two runs each); 28.4 → 30.3 ms at 2,208.

## Twelve seeds, not one

A single seeded battle is chaotic: two builds that differ by almost nothing diverge by about a fifth in who hits
what, so the per-seed outcome figures above cannot show small effects. `scripts/engagement-batch.ts` averages
the same 54 v 38 battle over seeds 1 to 12 (up to 150 s each):

| Mean of 12 seeds | `prime_apex` before | after | `reaper_hardcore` before | after |
|---|---:|---:|---:|---:|
| Battle length | 105.8 s | 111.9 s | 59.7 s | 56.4 s |
| Reaper hull destroyed (share of all Reaper hull) | 0.215 | 0.216 | 0.002 | 0.000 |
| Reapers destroyed | 8.58 | 7.42 | 0.08 | 0.00 |
| Hits by frigates | 342 | 414 | 109 | 105 |
| Alliance thickness | 0.096 | 0.382 | 0.148 | 0.146 |
| Alliance attackers abaft their target's beam | 0.083 | 0.287 | 0.000 | 0.176 |
| Samples with overlapping hulls | 0 | 0 | 0 | 0 |

Under `prime_apex` the Alliance does the same damage to the Reapers' hulls, spread over more of them (about one
fewer destroyed), and lasts about six seconds longer. Under `reaper_hardcore` the Alliance is destroyed in under a
minute either way, before most of the swing has opened, so depth barely changes there at this fleet size.

## Tried and not shipped: frigate attack runs

A second slice gave frigates latched attack runs: in past the target on the side they approached from, on beyond
it, about, and in again from the other side of the target's level. Measured the same way over 12 seeds, with
runs against every target (34 runs a battle): Alliance attackers abaft the beam 0.287 → 0.382, but hits by
frigates 414 → 316, Reaper hull destroyed 0.216 → 0.196 and Reapers destroyed 7.42 → 6.08. A frigate flying
away from its target is not firing at it, and nothing in the simulation yet rewards being astern of a ship
(there is no weaker stern armour, and the target's slew matters only for its narrow main battery). Restricting
runs to capital-scale targets left about five runs a battle, too few to see. It is not merged; it needs either
frigate weapons that bear while the hull extends, or a real advantage to an attack from astern, first.

## Slice 2: altitude lanes for allied fleets

**Defect.** Attack bearings give a battle depth once hulls engage, but allied fleets still closed on one level.
In the Final Battle of Earth the five Alliance fleets' anchors stayed within 1.1 km of each other in altitude
(mean of six seeds, `scripts/scenario-batch.ts`), and at 70 s the mean altitude of each fleet's hulls was between
-0.3 and +1.0 km.

**Change.** `altitudeLane` in `src/simulation/ai.ts`: the first fleet of a side keeps the level it deployed at;
each further fleet of that side, including one that arrives later, takes the next lane (+1, -1, +0.5, -0.5, ...)
and climbs or descends to it while it closes, by 0.45 of its engagement range per unit of lane. The second side
mirrors the first, so opposing fleets of the same rank do not climb together. Lanes are absolute levels, not
offsets from the enemy, so two fleets cannot chase each other upward. A side with one fleet is unaffected, which
is why no existing test changed.

**Measured** (six seeds each, `prime_apex`, up to 150 s; before → after):

| Scenario | Altitude spread of side A's fleet anchors | Side B's | Side A hull lost | Side B hull lost | Battle length | Hulls that fired | Overlap samples |
|---|---:|---:|---:|---:|---:|---:|---:|
| Final Battle of Earth (5 v 2 fleets) | 1.1 → 10.9 km | 0.2 → 1.8 km | 0.152 → 0.159 | 0.955 → 0.905 | 128.2 → 127.4 s | 0.871 → 0.867 | 2 → 0 |
| Battle of the Citadel (3 v 2) | 2.0 → 7.7 km | 0.7 → 6.6 km | 0.203 → 0.193 | 1.000 → 0.937 | 113.4 → 125.0 s | 0.603 → 0.604 | 0 → 0 |
| Cerberus Intervention (2 v 1) | 0.2 → 6.2 km | 0 → 0 | 0.117 → 0.135 | 1.000 → 1.000 | 77.8 → 80.4 s | 0.854 → 0.856 | 0 → 0 |

In the Final Battle of Earth (seed 1, 70 s) the mean altitude of each Alliance fleet's hulls goes from -0.2,
+0.6, +1.0, -0.3 and +0.3 km to -0.4, +4.0, -3.7, +2.7 and -1.5 km: the fleets are stacked.
`qa/combat-3d-20261111/altitude-lanes-side-elevation.png` plots those positions (a plot of the simulation's own
ship positions, not a render): one dot a hull, one colour a fleet, arrows marking fleet anchors.

The same side wins. Fleets that climb take a little longer to bring their guns to bear: in two of the three
scenarios the enemy loses about five points less of its hull inside 150 s. This was measured, not tuned.

In the 3D view the difference is hard to see from one still: hulls already spread ±10 km once engaged, and the
lanes shift whole fleets inside that. Nobody has watched it in motion.

`tests/altitude-lanes.test.ts` (4 tests): lane assignment and mirroring; a single-fleet side does not climb; the
Final Battle of Earth's Alliance fleets end more than 10 km apart in altitude, each on its own side of its
starting level, at least 1.5 km from the next, with no overlapping hulls; the same seed gives the same anchors.

## Evidence

- `qa/combat-3d-20261111/edge-before-after.jpg`: the same battle at 10, 45 and 70 s, camera level with the
  fleets and looking across the line between them. Before (upper row) everything lies in one band; after
  (lower row) ships and beams spread above and below it.
- `qa/combat-3d-20261111/above-before-after.jpg`: the same moments from above and behind the Alliance.
- `tests/engagement-3d.test.ts` (11 tests): bearing assignment, the swing geometry, and two seeded battles
  asserting depth, steep firing lines, attackers abaft the beam, no hull overlaps, participation and
  reproducibility.
- Two existing tests are re-pinned with measured values and the reason in a comment:
  `tests/combat-ai.test.ts` (a dreadnought line now holds up to 4.2 km from its slots, measured 1.87 to 3.70 km,
  where a rigid row held within 1.2 km; it still stops, fires and keeps its range, and the test now also asserts
  the line is stepped above and below the target) and `tests/separation-exact.test.ts` (47 and 46 of 1,380
  hulls being pushed apart, where more than 50 crowded each other in one plane; the bit-identical comparison
  itself is unchanged).

Reproduce: `node --import tsx/esm scripts/engagement-geometry.ts [seconds] [scale] [seed] [rules]` for the
numbers; `scripts/engagement-3d-qa.mjs` for the pictures.

## Limits and what this slice does not do

- The renders are from cloud software rendering in deep space, where hulls are dim; they show where ships are.
  Nobody has watched this in motion on the owner's hardware.
- A swung station is a place to hold, not an attack run: frigates do not pass, extend and re-attack (see
  "Tried and not shipped").
- No breakthrough or regroup behaviour, no fleet-level intent orders (flank, breakthrough, screen), no
  class-specific reaction to barrier state, no faction-specific behaviour beyond the Reaper classes' own swings.
- Reapers keep their rule of never backing off: a Reaper whose swung station lies farther from the enemy than
  it is holds where it is instead.
- Deployment is still a flat formation; the depth appears as fleets close.
- Fighters and carriers are unchanged.
- Balance was measured, not tuned.
