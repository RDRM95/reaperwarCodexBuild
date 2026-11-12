# Combat AI and fleet movement overhaul, first pass — 12 November 2026

Owner's directive: "The simulator currently spends too much time showing ships chasing one another rather than fighting. Fix the underlying combat AI, targeting, movement and fleet behaviour ... Remove fleet command controls unless they actually produce reliable, observable behaviour ... Do not simply adjust cosmetic settings."

This note covers the first pass: target selection, how hulls present their guns, closing speed, and the fleet command audit. What it does not cover is listed at the end.

## How it was measured

`scripts/combat-activity.ts` (logic in `src/simulation/combatActivity.ts`) puts every armed hull, once a second, in one class:

| Class | Meaning |
|---|---|
| firing | fired within one cycle of its quickest anti-ship weapon (at least 4 s), or has a beam on |
| silent | has a target inside its main-battery range and is not firing |
| closing | its target is out of range and the gap shrank over the last second |
| chasing | its target is out of range and the gap did not shrink |
| idle | has no target |

Hull-seconds are counted from the battle's first shot to its end. Run: `npx tsx scripts/combat-activity.ts <scenario|custom> [rules] [seeds] [seconds] [scale]`.

## What was wrong

Measured on the build before this change:

1. **A whole fleet chose one target.** At 15 s into the Battle of Earth all 88 Alliance hulls were aiming at one Reaper capital that none of them could reach. At 30 s a Reaper destroyer inside the range of 30 hulls had 3 aiming at it. Hulls flew at the favourite past enemies they could have been shooting, pointing their spinal guns at it.
2. **Most guns never bore.** Every hull stood bow-on to its target. Cruisers and carriers carry most of their fire in side batteries: an Alliance cruiser has 159 damage a second ahead and 240 on either beam, and fought with the 159. A carrier has only side batteries and never fired. In one traced battle a dreadnought's eight broadside batteries did not fire once in 84 s.
3. **A hull whose target died flew backwards.** It kept the dead target until its next decision, up to three seconds, and made for its place in the formation meanwhile.
4. **Hulls crossed to an out-ranging enemy at combat speed.** Reaper capitals out-range everything (21.6 against 7.2 to 17.6) and stop at their own range. A cruiser needed about 40 s to cross.
5. **Hulls on the wings of a large fleet had no target** until the fleet's advance, at the pace of its slowest capital, brought one into their own sensor range.

## What changed

All in `src/simulation/ai.ts` unless noted.

- **Fight what is in reach.** A hull with an enemy hull inside its main battery's range fights one of those. It does not keep or choose a target it cannot hit while there is one it can. A player's or a fleet's commanded target is the exception. Fighters do not count as "in reach" for warships.
- **Spread the fire.** A target's attraction falls with the value of the hulls already aiming at it (`OVERKILL_SHARE`). The battle keeps a table of that load, rebuilt every half second (`battle.ts`).
- **Decide again at once** when a target dies or leaves (`battle.ts`).
- **Nearest enemy as a fallback** for a hull in an attacking fleet with nothing in its own sensor range.
- **Beam-on batteries** (`batteryAspect`, `beamFacing`). Each hull's guns are summed once: what bears ahead, and what bears on each beam. A hull whose side batteries out-shoot its bow guns by 15 % engages at their range and, once the target is inside it, turns that side toward it (80 degrees off the bow). Cruisers and carriers do; dreadnoughts, frigates and Reapers stay bow-on. Only the facing changes, so it does not become an orbit.
- **Closing sprint** (`closingSprint`; `motion.ts`). A hull whose target is beyond its guns drives at up to twice its combat speed and thrust, easing to combat speed as the target comes into range and whenever it is steering clear of a neighbour. Reapers do not sprint.
- **Wider swings** for frigates (60 to 150 degrees round their target, was 45 to 105) and Reaper destroyers (30 to 100, was 20 to 60) (`manoeuvre.ts`). Spreading the fire took away the flanking that the dog-pile had produced by accident: the share of Alliance attackers abaft their target's beam fell from 0.26 to 0.10 over eight seeds. With the wider swings it is 0.16.

## Results

Share of hull-time spent firing, all hulls except fighters. "Before" is commit `83bad0b`.

| Battle | Rules | Before | After | Winner (both) |
|---|---|---:|---:|---|
| Default Custom Battle (55 v 12), 3 seeds | canon_me3 | 78 % | 80 % | Reapers |
| Battle of Earth, 3 seeds | canon_me3 | 78 % | 80 % | Reapers |
| Final Battle of Earth, 2 seeds | canon_me3 | 77 % | 77 % | Reapers |
| Defence of Palaven, 2 seeds | canon_me3 | 84 % | 85 % | Reapers |
| Default Custom Battle, 3 seeds | prime_apex | 63 % | 69 % | Alliance |
| Custom Battle at four times the size, 2 seeds | prime_apex | 48 % | 58 % | Alliance |
| Battle of Earth, 3 seeds | prime_apex | 52 % | 57 % | Alliance |
| Final Battle of Earth, 2 seeds | prime_apex | 43 % | 60 % | Alliance |

The share of time moved less than the amount of fire. Shots (and beam-seconds) per hull-minute, canon_me3:

| Class | Custom before | after | Battle of Earth before | after | Final Battle before | after |
|---|---:|---:|---:|---:|---:|---:|
| Alliance dreadnought | 27 | 58 | 36 | 60 | 37 | 55 |
| Alliance cruiser | 45 | 65 | 46 | 64 | 52 | 67 |
| Alliance carrier | 1 | 52 | 15 | 61 | 9 | 35 |
| Alliance frigate | 42 | 50 | 41 | 54 | 38 | 47 |

Other measurements:

- **Target spread**, Battle of Earth at 15 s: the ten Reapers have 30, 18, 16, 6, 5, 5, 5, 1, 1 and 1 of the 88 hulls on them (before: 88 on one).
- **Target changes**: 2.3 to 2.6 a hull-minute under canon rules (2.7 before on the canon Custom Battle, seed 1).
- **Hull contacts at every tick** (`scripts/contact-check.ts`): none in 24 control battles (12 seeds each rule set), nor in the Battle of Earth (3 seeds) or the Final Battle of Earth (4 runs). The first version of the sprint caused contacts between sprinting frigates and between sprinting Reaper destroyers; easing the sprint near neighbours and removing it from Reapers ended them.
- **Battles are shorter**, because more guns fire: for example the canon Custom Battle 222 s to 184 s, the prime_apex Final Battle of Earth 135 s to 68 s. Winners are unchanged in every setup measured.
- **Simulation cost** (`scripts/scale-benchmark.ts`, 30 s, this machine): mean tick 0.92 to 1.00 ms at 92 ships, 4.1 to 5.7 ms at 552, 17.4 to 21.8 ms at 2,208. About a quarter dearer at scale, with two thirds more events (shots) to process. The worst single tick at 2,208 ships was 40 ms before and 65 and 122 ms after in two runs; no one cause was found in the slowest ticks.

## Fleet commands

Each order was given to the Alliance fleet 30 s into the canon Custom Battle (3 seeds) and the next two minutes measured.

| Order | Hulls firing | In range | Moved | Verdict |
|---|---:|---:|---:|---|
| Attack | 95 % | 91 % | 17.6 km | kept |
| Advance | 95 % | 91 % | 17.6 km | removed: identical to Attack in every figure |
| Flank | 96 % | 93 % | 14.9 km | removed: the fleet's bearing round the enemy no longer differs from Attack (6 to 48 degrees against 28 to 64 at 90 s, six battles each), because hulls fight what is in reach |
| Break through | 78 % | 64 % | 13.3 km | removed: takes hulls out of the fight |
| Regroup | 91 % | 86 % | 18.4 km | removed: re-forms a formation that hulls no longer hold in combat |
| Screen | 64 % | 44 % | 5.9 km | removed: takes escorts out of range, and protects nothing (there is no line-of-fire masking) |
| Hold formation | 65 % | 47 % | 12.8 km | kept, as "Hold position" |
| Defend position | 65 % | 47 % | 12.8 km | removed: identical to Hold |
| Withdraw | 49 % | 34 % | 39.5 km | kept: falls back while fighting |
| Retreat | 6 % | n/a | leaves | kept: 27 hulls leave the battle |

The battle HUD now offers Attack, Hold position, Withdraw and Retreat. Flank, Break through, Screen and Regroup are removed from the simulation as well as the HUD, with their tests (`fleet-intent`, `regroup`, `screen`). `advance` and `defend_position` remain valid order names for existing scenario data and behave as before. Under every kept order each hull still shoots at whatever comes within its guns.

## Tests

- New: `tests/combat-engagement.test.ts` (11 cases): fighting what is in reach, the commanded exception, target spread, no stale targets, battery aspect by class, cruiser and carrier turning beam-on and firing their broadsides, the sprint's shape and limits, and battle-level activity under both rule sets.
- Removed with their features: `tests/fleet-intent.test.ts`, `tests/regroup.test.ts`, `tests/screen.test.ts`.
- Restated with measured values and reasons in place: `tests/altitude-lanes.test.ts` (now run under canon rules, where the battle is still being fought at 100 s; lane limit judged against a fleet's longest range), `tests/visual-weight.test.ts` (main guns 26 % to 75 % of tracer area, was 12 % to 53 %: more main rounds are in the air), `tests/reaper-advance.test.ts` (a Reaper capital fires in 82 % of ten-second looks, was 91 %: frigates now get astern of it and it turns slowly).
- Unit suite: 83 files, 496 tests pass. Production build passes.

## What this pass does not do

Against the directive's seven acceptance points:

1. *Ships consistently acquire and attack targets.* Yes: idle time is under 1 % for hulls and fighters in every setup measured (it was up to 4 % for hulls and 24 % for fighters in the four-times battle).
2. *Most active combat time is fighting.* Yes under canon rules (77 to 85 %). Under prime_apex, where the Alliance has seven hulls to one and wins in 70 to 100 s, 57 to 69 %: the rest is the approach. Dreadnoughts there fire 26 to 50 % of the time; they are too slow to arrive before the escorts have finished.
3. *Effective engagement distances.* Partly. Hulls close to their guns and cruisers and carriers now use theirs; the range bands themselves are unchanged.
4. *Friendly battle groups cross without deadlock.* **Not addressed.** No deadlock was seen and there are no contacts, but nothing was changed or measured for formations crossing.
5. *No clipping, frozen ships or glitches.* No hull contacts in the battles measured. Not looked at in motion.
6. *Reapers and allies behave distinctly.* Kept: Reapers do not sprint, do not turn beam-on, press to individual distances and never back away.
7. *Large battles remain playable.* The simulation is about a quarter dearer at 2,208 ships. Not run on real hardware.

Also not done: fighters (still firing 14 to 20 % of the time, with 2 to 4 attack runs a minute each; no squadron behaviour); carriers standing off; anything about how it looks. Nothing here was judged by eye in motion.
