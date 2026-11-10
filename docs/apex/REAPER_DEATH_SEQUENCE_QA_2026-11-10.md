# A Reaper dies in stages (10 November 2026)

Rendering only. The simulation has already removed the ship when any of this plays; nothing is written back.

## Defect

A capital Reaper died exactly like a dreadnought: 2.2 s of secondary explosions, then the breakup (a destroyer got
0.9 s, like a cruiser). The explosions were placed in a box a full hull length wide and deep in world axes, whatever
the ship's heading, so most of them appeared in empty space beside the hull, and they stayed where they spawned while
the hull drifted on. At the breakup every piece left in a random direction
(`qa/reaper-death-20261110/before-after-death-sequence.jpg`, top row).

## Change

- `src/rendering/deathSequence.ts`: `deathPlan(role, shipId)` gives each death a duration and a list of bursts in hull
  lengths along, across and above the ship's own axes, from a generator seeded by the ship's id (the same ship always
  dies the same way). Every hull's bursts are now on the hull and drift with it.
- A Reaper's death is staged. A capital takes 5.2 s and a destroyer 2.4 s. Sixteen bursts (eight on a destroyer) start
  at the hood and march aft along the spine of the carapace, growing and quickening: seven of the sixteen fall in the
  last 28 % of the death. The seams surge and then stutter out (`deathLight`), the drive glow fails with them, the
  hull lists slowly and then faster (`deathList`, under a quarter turn in all), and the limbs curl in. Then it breaks
  apart.
- `breakupVelocity` in `src/rendering/breakup.ts`: hull pieces leave outward from the centre of the break along their
  own offset, with a small scatter, so limbs and plates separate instead of drifting through one another.
- Dreadnoughts, carriers and cruisers keep their durations and cadence.

| | Before | After |
|---|---:|---:|
| Capital Reaper, kill to breakup | 2.2 s | 5.2 s |
| Reaper destroyer, kill to breakup | 0.9 s | 2.4 s |
| Bursts within the hull's envelope | scattered in a world-axis box one hull length wide | all (test) |
| Piece velocity at the breakup | random direction | outward from the centre (test) |

## Evidence

- `tests/death-sequence.test.ts`: durations per class; every burst inside the hull's envelope for four classes and
  three seeds; the Reaper's bursts ordered in time, marching aft and quickening; the same plan for the same ship; the
  lights at least as bright as at the kill until 55 % of the death and under 15 % of that after 90 %; the list
  monotonic and under a quarter turn; piece velocities outward and bounded.
- `qa/reaper-death-20261110/before-after-death-sequence.jpg`: the same capital 1.2, 3.2, 5, 7 and 10 s after the kill,
  before (top) and after (bottom). Reproduce with `scripts/reaper-death-qa.mjs`.
- Captures are cloud Chromium with SwiftShader. The sequence was judged from stills and the numeric tests, not in
  motion, and nothing here was run on a hardware GPU.

## Limits

- The bursts do not start where the killing hit landed; they always start at the hood.
- The limb curl only shows on articulated (hero) Reapers; instanced Reapers and static stand-in limbs die without it.
- The carapace still separates along its existing meshes.

## Correction and follow-up: the sound of a staged death (same day)

The first version of this note said the explosion sound played at the breakup. It did not: the explosion was played
when the simulation reported the kill, for every class, so after the staging above a capital Reaper was heard
exploding 5.2 s before it broke apart, and the breakup itself was silent.

Fixed in the change that follows this one. `deathSounds(role)` in `src/rendering/deathSequence.ts` names what is heard
and when: a staged death plays a new synthesized sound at the kill (`reaper_death`, 5 s, for a capital ship and
`reaper_death_small`, 2.2 s, for a destroyer: the horn sagging in pitch and breaking up) and the explosion at the breakup, through a
`BattleView.onBreakup` callback. A Reaper with no hero mesh (instanced) has no staged death to show, so its explosion
is heard at the kill together with the dying sound. Other classes sound exactly as before.

| Destroyed hull | Cues before (seconds after the kill) | Cues after |
|---|---|---|
| Capital Reaper | explosion at 0 | dying sound at 0, explosion at 5.23 |
| Reaper destroyer | explosion at 0 | dying sound at 0, explosion at 2.40 |
| Alliance dreadnought | explosion at 0 | explosion at 0 |

Measured with `scripts/reaper-death-audio-qa.mjs` on both builds. The new sound was also played on a live audio
context in headless Chromium without errors. Nobody has listened to it: its character is unjudged.
