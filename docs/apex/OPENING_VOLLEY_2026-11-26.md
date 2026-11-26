# Long-range engagement and the opening volley (26 Nov 2026)

Owner's brief, "APEX — Fleet combat and weapons visual overhaul", sections 1 and 2: conventional fleets approach
too close before opening fire; give their mass accelerators an opening-fire range advantage over the standard
Reaper beam, and a coordinated, naturally synchronised first volley. Do not reduce Reaper damage or survivability.

## Before (measured, three seeds each, `scripts/opening-engagement.ts`)

| Battle | Reapers first fire | Allies first fire | Allied main-battery rounds in the air before the Reapers' first shot |
|---|---|---|---|
| Battle of Earth, canon | 3.4 s from 55 km | 12.1 s from 33 km | 0 |
| Battle of Earth, Prime/Apex | 3.6 s from 55 km | 12.2 s from 24 km | 0 |
| Final Battle of Earth, canon | 5.2 s from 55 km | 12.8 s from 24 km | 0 |
| Custom battle, Prime/Apex | 2.7 s from 54 km | 10.7 s from 24 km | 0 |

Three things made it so, and range was only the first.

1. **Range.** A Reaper capital's beam reached 54 km; a dreadnought's gun 50, a cruiser's 36.
2. **The screen ran ahead.** A formation puts its frigates 25 km ahead of its dreadnoughts, and each hull sprinted
   for its own short range the moment the battle began: ten seconds in, the leading frigate was 40 km ahead of the
   leading dreadnought. The Reapers met the screen at 55 km while the gun line was over 100 km away. Longer guns
   alone did not change who fired first (tried: with the new ranges and nothing else, the Reapers still fired
   first in three battles of four).
3. **Each gun fired the instant it bore.** A line coming into range did so a hull at a time: four to ten hulls
   fired in the allied fleet's first three seconds.

## What changed

**Ranges** (`src/data/weapons.ts`). Taken from the owner's own branch `fix/organic-opening-volley-range-20261125`
(one commit, data only, cherry-picked here as it stood): a dreadnought's gun 50 → 74 km, a cruiser's 36 → 60, a
frigate's 24 → 40, and each navy's in proportion; the capital-killing guns above them in the order of their weight
(Omaha 82, HADES gun 84, Aegis 90, NOVA Array 96, KRONOS Lance 120). Damage, reload, round speed and accuracy are
untouched, and so is every Reaper weapon. These are gameplay distances on this simulator's compressed scale, not
measurements of anything on screen.

**A fleet comes on as a fleet** (`src/simulation/ai.ts`: `openingSlot`, `holdsFormation`). Until a conventional
fleet has joined the battle (one of its warships has fired on a ship or been hit, or its line has reached its
station) no hull leaves the formation for its own range, the formation sprints as one, and its screen stands close
to its gun line: within 5 km of the foremost dreadnought, plus a fifth of whatever its place is beyond that, to a
limit of 5 km more. The fleet is deployed in that order. Drawing ranks together can put one hull in another's
place, so each hull that is moved takes the nearest clear station, by the same rule and clearance the deployment
already used between fleets (`assignOpeningStations`, `src/simulation/battle.ts`). When the fleet opens, its hulls
go to their own stations as they always did, coming up to their full sprint over eight seconds. Reaper fleets are
unchanged: they hold no formation for anyone.

**The opening volley** (`src/simulation/volleys.ts`: `OpeningVolleyCoordinator`). Each kind of forward spinal
mass accelerator in a fleet (those of dreadnoughts and cruisers; a frigate's 30-degree mount is not one) holds
its fire from the moment the first of them has a firing solution until one of:

- six tenths of the battery's guns have a solution;
- no further gun has come to bear for 1.2 s (a fleet many ranks deep: the leading ranks are the volley);
- five seconds have passed;
- the fleet has been hit (0.6 s at most).

Then every gun fires within 0.7 s of the release, each at a moment of its own that comes from the hull's
identity, not from the battle's random numbers. After that the battery fires as it always did. A gun is only
asked once it is loaded with a target in range and in its arc, so one that cannot bear holds nobody. The player's
own volley command opens a battery at once; hold-fire, the HADES clock, magazines and reloads are as they were.
The battery panel shows a held gun as "coordinating".

## After (same battles, three seeds each)

| Battle | Allies first fire | Reapers first fire | Rounds in the air before the Reapers' first shot | Winners |
|---|---|---|---|---|
| Battle of Earth, canon | 6.7 s from 72 km | 9.6 s from 55 km | 7 | Reapers ×3 (as before) |
| Battle of Earth, Prime/Apex | 6.8 s from 73 km | 10.0 s from 55 km | 2 | Allies ×3 (as before) |
| Final Battle of Earth, canon | 5.0 s from 73 km | 8.7 s from 55 km | 5 | Reapers ×2, one undecided at 400 s |
| Custom battle, Prime/Apex | 5.0 s from 68 km | 7.5 s from 55 km | 3 | Allies ×3 (as before) |
| 1,840 ships, canon | 11.7 s from 57 km | 12.3 s from 55 km | 1 | Reapers |

In the Final Battle of Earth each fleet's battery opens with most of its guns: Hierarchy dreadnoughts 3 of 5,
Hierarchy cruisers 6 of 10, Alliance cruisers 10 of 16, asari dreadnoughts 2 of 2, geth cruisers 5 of 8.

The simulation costs what it did: 1.52 ms a step at 92 ships (1.45 before) and 4.0 ms at 368 (4.4), from
`scripts/combat-benchmark.ts`. Two runs of one battle give the same events.

## What it cost, for the owner to weigh

- **The Reapers are hurt more in canon.** Nothing of theirs was changed, but a line that out-ranges them fires
  for longer. Share of the Reapers' hull destroyed, canon rules: Battle of Earth 6 % → 23 %; Final Battle of Earth
  34 % → 65 %, and one seed in three is undecided at 400 s where the Reapers used to win in 242 s. The Alliance
  task force of the reference engagement now destroys two capitals of four before it is destroyed (the Reaper
  assessment reads SEVERE where it read ELEVATED at most). Eight dreadnoughts destroy a Sovereign in 48 to 80 s
  and lose one to three (78 to 96 s and three). Canon battles are still Reaper victories in every case tested.
  If canon should be as lethal as it was, the lever that does not touch a Reaper is accuracy at long range
  (rounds from beyond the old ranges landing less often); it was not pulled.
- **Reaper capitals spend less of a battle firing** (0.80 → 0.71 of combat time over four seeds): the clock now
  starts at the allied volley, four seconds before a beam can reach.
- **Prime/Apex cruisers miss the opening.** Under that timeline a cruiser's main gun is the fleet-wide Thanix,
  which reaches 26 km. It fires 23 % of a Battle of Earth (35 to 44 % before): the dreadnoughts decide it from
  76 km in 84 s. Whether the Thanix refit should keep a long gun is the owner's to say.
- **In a fleet of a thousand hulls the lead is under a second.** Its dreadnoughts stand in battle groups 200 km
  deep, and only the leading ranks can bear; the volley there is seven guns of 160 and then a rising fire as the
  ranks come up (132 main-battery shots a second by 35 s). A wider, shallower deployment of large fleets would
  give them a volley worth the name; that is a change to formations and was not made here.
- **Hull contacts** in the Prime/Apex Final Battle of Earth over six seeds: 70 pair-ticks in two seeds before,
  29 in three after. The pinned seed has none. They are grazes of 2 to 4 % between hulls of different fleets.

## Tests

- New, `tests/opening-volley.test.ts` (10): the range ladder by class; the drawn-in order, its clearance and its
  release; which guns are in an opening battery; hold, share, settle, limit, under fire and the player's release;
  a line of six firing together before a Sovereign can answer and then sustaining; first fire in three standard
  battles; determinism.
- Fourteen pinned figures moved and were re-measured, each with its old value and the reason beside it:
  `battle`, `combat-ai`, `combat-engagement` (5), `depleted-fleet`, `friendly-crossing`, `hades-volleys`,
  `moving-director` (2), `oculus-standoff`, `reaper-advance`, `reaper-capital-barrier` (2). One of them asserted
  that the Reaper beam out-ranges the dreadnought's gun.
