# Destroyers as a distraction: where the capital-killing rounds went (15 Nov 2026)

Owner's report: "destroyers seem OP? just seems like they wreck havoc even if you have 500 and 1000 sovreigns, the
destroyers seem like a distraction, you gotta wait for them all to die to see the capitals die".

All figures are from the simulation run headless (seed 45 unless a seed count is given). Nothing here was judged
by eye, and no outcome was aimed at.

## What was measured first

**The destroyers are the only Reapers inside allied guns for most of a battle.** A destroyer moves at 1.6 km/s, a
Sovereign at 0.8, and a Sovereign fights from 28 to 46 km (its beam reaches 54 km; an Alliance dreadnought's guns
32 to 50, a frigate's 18). The destroyers arrive first and the Sovereigns stand off behind them. Against 50
Sovereigns and 150 destroyers:

| Rules, allied hulls | Allied hulls aiming at a destroyer | Of that time, a Sovereign was inside their guns | Kills by destroyers / by Sovereigns |
|---|---|---|---|
| Annihilation, 289 | 86 to 90 % | 0 to 1 % | 155 / 134 |
| Prime/Apex, 289 | 73 to 76 % | 0 to 3 % | 123 / 166 |
| Prime/Apex, 867 | dreadnoughts 35 %, cruisers 47 %, frigates 65 % | not recorded | 281 / 394 |
| Annihilation, 1,734 | 78 to 85 % | 0 % | 806 / 928 |

So the report is right about what happens, and it is the Reaper fleet behaving as a fleet with a screen, not a
fault in who shoots whom.

**Ship for ship, a destroyer is worth more than its points say.** Ten destroyers cost what one Sovereign does
(260 points each against 2,600). Against the same 74 allied hulls (4 dreadnoughts, 20 cruisers, 50 frigates):

| Rules | Ten destroyers: seconds to destroy, allied hulls lost | One Sovereign: seconds, allied hulls lost |
|---|---|---|
| Canon | 116 to 139 s, 5 to 9 | 50 to 55 s, 3 to 5 |
| Annihilation | 169 to 235 s, 18 to 22 | 58 to 60 s, 11 |
| Prime/Apex | 48 to 59 s, 3 to 7 | 34 to 37 s, 0 to 1 |

Under Annihilation thirty cruisers lose to ten destroyers and beat one Sovereign, and a single destroyer beats a
lone dreadnought two times in three. Why a destroyer lasts so long: an Alliance gun lands on it three times in ten
(it is frigate-sized), and its barrier refills at 80 a second after every three seconds without a hit. In one
traced canon duel, which the dreadnought won after 513 s, the destroyer regenerated 25,020 points of barrier,
nearly four times its capacity of 6,500.

## Two changes that were tried and not made

**Weaker destroyers.** The destroyer's barrier regeneration, barriers and armour were scaled down from the
Sovereign's in three steps (the last: regeneration 80 → 24, barriers 6,500 → 4,200, armour 160 → 100). Small duels
moved; fleet battles did not. With 867 allied hulls against 50 Sovereigns and 150 destroyers the destroyers still
made 39 to 52 % of the kills (42 to 52 % as shipped), and under canon and Annihilation rules the Sovereigns were
still almost untouched (three of 50 lost against two, and none against none). The destroyer's catalogue figures
are unchanged.

**The line engages the line.** Dreadnoughts were made to count an enemy capital ship as in reach out to twice
their gun range, so that they would leave the screen and go for the Sovereigns. They did (84 % of their time
aimed at Sovereigns under Prime/Apex, from 65 %) and it made things worse: they arrive without their own screen. With 289
allied hulls against 20 Sovereigns and 60 destroyers, Sovereigns surviving went from 9 and 4 of 20 to 18 and 17.
Not made.

## What was wrong

**1. The ships built to kill Sovereigns emptied their magazines into destroyers.** Three guns carry a limited
magazine of capital-killing rounds: the Valkyrie's NOVA Array (eight rounds, one destroys a Sovereign, 48 s to
reload), the Aegis command gun (twelve) and the Cerberus HADES gun (sixteen). They fired at whatever came into
range first. With 100 Sovereigns and 300 destroyers against 416 allied hulls (six Valkyries, ten Aegis), under
Annihilation: twelve NOVA rounds, nine at destroyers; 27 Aegis rounds, 25 at destroyers.

**2. Under Prime/Apex those two ships did not have those guns.** The hyper-mass accelerator refit replaces
dreadnought spinal guns. The Omaha's and the Cerberus HADES gun were exempt by name; the NOVA Array and the Aegis
gun, added later, were not. Wherever the refit is in force (Prime/Apex and HFY, which is nearly every AU library
battle) the Valkyrie fought with the fleet's ordinary accelerator: 4,000 damage at 44 km in place of 145,000 at
70 km. In the battle above neither gun fired once.

**3. A fleet's main guns fired at the pace of whichever gun asked first.** The salvo clock was one to a fleet and
took its period from the first gun to call on it. Beside an Omaha (7.3 s) the hyper-mass accelerators (4.1 s)
could be held to the Omaha's cycle. With the NOVA Array restored (44 s) the fleet's hyper-mass accelerators fired
32 shots in a whole battle (401 once this was fixed), which is how it was found.

## What changed

- `src/timelines/rules.ts`: the refit replaces canon spinal guns and leaves every AU-designed gun in place. This
  is what the two named exemptions already did; it now covers all four.
- `src/simulation/fireControl.ts`, `keptForCapitals`: a gun with a magazine of capital-killing rounds is not fired
  at a hull that is not a capital ship and that the round would overkill (it carries more than the target's whole
  hull and barriers), while the enemy has a capital ship on the field. A target the player names (a ship order, the fleet's commanded target, or a target
  priority that names its class) is fired on regardless. With no enemy capital ship on the field the rounds are
  fired at what is there.
- `src/simulation/ai.ts`, `chooseTarget`: a hull with such rounds aboard takes an enemy capital ship as its
  target wherever its fleet can see one, and fights the escorts it passes with its other batteries. A commanded
  target or a priority that names escorts or fighters comes first; with its magazine empty it fights like any
  other dreadnought.
- `src/simulation/volleys.ts`: one salvo clock for each kind of gun in a fleet; and a gun with a magazine fires
  when it bears, without waiting for a salvo window that for the NOVA Array came once in 46 s.

No damage, barrier, armour, range or accuracy figure of any ship or weapon was changed.

## Before and after

100 Sovereigns and 300 destroyers against 416 allied hulls (6 Valkyries, 10 Aegis, 20 Omahas, 20 dreadnoughts,
120 cruisers, 240 frigates):

| | Annihilation before | after | Prime/Apex before | after |
|---|---|---|---|---|
| Winner, seconds | Reapers, 189 | Reapers, 185 | Reapers, 343 | Reapers, 329 |
| NOVA rounds fired, at Sovereigns | 12, 3 | 9, 9 | 0 | 15, 15 |
| Aegis rounds fired, at Sovereigns | 27, 2 | 14, 14 | 0 | 32, 32 |
| First Sovereign destroyed | 81 s | 49 s | 120 s | 46 s |
| Sovereigns destroyed | 2 | 8 | 11 | 35 |
| Destroyers destroyed | 21 | 14 | 156 | 196 |

400 Sovereigns and 1,200 destroyers against 1,664 allied hulls (the same fleet four times), Annihilation:

| | Before | After |
|---|---|---|
| Winner, seconds | Reapers, 320 | Reapers, 317 |
| NOVA rounds fired, at Sovereigns | 51, 6 | 31, 31 |
| Aegis rounds fired, at Sovereigns | 148, 18 | 61, 61 |
| Sovereigns destroyed | 14 | 41 |
| Destroyers destroyed | 106 | 76 |

Fewer destroyers die, because the heaviest guns no longer shoot them. That is the cost of the change and it is
stated here so it is not a surprise.

**Standard battles.** The 54 standard battles (Battle of Earth, Final Battle of Earth and the 54-against-38 custom
battle, under canon, Prime/Apex and Annihilation, six seeds each) are identical in every figure. None of them
fields a magazine gun or two kinds of coordinated gun.

**AU library battles that field these ships** (three seeds each; the five larger than 700 hulls were not run):

| Scenario | Wins allied/Reaper before → after | Allied hulls lost | First capital destroyed |
|---|---|---|---|
| apex_arcturus_bastion | 3/0 → 3/0 | 148 → 121 of 220 | 102 → 62 s |
| apex_sol_91 | 3/0 → 3/0 | 143 → 107 of 300 | 96 → 58 s |
| apex_cerberus_hades | 3/0 → 3/0 | 114 → 105 of 200 | 95 → 76 s |
| apex_palaven_stands | 3/0 → 3/0 | 155 → 151 of 204 | 97 → 98 s |
| apex_thessia_stands | 3/0 → 3/0 | 82 → 73 of 154 | 96 → 96 s |
| apex_horizon_guard | 0/3 → 0/3 | 34 → 34 of 34 | never → 73 s |
| apex_bahak_second_intercept | 3/0 → 3/0 | 163 → 154 of 276 | 109 → 84 s |
| apex_colony_300_hulls | 3/0 → 3/0 | 141 → 132 of 300 | 92 → 86 s |
| humanity_eezo_foundry (HFY) | 3/0 → 3/0 | 1.3 → 0 of 290 | 57 → 39 s |
| humanity_early_beacon | 3/0 → 3/0 | 30 → 18 of 191 | 89 → 73 s |
| cerberus_alliance_union | 0/3 → 0/3 | 212 → 212 of 212 | 86 → 51 s |
| crucible_last_anchor | 0/3 → 0/3 | 212 → 212 of 212 | 130 → 87 s |
| exiles_ancestral_claim | 0/3 → 0/3 | 104 → 104 of 104 | no Reapers |
| humanity_first_contact_2157 | 3/0 → 3/0 | 116 → 117 of 242 | no Reapers |
| humanity_isolationist_2183 | 3/0 → 3/0 | 15 → 12 of 202 | no Reapers |
| humanity_no_farixen | 3/0 → 3/0 | 60 → 48 of 239 | no Reapers |
| **ascendant_contact_2885** | **0/3 → 2/1** | 94 → 59 of 199 | 142 → 142 s |

**One outcome changed: `ascendant_contact_2885`.** Before, the allied fleet destroyed seven of the eight Reaper
capital ships and all twenty destroyers, all three battles ran to their 580 s limit, and all three were scored
Reaper victories. Its Aegis dreadnoughts now carry their own guns and it destroys the eighth in two seeds of three (441 s
on average). This follows from the Aegis having its catalogue weapon; nothing was tuned toward it.

## Not changed, and why

- **The destroyer's own figures.** Changing them did not change what the report describes (above). One oddity
  remains and is the owner's to decide: its barrier refills in 81 s against a Sovereign's 175 s, which is why a
  lone dreadnought needs four to eight minutes to destroy one under canon rules and can lose to one under
  Annihilation.
- **Ordinary dreadnoughts still fight the screen.** Sending them at the Sovereigns alone was measured and lost
  battles.
- **Heat.** In one trace the Valkyries were overheated, with the NOVA Array locked out, for 166 s of the 804 they
  were alive before the salvo change and 10 s of 935 after it. The heat model applies to every ship and was left
  alone.

Tests: `tests/capital-rounds.test.ts` (16).
