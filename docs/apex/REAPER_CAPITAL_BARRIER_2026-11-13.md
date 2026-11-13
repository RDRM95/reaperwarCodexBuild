# Reaper capital barriers and conventional fire — 13 November 2026

## The report

Owner, 13 Nov 2026: two Annihilation battles, seed 45, the same fleets. 8,652 allied warships destroyed in both; 1,500 Sovereign-class Reapers deployed; 15 and 20 of them destroyed; about 1.46 to 1.58 million allied rounds fired; hundreds of Reaper destroyers destroyed and almost no capitals. Suspicion: Reaper capital barriers regenerate faster than conventional dreadnought barrages can overcome them. And the after-action report concluded that organic victory is possible in open engagement after every allied ship had been destroyed.

## What was found

Regeneration is not broken. Three other things were, and one more was found and left for a decision.

| | Finding | Done |
|---|---|---|
| 1 | Dreadnoughts and cruisers turned beam-on to Reapers and fought with their broadsides; the main guns fell silent | Fixed |
| 2 | A fleet spread its fire thinner than barriers regenerate | Fixed |
| 3 | The Reaper assessment counted capital losses as a number, not a share, and ignored how the battle ended | Fixed |
| 4 | Armour is charged against a beam twenty times a second | Not changed: see "Left for a decision" |

### Shared mechanics, one by one

- **Barrier regeneration.** A Sovereign regenerates 240 a second (288 under Annihilation, whose Reaper technology has regeneration at 1.2). That is 0.6 % of its 42,000 barriers a second. An Alliance dreadnought regenerates 1.1 % of its own a second and a Reaper destroyer 1.2 %. The Sovereign's is the slowest of the three for its size. The code does what the catalogue says.
- **Regeneration delay.** Regeneration starts three seconds after the last hit of any kind, for every ship. A dreadnought's main gun fires every four seconds and lands two rounds in three, so a Sovereign under fire from one dreadnought regenerates between its shots: in fifteen minutes one dreadnought did 150,000 damage and 104,500 came back. Two or more keep the pause from ever running out. This is how a Sovereign's barriers hold off a ship or two, and it is kept.
- **Damage mitigation.** Barriers stop slugs entirely until they are gone. Armour then takes a flat amount off each hit, less for penetrating rounds, and never more than 85 % of it. Against a Sovereign's 320 armour a dreadnought's spinal round (1,000 damage, penetration 0.85) keeps 89 % and a broadside round (140, penetration 0.5) keeps the 15 % floor. This is the fact finding 1 turns on.
- **Weapon cooldowns.** As catalogued. One thing to know: the dreadnought main gun's entry quotes the codex's "every two seconds" and plays at four outside the Strict Lore rules, where it is two. That is a balance choice in the catalogue, not a defect, and it is not changed here.
- **Targeting.** Findings 1 and 2.
- **Accuracy.** Works as designed; see "Firing solutions" below.
- **Damage distribution.** Finding 2.
- **Time step.** 0.05 s. Regeneration, cooldowns and movement scale with it correctly. Beam damage against armour does not: finding 4.
- **Annihilation's own settings.** Reaper accuracy 1.15, sensors 1.3, crew 1.2, barrier regeneration 1.2, beam damage 1.4, competence 1.5; a Sovereign's main gun destroys a conventional hull at every direct contact; no indoctrination, no Reaper retreat. All unchanged.

## Finding 1: the main guns were silent

Since the combat overhaul of 12 Nov a hull turns one side to its target if its broadside throws more damage a second than the guns that bear ahead. A canon Alliance dreadnought's broadside throws 350 a second and its spinal gun 250, so every dreadnought turned beam-on. (Under Prime/Apex the refit gun out-throws the broadside and they stayed bow-on, which is where the rule had been tested.) Cruisers did the same.

But a broadside round reaches a Reaper's hull at 15 % of its strength and a spinal round at 89 %. Beam-on, four dreadnoughts fired 25 main-gun rounds and 1,440 broadside rounds at a Sovereign in five minutes.

**Fix.** A hull presents the battery that would destroy its present target soonest: expected seconds to wear its barriers down, then its hull through its armour, with each battery's own hit chance. Against any Reaper, Alliance dreadnoughts and cruisers come out bow-on; against a lightly armoured cruiser a broadside is still the quicker battery and they still turn; a carrier, with nothing that bears ahead, always turns. No weapon, armour or barrier figure is changed.

### Controlled trials

Seed 45, canon rules, start 60 km. `scripts/sovereign-trial.ts` reproduces every row.

**One Sovereign that neither moves nor fires** (what the guns do, and nothing else):

| Dreadnoughts | Barriers down | Destroyed | Rounds that hit | Damage arriving | Barriers absorbed | Regenerated | Hull damage |
|---:|---|---|---:|---:|---:|---:|---:|
| 1 | never → 832 s | never → never | 56 → 68 % | 94,440 → 150,000 | 94,440 → 145,552 | 67,848 → 104,544 | 0 → 3,671 |
| 2 | 230 → 167 s | never → 316 s | 56 → 67 % | 188,440 → 101,000 | 66,132 → 63,912 | 24,132 → 21,912 | 18,346 → 32,719 |
| 4 | 96 → 83 s | 614 → 152 s | 56 → 61 % | 258,640 → 83,000 | 45,180 → 46,308 | 3,180 → 4,308 | 32,019 → 32,645 |
| 6 | 62 → 63 s | 415 → 106 s | 53 → 58 % | 255,880 → 78,000 | 42,468 → 42,168 | 468 → 168 | 32,012 → 32,191 |
| 8 | 47 → 51 s | 315 → 82 s | 52 → 60 % | 255,360 → 78,000 | 42,012 → 42,000 | 12 → 0 | 32,002 → 32,363 |

Each cell is before → after; the limit was 900 s. The barriers come down about as fast as before. What changed is the hull: before, 255,000 damage arrived to do 32,000 to the hull; now 78,000 does.

**One Sovereign that fights back**, canon rules, seven seeds (1 to 6 and 45):

| Dreadnoughts | Before | After |
|---:|---|---|
| 1, 2, 4 | all lost; the Sovereign unharmed below its barriers | the same |
| 6 (seed 45) | all lost; Sovereign left with 86 % of its hull | all lost; left with 26 % |
| 8 | all lost in every seed; Sovereign left with 68 to 77 % of its hull | Sovereign destroyed in every seed at 78 to 96 s; three dreadnoughts lost every time |
| 12 | destroyed in six seeds of seven at 123 to 252 s for 4 to 9 lost; all twelve lost in the seventh | destroyed in every seed at 55 to 64 s for 1 or 2 lost |

**Under Annihilation**, where its main gun destroys a dreadnought at every contact, seven seeds:

| Dreadnoughts | Before | After |
|---:|---|---|
| 8 (seed 45) | all lost; Sovereign keeps its hull and 40 % of its barriers | all lost; keeps its hull and 64 % of its barriers |
| 16 | all lost in every seed; Sovereign left with 24 to 67 % of its hull | destroyed in four seeds of seven at 68 to 73 s for 11 to 15 lost |
| 24 | destroyed in every seed at 39 to 47 s for 7 to 9 lost | destroyed in every seed at 42 to 53 s for 7 to 10 lost |
| 32 | destroyed in every seed at 35 to 41 s for 5 to 9 lost | destroyed in every seed at 39 to 47 s for 6 to 10 lost |

Two honest notes on that table. Large groups were not much affected before, because they destroyed the Sovereign during the approach, bow-on, before reaching broadside range; they are a few seconds slower now because they hold at the main gun's range instead of closing to the broadside's. And eight dreadnoughts did more barrier damage before than after under Annihilation (they died closer in, with more guns firing): neither is a contest.

## Finding 2: fire spread thinner than barriers regenerate

The overhaul's fire-spreading rule made a target less attractive from its first attacker on, by the point value of those already aiming at it. In a tenth-size Annihilation battle 372 allied hulls aimed at 49 Reaper destroyers, seven or eight each, and 79 % of the barrier damage they did was regenerated.

**Fix.** A target has its share of attackers when those already on it would, between them, destroy it within ten seconds, by the same expected-seconds reckoning as finding 1. Until then one more attacker is as welcome as the first; beyond it each further one is worth less. Ten seconds is short beside the minute or two in which a Reaper's barriers refill, so fire that meets the mark outruns regeneration. The rule that a hull fights something it can reach is unchanged, so this does not bring back the whole fleet chasing one distant ship.

## Finding 3: the after-action report

The Reaper assessment's threat score added 0.6 for each capital lost whatever the number committed: fifteen of fifteen hundred scored 9, where 3.2 is CRITICAL. Its conclusion was then read off that score alone. So an engagement the harvest fleet won without a survivor on the other side read "CAPITAL UNIT LOSSES EXCEED HISTORICAL PROJECTIONS … Organic fleets capable of defeating harvest forces in open engagement … Harvest of this system: cannot be completed with committed forces."

**Fix.** Capital losses count as a share of the capitals committed (unchanged where a tenth or more are lost, so small engagements read as before). Once an engagement is over the conclusion is what happened: "Organic fleet destroyed. No resistance remains in this engagement. Harvest of this system: proceeding." If the victory cost the harvest fleet heavily it says so and still calls it a victory; if the organic fleets won it says they did. `tests/reaper-assessment.test.ts` reproduces the owner's case (1,500 Sovereigns, 15 lost, every allied ship destroyed): it read CRITICAL before and reads LOW or NEGLIGIBLE now.

## What it does to battles

### Standard battles, six seeds each (`before → after`)

| Battle | Winner | Sovereigns destroyed | Destroyers destroyed | Reaper hull destroyed | Allied hulls lost |
|---|---|---:|---:|---:|---:|
| Battle of Earth, canon | Reapers 6/6 → 6/6 | 0.0 → 0.0 of 4 | 0.3 → 1.8 of 10 | 2 → 8 % | 46 → 46 of 46 |
| Final Battle of Earth, canon | Reapers 6/6 → 6/6 | 0.2 → 2.2 of 10 | 5.8 → 11.2 of 22 | 17 → 34 % | 125 → 125 of 125 |
| Custom 54 against 38, canon | Reapers 6/6 → 6/6 | 0.0 → 0.0 of 8 | 0.0 → 0.8 of 30 | 0 → 1 % | 54 → 54 of 54 |
| Battle of Earth, Prime/Apex | Allies 6/6 → 6/6 | 4.0 → 4.0 of 4 | 10.0 → 10.0 of 10 | 100 → 100 % | 11.5 → 8.8 of 91 |
| Final Battle of Earth, Prime/Apex | Allies 6/6 → 6/6 | 10.0 → 10.0 of 10 | 22.0 → 22.0 of 22 | 100 → 100 % | 28.0 → 26.8 of 194 |
| Custom 54 against 38, Prime/Apex | Reapers 6/6 → 6/6 | 0.0 → 0.0 of 8 | 8.5 → 8.5 of 30 | 18 → 17 % | 54 → 54 of 54 |
| Battle of Earth, Annihilation | Reapers 6/6 → 6/6 | 0.0 → 0.0 of 4 | 0.0 → 0.5 of 10 | 1 → 2 % | 46 → 46 of 46 |
| Final Battle of Earth, Annihilation | Reapers 6/6 → 6/6 | 0.0 → 0.0 of 10 | 1.2 → 4.2 of 22 | 2 → 5 % | 125 → 125 of 125 |
| Custom 54 against 38, Annihilation | Reapers 6/6 → 6/6 | 0.0 → 0.0 of 8 | 0.0 → 0.2 of 30 | 0 → 0 % | 54 → 54 of 54 |

The winner is the same in all 54 battles. Conventional fleets under canon rules still lose every one of these: by the game's own point values the Reapers in them are worth 2.7 to 7.2 times the allied fleet. What changed is what the losers take with them. Prime/Apex fleets, which already kept their main guns on target, win as before and lose slightly fewer ships.

### The large Annihilation battle, seed 45

The owner's fleet lists are not known. This is a stand-in of the same size: 400 dreadnoughts, 2,252 cruisers and 6,000 frigates (8,652 warships) against 1,500 Sovereigns and 4,500 destroyers. It is plainly a weaker allied fleet than the owner's, which fired five times as many rounds. `scripts/annihilation-battle.ts` reproduces it; full size takes about 45 minutes.

| Full size, 14,652 ships | Before | After |
|---|---:|---:|
| Winner, and when | Reapers, 577 s | Reapers, 587 s |
| Allied warships lost | 8,652 of 8,652 | 8,652 of 8,652 |
| Sovereigns destroyed | 0 of 1,500 | 1 of 1,500 |
| Sovereigns hit at all, and with barriers brought down | 39, 2 | 34, 2 |
| Barrier damage done to Sovereigns, and regenerated | 121,205, 100 % | 164,919, 75 % |
| Damage to Sovereign hulls | 17,647 | 33,790 |
| Destroyers destroyed | 110 of 4,500 | 304 of 4,500 |
| Destroyers whose barriers were brought down | 164 | 352 |
| Barrier damage done to destroyers, and regenerated | 3,479,038, 79 % | 4,009,621, 50 % |
| Damage to destroyer hulls | 497,938 | 1,121,965 |
| Allied hulls aiming at each destroyer under fire | 17.3 on 188 | 42.4 on 78 |
| Allied rounds fired | 300,488 | 331,886 |
| Dreadnought main-gun rounds (400 dreadnoughts) | 1,782 | 3,323 |
| Cruiser main-gun rounds (2,252 cruisers) | 5,592 | 17,594 |
| Dreadnought and cruiser broadside rounds | 72,224 | 69,664 |

Still a catastrophic Reaper victory: every allied ship is destroyed and 1,499 of 1,500 Sovereigns survive. The allied fleet destroys nearly three times as many destroyers as it did, does twice the damage to Reaper hulls, and half of what it does to destroyer barriers now stays done. Almost all of its fire still goes into the destroyer screen in front of it (328,455 rounds of 331,886); the Sovereigns behind are reached by a hundred hulls at a time, as before. Broadsides still fire about as often as they did: a mount shoots at whatever crosses its arc, and only the hull's facing changed.

At one tenth of the size (865 against 600), which takes a minute:

| | Before | After |
|---|---:|---:|
| Winner, and when | Reapers, 167 s | Reapers, 173 s |
| Allied warships lost | 865 of 865 | 865 of 865 |
| Sovereigns destroyed | 0 of 150 | 0 of 150 |
| Destroyers destroyed | 4 of 450 | 18 of 450 |
| Destroyers whose barriers were brought down | 11 | 21 |
| Barrier damage done to destroyers, and regenerated | 299,122, 79 % | 315,038, 57 % |
| Damage to destroyer hulls | 33,339 | 69,693 |
| Allied hulls aiming at each destroyer under fire | 7.6 on 49 | 15.0 on 25 |
| Dreadnought main-gun rounds | 151 | 333 |

A catastrophic Reaper victory, before and after. Nothing here was tuned to change that.

## Left for a decision

**Armour is charged against a beam every tick.** A beam's damage is applied in slices twenty times a second, and the flat armour reduction is taken off every slice. A Thanix burst is 672 damage over 1.6 s; a Sovereign's armour should take 96 off it once, leaving 86 %. Instead it takes up to 96 off each 21-point slice, and the burst is cut to the 15 % floor. The Thanix, the weapon built from Sovereign's own gun, reaches a Reaper's hull at a sixth of its catalogue strength. The same thing happens to Reaper beams: a destroyer's beam reaches an Alliance dreadnought's hull at 15 % where it should at 98 %, a Sovereign's at 73 % where it should at 99 %.

This is a real defect: the result depends on the time step. Charging the armour once per burst was tried and measured over the nine battles above. Winners did not change, but it favours the Reapers, whose main weapons are all beams: with it, allied losses in the Prime/Apex Battle of Earth rose from 11.0 to 13.5 of 91 and in the Final Battle from 27.8 to 35.3 of 194, and Sovereigns destroyed in the canon Final Battle fell from 1.8 to 0.7. (Measured against the two fixes above at an earlier, twenty-second setting of the concentration rule, like for like.) Because the request was to make conventional fire credible without disturbing Apex balance, and this moves both the other way, it is **not** in this change. It should be fixed for both sides together or not at all; that is the owner's call.

**Reaper-killers shoot what is in front of them.** In the stand-in battle with a Valkyrie, Omaha and Aegis command ships added, one destroyer took 145,000 damage: a NOVA round spent on a 9,700-point target while Sovereigns were out of reach behind the screen. Not changed; noted because the owner's battles had such ships.

**Two runs of one seed should match.** Headless, the same seed gives the same battle twice (seven battles checked, identical). Two battles of seed 45 that ended 15 and 20 Sovereigns apart differed in something else: an order given, a different speed or pause while fleets were being commanded, or a fleet list that was not quite the same. That could not be reproduced here.

## Firing solutions: do ships miss?

Yes, and they should. In the lore fleets open at long range with both sides manoeuvring, and a slug that takes seconds to arrive can miss a ship that has moved; up close nearly everything hits. (From memory of the codex's combat entries and the gunnery sergeant's "Sir Isaac Newton" speech, not checked against a source today.) The simulator's hit chance already follows that: weapon accuracy, falling with range, rising with the size of the target, falling with its electronic warfare and relative speed, and scaled by crew and sensor damage. Measured in the trials and battles above:

| Shooter and target | Rounds that hit |
|---|---:|
| Dreadnought main gun at a Sovereign (2 km long, slow), from its own range | 58 to 68 % |
| Frigate guns and broadsides at a Reaper destroyer (160 m, fast, jamming) | about 25 % |
| Cruiser main gun at a Reaper destroyer | about 20 % |
| Dreadnought main gun at a Reaper destroyer | about 20 % |
| Disruptor torpedoes launched at a Reaper destroyer | 3 to 9 % |

A round that misses is drawn flying past its target. Nothing about accuracy is changed here.

## Tests

- `tests/reaper-capital-barrier.test.ts` (new): four dreadnoughts destroy a passive Sovereign in under three minutes with their main guns; one alone does not break its barriers in five; eight destroy one that fights back and lose three (three seeds); under Annihilation eight are lost for nothing and twenty-four destroy it for seven to ten; the concentration rule.
- `tests/reaper-assessment.test.ts` (new): the owner's case; a costly victory; an organic victory; a small engagement unchanged. Three of the four fail on the old report.
- `tests/combat-engagement.test.ts`: the aspect tests are rewritten for the new rule (a cruiser turns a side to a Cerberus cruiser and keeps its bow on a Reaper destroyer).
- Restated with their reasons, in the tests: shots a minute for dreadnoughts and cruisers (the old floors counted broadside rounds); the Prime/Apex Battle of Earth firing shares (now a three-seed mean); a depleted fleet's shot count; one seed's fleet depth; the tracer picture (now looked at every second, since at ten-second looks one battle showed no main rounds at all).
- 541 unit tests and the 44 browser tests pass. Hull contacts in thirty seeds of the Prime/Apex Battle of Earth: two seeds and 36 pair-ticks before, none now.

## Not verified

- Software only. Nothing was watched in motion or run on real hardware.
- The owner's own fleet lists and battles: the large battle here is a stand-in.
- Factions other than the Alliance were not tried one by one against Reapers; the rule is general and their catalogue figures decide.

## Open combat PRs

Checked before touching the same code: #27 (Oculus damage under Annihilation: `rules.ts`, a tooltip, tests) and #69 (attack-bearing assignment in very large fleets: `manoeuvre.ts`) do not touch the files changed here. #26 (rear batteries, draft, based on 9 Nov) edits `chooseTarget` and `combatFacing` in `ai.ts`, which the combat overhaul has since rewritten; it conflicts in `ai.ts` with the base as it stood before this change (checked with a trial merge), and nothing in it was altered.
