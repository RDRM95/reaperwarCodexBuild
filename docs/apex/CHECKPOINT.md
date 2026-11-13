# APEX programme checkpoint

Lead engineer's running checkpoint for the handover of 9 November 2026 (priorities P1–P8). Short by design; the evidence lives in the files it names.

## State on 13 Nov 2026, 19:15 UTC — Reaper capital barriers and conventional fire

Read this section first. Everything below it is older.

**Rules in force, unchanged:** the sandbox (`RDRM95/reaper-war-sandbox`) is retired by the owner's hard rule of 12 Nov; no work there. Private reference imagery is never committed. Software rendering is not hardware proof.

**Since the section below:** the HUD fix is merged as Codex #84 (`88d5680`) and deployed.

**Owner's report of 13 Nov:** two Annihilation battles (seed 45) in which 8,652 allied warships fired about 1.5 million rounds at 1,500 Sovereigns and destroyed 15 and 20; suspicion that Reaper capital barriers out-regenerate dreadnought fire; and an after-action report claiming organic victory was possible after total allied destruction. Instructions: investigate shared mechanics first, reproduce with 1, 2, 4, 6 and 8 dreadnoughts against one Sovereign, fix root causes globally without arbitrary multipliers, keep Reaper lethality and Annihilation and Apex settings, fix the report, re-run the large battle.

**In this change** (`docs/apex/REAPER_CAPITAL_BARRIER_2026-11-13.md` has every figure):

- Regeneration is not broken: a Sovereign refills 0.6 % of its barriers a second, a dreadnought 1.1 %. It was left alone.
- **The main guns were silent.** Since the overhaul a hull turned beam-on if its broadside threw more damage a second; canon dreadnoughts and cruisers therefore fought Reapers with broadsides that reach a Reaper's hull at 15 %. A hull now presents the battery that would destroy its present target soonest (`aspectAgainst`, `secondsToDestroy` in `ai.ts`). Four dreadnoughts against a passive Sovereign: 614 s → 152 s. Eight against one that fights back, canon: all lost → Sovereign destroyed for three lost, in seven seeds of seven.
- **Fire was spread too thin.** A target now has its share of attackers when those on it would destroy it within ten seconds (`FOCUS_SECONDS`, `fireOn`); the old point-value rule (`OVERKILL_SHARE`) is gone.
- **The after-action report** counts capital losses as a share of those committed and reports a finished engagement as it ended (`reaperIntel.ts`).
- Winners unchanged in 54 standard battles; canon Final Battle of Earth: Sovereigns destroyed 0.2 → 2.2 of 10. Annihilation is still a catastrophic Reaper victory at every size tried.
- New scripts: `scripts/sovereign-trial.ts`, `scripts/annihilation-battle.ts`. New tests: `tests/reaper-capital-barrier.test.ts`, `tests/reaper-assessment.test.ts`.

**Found and NOT changed, for the owner to decide:** armour is charged against a beam every tick, so a Thanix reaches a Reaper's hull at 15 % instead of 86 %, and Reaper beams are likewise weakened against armoured hulls. Fixing it is correct but favours the Reapers (allied losses in Prime/Apex battles up by about a quarter in a trial), so it was left out. Also noted: the dreadnought main gun plays at four seconds where its own catalogue entry quotes the codex's two (Strict Lore uses two); Apex Reaper-killers spend NOVA rounds on destroyers in front of them.

**Open PRs by others, untouched:** #27 and #69 do not overlap this change; #26 already conflicts with the base in `ai.ts`.

## State on 12 Nov 2026, 23:35 UTC — combat overhaul, eight passes

Everything below this line is older than the section above.

**HARD RULE FROM THE OWNER, 12 Nov 2026, about 22:15 UTC: the sandbox (`RDRM95/reaper-war-sandbox`) is retired. No further development there: no ports, no pushes, no merges.** Its last merged state is `76a8848` (sandbox #59, the fourth pass). Sandbox #60 (a port of Codex #79 and #80) was open and passing when the rule came; it has been left open and unmerged for the owner to close. Every mention below of a sandbox port still to do is void.

**Owner's directive of 12 Nov** ("Combat AI and Fleet Movement Overhaul"): make combat functional, cinematic, aggressive and fun; ships fight instead of chasing; fix or remove fleet commands; battle groups pass through friendly formations; lightweight collision handling; keep large battles playable. The same message answered the open questions: bring the fixes to `reaperwar` (yes), redesign the geth cruiser, geth dreadnought and quarian heavy cruiser (yes). It did not say which fighter colour was meant or whether fighters are now too hard to see.

**In this change** (`docs/apex/COMBAT_OVERHAUL_2026-11-12.md`): hulls fight what is in reach, a fleet spreads its fire, a hull re-decides at once when its target dies, cruisers and carriers turn their side batteries to their target, hulls sprint to close, frigates and Reaper destroyers swing wider. Share of hull-time firing: 77 to 85 % under canon rules, 57 to 69 % under prime_apex (was 43 to 63 %); dreadnoughts fire about twice as often. Fleet commands audited by measurement: the HUD keeps Attack, Hold position, Withdraw and Retreat; Advance, Flank, Break through, Regroup, Screen and Defend position are removed. Measure with `scripts/combat-activity.ts`.

**Second pass (same note):** fighters strafe the hull they attack and fly in wings of four that share their leader's target (firing 18 to 20 % → 33 to 41 % of the time); a fleet attacking through an allied fleet was measured and needs no fix (no delay, deadlock or contact; `tests/friendly-crossing.test.ts`). The first pass is merged as Codex #73 (`3981f49`).

**Since then (19:40 UTC):** the second pass is merged as Codex #74 (`ecfc02e`); the sandbox has both passes (its #55 `e5fd500`, #56 `6c569e5`). The geth cruiser, geth dreadnought and quarian heavy cruiser, which the owner asked for, are redesigned and merged: Codex #75 (`aa30285`), sandbox #57 (`296c1e9`), both deployed (`docs/apex/GETH_QUARIAN_CAPITALS_2026-11-12.md`).

**The `reaperwar` port (owner said yes), on its branch `claude/mass-effect-reaper-war-simulator-fidrz2`, commits `9f4b5f9` and `5c4ed71`, not on its `main` and not released.** Brought across: the six fighter models, the fighter engine-glow rule, and the tracer, muzzle-flash, hit, explosion, point-defence and distant-fighter rules (there, main guns' share of tracer area 19 → 69 %; sparks from light hits 5,658 → 48). 550 unit tests and its 14 end-to-end tests pass. Tried there and not kept: the fire-spreading target choice, which spread targets but did not raise the share of hulls firing (45 % before and after under prime_apex; 87 → 82 % under canon). Not brought: any other simulation change; that engine is different and each would need measuring there first. Its prime_apex Battle of Earth has hulls firing 45 % of the time with the first shot at 44 s, which is the thing to look at next there.

**Third pass, in this change:** a fighter out of torpedoes stays 15 s over its target with its guns before turning for its carrier (it used to turn at once). Fighters firing 43 → 53 % (canon) and 33 → 44 % (prime_apex); attack runs a minute 4.3 → 6.2 and 2.3 → 3.9. Winners unchanged in twenty battles. Cost: in the Custom Battle under prime_apex fighter losses go from 39 to 91 %. A transit sprint for fighters was tried and removed. Because fighters now fire far more, their cannon is drawn one round in four (a tracer belt): 3 to 6 % of the tracer picture instead of 13 to 22 %.

**Since then (20:55 UTC).** Third pass merged as Codex #76 (`bec1d8f`); its sandbox port is #58, whose first commit failed the tracer browser test (that is how the tracer belt came about); its second commit passes the whole browser suite locally. **Fourth pass (Codex #78):** a fleet reduced to a few hulls on one wing judged its distance and steered from the middle of the formation it started with, and so marched survivors that were already in range sideways round their target for minutes (one battle ran to its 300 s limit). It now steers from where its surviving line stands; exact for a fleet at full strength. Controlled case: 175 km flown in circles → 18 km, then holding. Longest battle in eight seeds: 224 → 167 s (Battle of Earth, canon), 269 → 232 s (Final Battle). Winners unchanged in forty battles.

**Measured and closed:** dreadnoughts firing little in lopsided battles is distance, not behaviour (91 Alliance hulls start 100 km from 10 Reapers; a second wave arrives 87 km away at about 55 s). **Tried and dropped:** narrowing target choice to a spatial query (identical results, no gain: the cost is scoring candidates, not scanning). The simulation is still about a quarter dearer at 2,208 ships than before the overhaul.

**Since then (21:55 UTC).** The fourth pass is merged: Codex #78 (`aa93b11`), sandbox #59 (`76a8848`). Codex #77 (weapon broad-phase and sprinting hulls) is merged as `3155546`; the sandbox needs no port of it (its spatial index already allows twice top speed).

**Fifth pass, in this change:** a sprinting hull keeps its thrust to give way. Hull contacts in the Battle of Earth under prime_apex over thirty seeds: five seeds, 85 pair-ticks, deepest 57 % → one seed, 12 pair-ticks, 1.7 %. Winners unchanged in forty battles. Three pinned figures were moved from one seed to several (see the note).

**Since then (22:10 UTC).** Merged: Codex #79 (`11bbbe2`, a battle is not over while a fleet is still on its way: under prime_apex the Final Battle of Earth ended at 60 to 78 s in every seed, before its Reaper reinforcement was due at 90 s; it now runs 142 to 152 s with all 32 Reaper hulls) and Codex #80 (`1f6c13b`, the fifth pass). Their sandbox port was sandbox #60, left unmerged (see the rule above).

**Sixth pass, in this change:** a wing flies in formation on its leader (400 m apart, echelon), goes in with it, finishes its own firing run and rejoins on the way out. Over six seeds a wing-mate is within 2.5 km of its leader 84 to 90 % of the time while attacking (49 to 75 % before) and within 1 km 42 to 46 % (16 to 27 %); fighter damage is 1 to 10 % lower. Strict formation (turning away with the leader) was tried and dropped: 10 to 28 % less damage. No hull contacts in eighteen seeds.

**Since then (22:40 UTC).** The sixth pass is merged as Codex #81 (`125660f`). The original `reaperwar` engine was checked for the end-of-battle defect of #79 and does not have it (its end check already counts forces still to arrive). **Seventh pass, in this change:** a fleet on its way arrives five seconds after its side's last hull on the field is lost, if that is sooner than its timetable. In the Final Battle of Earth under prime_apex the Reapers were absent for 22 to 31 s between waves and are now absent for 5; the battle runs 113 to 130 s (143 to 154 s). Canon battles and the Battle of Earth are unchanged.

**Since then (23:15 UTC).** The seventh pass is merged as Codex #82 (`352b8e0`). The original `reaperwar` engine was checked for the depleted-fleet defect of #78 and does not have it (controlled case there: the survivors fly 4 km and hold). **Eighth pass, in this change:** target choice no longer fetches every enemy ship. The battle keeps the tick's enemy positions as packed numbers and hulls out of sensor range (62 to 94 % of the 100,000 walked each tick at 2,208 ships) are rejected from those; the nearest-enemy fallback is found in the same walk. Results are identical (seven battles, and `tests/target-choice-packed.test.ts`). Target choice 3.6 → 1.5 s per 600 ticks under the profiler; the whole simulation 20.8 → 16.4 s; the approach now costs what it did before the overhaul (20 to 24 ms a tick); a fighting tick is still 30 to 50 % dearer than before the overhaul because about three times as much happens in it. **Correction:** the line above that says the cost of target choice "is scoring candidates, not scanning" is wrong; it was fetching ships that were then rejected.

**Since then (23:35 UTC).** The eighth pass is merged as Codex #83 (`7c0fd83`).

**HUD, in this change (found in the frames of the visual pass):** the battle HUD's side columns started at a fixed 118 px, and the top bar is that tall only on a wide screen. Measured in the browser: at 1920 px wide the status panel ended at 128 px and covered the head of the allied fleet list by 10 px; at 1600 and 1280 px by 23 px, hiding the last status line; clear at 2560 px. The centre notice ("REINFORCEMENTS DETECTED") sat at 90 px across the camera buttons, and was drawn starting at the middle of the screen for its first 0.3 s before jumping to its centred place (the shared fade-in replaced its centring transform). The columns and the notice now start below whichever top-bar panels are above them (`src/ui/hudLayout.ts`, measured on resize), and the notice keeps its centring while it rises. `e2e/hud-layout.spec.ts` checks it at 1280 and 1920 px and fails on the old layout (33 and 12 px of overlap); `tests/hud-layout.test.ts` holds the rule. Before and after at 1280 x 720: `docs/apex/qa/hud-layout-20261112/`. Software rendering only. Noticed and not fixed: in the Reaper intelligence panel "THREAT: ELEVATED" is drawn over the end of the line beside it.

**Measured and left:** hull separation, now the largest single cost at 2,208 ships (17 %), does two to three times the pair checks it did before the overhaul (15 a hull each tick then, 24 to 48 now). The cause is the closing sprint: a hull at twice its speed needs four times the distance to stop, the largest stopping distance in the battle went from 1.4 to 5.4 units, and every hull's search is sized by it. Narrowing the search to each pair's own stopping distances is not exact (it changes which hulls give way to which), so it would have to be measured against hull contacts like any behaviour change; it was not attempted.

**Not done from that directive, in the order to take them:** fighters still fly 55 to 77 km out from their carrier (traced: carriers are the slowest hulls and start 100 km out; a transit sprint was tried and removed); the rest of the tick cost at 2,208 ships (see above); nothing has been judged in motion. **Needs the owner:** whether fighters staying to strafe (and dying more) is wanted, and for how long; whether one tracer round in four reads as too thin; which colour was meant for "organic fighters"; whether fighters are now too hard to see; a look on the RTX 5090.

## State on 12 Nov 2026, 12:50 UTC — owner's play reports worked through

Its first half was written on 11 Nov at 15:40 UTC (regroup and screen orders, since removed); the paragraph on the owner's play reports is current to the time above.

**Merged today, Codex build and sandbox both:**

- Hulls keep clear of each other at every tick (Codex #56 `d78638b`, sandbox #46). Earlier notes said "no overlapping hulls" from looking every 5 s; counted at every tick the old base had contacts in 10 of 36 seeds of the control battle. Now none in 71 of 72 battles measured (`scripts/contact-check.ts`).
- Large fleets deploy in altitude bands, audit FS6 (Codex #57 `322ed29`, sandbox #48): the Fifth Fleet is 11.7 km tall where it was 2.6 km.
- Hulls do not give way to fighters (Codex #58 `414354a`, sandbox #49): carriers holding formation were pushed 5 to 6 km off station by their own wings and now hold within 0.11 km.
- CI installs the browser alone when the runner cannot fetch system packages (Codex #59 `d7b5217`, and in the sandbox's two workflows via #49). The runners' package mirror was unreachable from 13:47 UTC for about two hours and every job died before its first test; retrying did not help, the fallback did.

**In this change (3D combat slice 7):** two more fleet orders, **Regroup** and **Screen**, in the simulation and as HUD buttons (already in the sandbox's simulation through #49). Regroup gives a fleet's survivors a fresh compact formation where they stand and resumes the attack once formed (about 30 s); a winning fleet finishes sooner with fewer losses. Screen holds the capitals in formation and stands the escorts between them and the enemy wherever it is; it works geometrically (16 of 16 escorts between, was 7) but does not protect the capitals, because nothing in the simulation blocks a line of fire. Figures are in `docs/apex/COMBAT_3D_ENGAGEMENT_QA_2026-11-11.md`, "Slice 7"; the slices before it are in the same note.

**Local GPU Edition (in this change):** the owner asked for the locally run version to use their hardware for better-looking, bigger battles, and left the workflow to the build agent. Decision: that version is this repository's `PLAY_LOCAL_GPU.cmd`, not the older `reaperwar` engine. Added an Ultra quality preset, a local hardware profile the launcher applies on first start (Ultra, native resolution, worker simulation) and one-click fleet scaling in Custom Battle. `docs/apex/LOCAL_GPU_PROFILE_2026-11-11.md`. Measured in a software-rendered browser only; the launcher script itself was not run and no real GPU has drawn it.

**Owner's play reports, 11 Nov evening, and where each stands:** (1) "no one shoots": fixed in Codex #62 (`f016f7a`), hulls close to gun range ("Slice 8" of the 3D note; frigates firing 54 % → 91 % in a four-times battle). (2) Reapers still move too rigidly, all in a line: fixed in Codex #63 (`e77e5eb`), capitals now fight at individual distances and swing wider ("Slice 9"; velocity alignment 0.73 → 0.47), the fleet's width and order along it unchanged. Both simulation fixes are in the sandbox too (its #50, `c737368`). (3) Fighters draw too much attention (rat-a-tat sparks): Codex #64 (`3026fc0`) scales down secondary-gun tracers, point-defence lines and distant fighter glows (`docs/apex/VISUAL_WEIGHT_2026-11-11.md`; main guns 12 % → 53 % of tracer area). The fighters themselves are rebuilt in Codex #65 (`ac8fe81`, `docs/apex/FIGHTER_MODELS_2026-11-11.md`): all six factions' fighters were four to six boxes with a lit cube for a canopy and a 30 m engine glow on a 36 m craft; they are now winged craft from one kit, in their faction's colours, with a glow a fifth of their length. The "sparks" that remained were flashes sized for larger ships: Codex #67 (`f4ce19c`) puts light guns' muzzle flashes, fighter-round hits and fighter deaths in proportion (second pass in `docs/apex/VISUAL_WEIGHT_2026-11-11.md`; main guns 35.5 % → 90.8 % of muzzle-flash area). The Alliance carrier, the last box hull in an Alliance fleet, is rebuilt in Codex #66 (`edb3e51`, `docs/apex/ALLIANCE_CARRIER_2026-11-11.md`), and the turian frigate in Codex #68 (`9f64a8d`, `docs/apex/TURIAN_FRIGATE_2026-11-11.md`). The sandbox has the visual-weight change (its #51, `7bf9a4b`) and the fighters, carrier and flashes (its #52, `7725a87`); the turian frigate is its #53 (`882af8c`). The geth and Cerberus frigates, the last frigates made of boxes, are rebuilt in Codex #71 (`2b6cea1`, `docs/apex/BOX_FRIGATES_2026-11-12.md`) and the sandbox's #54 (`cc6b749`). All of these were merged with their own checks green; the combined Codex base (`9f64a8d`) then passed the unit suite (84 files, 493 tests) and the build locally, and both Pages deployments succeeded. Still open from that report: the geth cruiser and dreadnought and the quarian heavy cruiser are still built from boxes. They were left alone on purpose: unlike the fighters, the carrier and the three frigates, which were placeholders, these are authored designs (the geth head, ring and segmented spine; the quarian converted freighter with bolted-on modules), the reference pack has no frames of them, and rebuilding them is a design decision for the owner. Also open: whether fighters are now too hard to see, which is the owner's to judge on their own hardware. The owner was asked which colour they meant by "correct colour for actual organic fighters" and has not answered; nothing was recoloured, and the changes above remove the blue-white ball that hid each fighter's own colours. (4) The owner noticed nothing has been deployed to the original `reaperwar` repository since 9 Nov and has been asked which game they are playing.

**The original `reaperwar` repository** runs a different simulation engine. Measured there on 11 Nov (canon_me3, seed 1): deployments are already deep (19 to 92 % as tall as their longest side) and clear; hull contacts at every tick exist (70 pair-ticks in Battle of Earth, 37 in the Final Battle of Earth); firing lines average 12 to 14° off the horizontal. The owner has been asked what to bring across; nothing there has been changed.

**Measured and not built: AI fleets choosing flank or break-through.** Battles here last 100 to 170 s and a break-through needs about 220 s to get a fleet past its enemy, so a Reaper fleet ordered through from the start is still 5 to 8 km short when the battle ends (Battle of Earth, canon_me3 and prime_apex, six to eight seeds; outcomes unchanged). Fleet-level manoeuvres have no room to show until battles last longer or fleets close faster.

**3D combat still missing, in order:** line-of-fire masking (without it a screen is only a picture); AI fleets ordering regroup or screen for themselves; bearings that react to barrier state and local threat; fighter squadron manoeuvres and carrier standoff.

**The owner's directive of 11 Nov arrived cut off** in the middle of section 2 ("Do not simply change visual banking while leaving tactical"). Anything after that never reached the build agent.

## State on 11 Nov 2026, 03:40 UTC — fleet intents

Older than the section above.

**Merged since the section below:** Codex #54 (`f3f72ab`, altitude lanes, with the worker browser test made independent of renderer speed) and its sandbox port #44 (`db15536`).

**In this change (3D combat slice 3):** two fleet orders, **Flank** and **Break through**, in the simulation and as HUD buttons. Flank takes a fleet 65° round the enemy at its own range; break through drives it past the enemy to the far side, hulls keeping their places in the line until it is through. Measurements, the hull-track plot and what the orders are worth over twelve seeds are in `docs/apex/COMBAT_3D_ENGAGEMENT_QA_2026-11-11.md`, "Slice 3". The sandbox port needs the simulation and type changes only: its interface is its own.

**The owner's directive of 11 Nov arrived cut off** in the middle of section 2 ("Do not simply change visual banking while leaving tactical"). Anything after that sentence, and any later sections, never reached the build agent.

**3D combat still missing, in order:** screen and regroup orders and AI fleets choosing an intent; flat deployment within a fleet (audit FS6; the composer branch is stale); Reaper capitals penetrating a formation; bearings that react to barrier state and local threat; carriers and fighters.

## State on 11 Nov 2026, 02:45 UTC — worker merged, altitude lanes

Everything below this line is older than the section above.

**Merged since the section below was written:** #53 (`640c8fa`), the worker simulation behind the Simulation thread setting. The line below that calls it open is out of date; everything else there stands.

**In this change:** altitude lanes for allied fleets (3D combat slice 2). The first fleet of a side keeps its level; each further fleet takes a lane above or below while it closes. Final Battle of Earth: the Alliance fleets' anchors spread 1.1 → 10.9 km in altitude and each fleet's hulls stack at -0.4, +4.0, -3.7, +2.7 and -1.5 km. Single-fleet sides are unaffected. Details, measurements and the cost (about five points less enemy hull destroyed inside 150 s in two of three scenarios) are in `docs/apex/COMBAT_3D_ENGAGEMENT_QA_2026-11-11.md`, "Slice 2". `scripts/scenario-batch.ts` measures a built-in scenario over several seeds. The sandbox port follows the same way as #43.

**3D combat still missing, in order:** flat deployment within a fleet (audit FS6; the composer branch is stale), fleet intent orders (flank, breakthrough, screen, regroup), Reaper capitals penetrating a formation, bearings that react to barrier state and local threat, carriers and fighters.

## State on 11 Nov 2026, 02:05 UTC — simulation in a Web Worker

Everything below this line is older than the section above.

**Merged (Codex build, head `aff712f`):** #50 (twelve-seed outcomes for the 3D slice, the unshipped attack-run finding) and #52 (snapshot codec and mirror: `src/simulation/snapshot.ts`, `tests/snapshot-mirror.test.ts`; the mirror equals the simulation field for field over three seeded battles). Sandbox #43 (port of the 3D attack bearings) merged as `76f300e`.

**Open at the time of writing:** the second worker slice, `feat/sim-worker-host-20261111`: the worker (`simWorkerCore.ts`, `simWorker.ts`), `RemoteBattle` (the mirror plus commands and queries), the `BattleLike` type the view and HUD now take, and the **Simulation thread** setting (default main; "Worker (experimental)" applies to the next battle). Measured in the real app with a real worker, cloud software rendering: the drawing thread's simulation cost per tick 9.63 → 0.74 ms at 1,104 ships and 21.25 → 1.19 ms at 2,208. Everything about it, including the known differences in worker mode and what remains, is in `docs/apex/SIM_WORKER_DESIGN_2026-11-11.md`. Merge when its checks pass.

**What only the owner can do next:** turn the setting on with a large fleet on the RTX 5090 machine and say whether it is smoother; watch the 3D attack bearings in motion and judge them; judge the Alliance hulls against the private references.

**Not ported to the sandbox:** the simulation tick speed-up (#43), the bloom fix (#44) and the worker (#52 and its second slice).

## State on 11 Nov 2026, 01:40 UTC — true 3D fleet combat, slice 1

Everything below this line is older than the section above.

The owner's directive of 11 Nov ("COMPLETE DEVELOPMENT CONTINUATION") makes true three-dimensional fleet combat the top priority, and the owner also approved the Web Worker move for the simulation.

**Merged (Codex build, head `d7f1313`):** #49 — engaging hulls take attack bearings round their targets (`src/simulation/manoeuvre.ts`, applied last in `movementGoal`): dreadnoughts 5–14° as a stepped firing line, cruisers 22–55°, frigates 45–105°, Reaper capitals 3–12°, destroyers 20–60°; the middle of a line goes over or under, the wings round their own side; the swing opens as the hull closes. Measured: fleet thickness 0.03–0.10 → 0.12–0.38, firing-line elevation 4–11° → 10–34°, no hull overlaps, same winners; over twelve seeds Reaper hull destroyed 0.215 → 0.216. Evidence and the full tables: `docs/apex/COMBAT_3D_ENGAGEMENT_QA_2026-11-11.md`; tests `tests/engagement-3d.test.ts`; probes `scripts/engagement-geometry.ts` (one seed) and `scripts/engagement-batch.ts` (twelve; use this to judge balance, single seeds diverge by a fifth).

**Open at the time of writing:** sandbox #43 `port/3d-engagement-bearings-20261111` (port of #49; the same seeded battle measures identically there). Merge when its checks pass.

**Tried and not shipped:** frigate attack runs (pass, extend, re-attack). Over twelve seeds they cost frigates about a quarter of their hits and the Alliance about a fifth of its kills, because a frigate flying away is not firing and nothing in the simulation rewards an attack from astern. Details in the QA note. Do not retry without one of those two things changing.

**3D combat: what is still missing from the directive, in the order I would take it:**

1. Deployment is still a flat sheet (audit FS6); depth appears only as fleets close. The unmerged `feat/fleet-composer-silhouette-20261109` branch has altitude bands in its composer; it is behind the base by 30 commits and its last commit is an interrupted agent's work with tests not run.
2. Fleet intent orders (flank, breakthrough, screen, regroup) do not exist; orders still translate one rigid anchor.
3. Reaper capitals do not penetrate a formation; Reapers hold where they are when a swung station lies farther from the enemy than they are.
4. No reaction to barrier state or local threat in the choice of bearing; bearings are fixed for the battle.
5. Carriers and fighters are unchanged.
6. The unmerged `feat/combat-reach-targeting-mass-20261109` branch and the owner's draft #26 edit `movementGoal`; they need #49 merged in when they resume.

**Web Worker simulation (approved, not started in code).** An inventory of what the render and UI side reads from the simulation is done: about 30 ship fields and 11 weapon fields every frame, `projectiles`, `missiles`, `flashes`, fleet orders, the event stream, three read-only queries and four commands; no UI code writes simulation state. What makes it hard: `ShipVisual` and HUD rows hold live `ShipState` objects for the whole battle, simulation helpers (`shipEngagementRange`, `engagementBand`, `inWeaponArc`, `assessReapers`) run on the main thread against live ships, and 14 QA scripts call `app.battle.sim.step()` synchronously. Intended shape: the main thread keeps its own never-stepped `BattleSimulation` built from the same config as a mirror, the worker steps the real one and sends each tick's dynamic fields packed in typed arrays plus new events and spawned ships, the mirror is updated in place so every existing reader keeps working, commands are posted to the worker, and the inline mode stays for tests, scripts and headless runs. First slice: the snapshot codec with a test that a mirrored battle equals an inline one field for field.

## State on 11 Nov 2026, 00:00 UTC — performance and Alliance hulls

Two owner requests since the Reaper work below: a faster game at high ship counts ("playable high fps, high ship count, graphical upgrade, a local version to take advantage of my hardware"), and original Alliance hull improvements from a private pack of fleet reference frames. The frames are never committed; every image in `docs/` is a render of this project's own models.

**Merged (Codex build, base `codex/apex-combat-overhaul`, head `3336140`):**

| PR | What | Evidence |
|---|---|---|
| #43 (`695e7c7`) | Simulation tick 2.3× cheaper at scale with bit-identical results (state digests of four seeded battles unchanged): flat-array occupied-cell separation grid, per-side target neighbourhoods and an early out in `tryFire`. Mean tick, bundled, cloud CPU: 552 ships 14.0 → 5.8 ms; 1,104: 30.0 → 12.6; 2,208: 64.4 → 26.8 | `docs/apex/PERFORMANCE_SIM_TICK_2026-11-10.md`, `tests/separation-exact.test.ts`, `scripts/scale-benchmark.ts`, `scripts/frame-benchmark.mjs` |
| #44 (`66b2c47`) | Bloom fix for a defect #37 introduced: sunlit white hull paint reached 8.8 to 10.2 in scene light and whole decks glowed. The bloom high-pass now judges by colour as well as brightness (neutral threshold 16, coloured 1.3) | `docs/apex/REAPER_BLOOM_QA_2026-11-10.md` (correction section), `tests/bloom.test.ts` |
| #45 (`8074895`) | Alliance dreadnought (arrowhead deck to a spinal blade, citadel aft) and cruiser (forked deck) rebuilt as their own outlines; matt Alliance paint; nodes, lengths and five-mesh structure unchanged | `docs/apex/ALLIANCE_HULLS_QA_2026-11-10.md`, `tests/alliance-hulls.test.ts`, `scripts/alliance-hull-qa.mjs` |
| #46 (`4d5917b`) | Sparks and debris fragments in instanced batches. Draw calls for the same paused frames 806 → 101 (208 ships) and 1,376 → 174 (988 ships); staged close-up frames match the previous build to within 7 of 921,600 pixels | `docs/apex/PERFORMANCE_EFFECT_BATCHING_2026-11-10.md`, `tests/effect-batches.test.ts`, `scripts/effects-batch-qa.mjs` |
| #47 (`3336140`) | Alliance frigate as a swept-wing dart with a chisel bow (372 → 736 triangles; nodes unchanged) | `docs/apex/ALLIANCE_HULLS_QA_2026-11-10.md` (second slice) |

**Merged (sandbox, base `main`, head `86d0598`):** #39 (`ef462d5`, death audio, port of Codex #41), #40 (`8d67f8f`, port of Codex #45), #41 (`9338b74`, port of Codex #46, keeping the sandbox's own budgets of 1,200 sparks and 800 fragments and ship pieces together; measured on the effects system alone in its own scene: 121 → 12 draw calls, frames equal to the previous `main` within 1/255 per pixel; a full sandbox battle was not measured) and #42 (`86d0598`, port of Codex #47). No renders of the new hulls were captured in the sandbox itself.

**Nothing of this work is open.** Check the Pages deploy runs for Codex `3336140` and sandbox `86d0598`; the deployed sites cannot be fetched from the build environment.

**Performance: what is measured and what is left.**

- Cloud container, software rendering. None of this is a measurement on the owner's RTX 5090; draw-call counts and digests are exact, milliseconds are this machine's.
- The 20 Hz simulation tick still runs on the render thread. After #43 it is about 13 ms at 1,100 ships and 27 ms at 2,200 here, so at high refresh rates the frame that carries a tick is long. The structural fix is the simulation in a Web Worker with the view reading snapshots (stage 2 of `docs/EXTREME_SCALE_BRIEF.md`); not started, and the view and HUD read `sim.ships` directly today, so it is a large change.
- Other main-thread costs measured in the browser: view update 1 to 2.4 ms, overlay 0.2 to 0.6 ms, HUD refresh 1.7 to 7.8 ms at 4 Hz.
- The sandbox's simulation files differ from the Codex ones (no `weaponTargetField.ts`, older `separation.ts`), so #43 is not a mechanical port there; it needs its own digest check. Not started.
- HUD refresh was profiled at 1,104 ships: 1.7 ms per refresh at 4 Hz, half of it in the browser's own layout. Not worth a change.
- A local launcher already exists: `PLAY_LOCAL_GPU.cmd` / `scripts/play-local-gpu.ps1` build and serve a production preview on 127.0.0.1:5174. It passes no GPU flags; an Ultra preset for a hardware GPU is not designed yet.

**Alliance hulls: what still falls short.** Flat-shaded paint with no weathering or fine panel texture; no Alliance mark; no deck panel grid; the blue flank band that reads at distance in the references is in the `accent` mesh, which the reduced level of detail hides (level-of-detail policy is the other assistant's branch); carrier and fighter untouched; other factions untouched. `compact_siege` and `compact_gunship` are restyled copies of the dreadnought and cruiser and took the new shapes. Nobody but the build agent has looked at the new hulls; the owner's judgement against the references is outstanding.

**Local QA in this cloud container.** The project's `@playwright/test` does not match the installed Chromium, so the project's browser suite runs only in CI; the QA scripts take `REAPERWAR_PLAYWRIGHT=<path to a matching playwright module>`.

## State on 10 Nov 2026, 21:30 UTC — Reaper visual overhaul

**Merged today (Codex build, base `codex/apex-combat-overhaul`, head `fb61d91`):**

| PR | What | Evidence |
|---|---|---|
| #28 (`a1d2d9c`) | Instanced batches skip a template's hidden stand-in limbs (46–57 % fewer vertices per instanced Reaper); Ascendant renders at 300 units | `docs/apex/qa/INSTANCED_REAPER_LIMBS_2026-11-10.md` |
| #29 (`2270474`) | Reaper hulls rebuilt: lofted carapace with armour bands, stepped hood, ribbed ventral cavity, faceted plated limbs with knuckles and blade claws, readable graphite palette; lengths, muzzle and engine nodes unchanged | `docs/apex/REAPER_VISUAL_QA_2026-11-10.md`, `docs/apex/qa/reaper-visual-20261110/` |
| #30 (`ca6f4c5`) | Limb travel and combat stances, slow and limb by limb (claw-tip shift on a capital 14 m → 230 m) | `docs/apex/REAPER_LIMB_STANCES_QA_2026-11-10.md` |
| #31 (`6dcd03f`) | Camera presence: over-the-carapace Reaper view; follow share of a Reaper 25 % → 45 % of the frame's width, solo cinematic 16 % → 27 %; small hulls unchanged | `docs/apex/REAPER_CAMERA_QA_2026-11-10.md` |
| #32 (`e5c9b41`) | Local weapon light: a fixed pool of two point lights for charging and firing emitters | `docs/apex/REAPER_EMITTER_LIGHT_QA_2026-11-10.md` |
| #34 (`496ebe5`) | Curved armour shading (creased normals) on bands, hood shells and limb sleeves; triangle budgets nearly used up | `docs/apex/REAPER_CURVED_ARMOUR_QA_2026-11-10.md` |
| #35 (`505dcde`) | Damage response: below 60 % hull the seams run from pale blue to hot red-orange and flicker per ship; armour emissive capped so the plates stay graphite | `docs/apex/REAPER_DAMAGE_GLOW_QA_2026-11-10.md` |
| #36 (`655824d`) | Breakup: a destroyed Reaper no longer vanishes; limbs, mandibles, hood shells and carapace become debris (0 → 23 pieces on a capital), hot seams carry into the wreck | `docs/apex/REAPER_BREAKUP_QA_2026-11-10.md`, `scripts/reaper-death-qa.mjs` |
| #37 (`8aa07f3`) | Restrained HDR bloom on light sources (high preset, or the Bloom control in Settings): half-float 4× MSAA scene target, `UnrealBloomPass` at strength 0.1, radius 0.15, threshold 1.3, tone mapping once at the end; beam cores HDR in the beam's hue; the atmosphere, starfield and barrier-shell shaders convert their display-referred colours in that path, so Earth's limb measures (8,30,105) without bloom and (9,30,104) with it | `docs/apex/REAPER_BLOOM_QA_2026-11-10.md`, `scripts/bloom-qa.mjs` |
| #38 (`5891d15`) | Cinematic two-shot: a capital-scale hull whose partner is 3.5 hull lengths away or more is framed over its shoulder, looking down the line of fire (a Reaper's share of the frame's width with its target 120 units away 14.4 % → 46.6 %, at 400 units 4.9 % → 46.6 %); small hulls and close pairs keep the side-on shot | `docs/apex/REAPER_TWO_SHOT_QA_2026-11-10.md`, `scripts/cinematic-two-shot-qa.mjs` |
| #39 (`ed39556`) | Staged Reaper death: bursts on the hull in the ship's own axes, drifting with it; a capital dies over 5.2 s (was 2.2) and a destroyer over 2.4 s (was 0.9) with bursts marching aft, failing lights, a slow list and curling limbs; hull pieces leave outward from the centre of the break | `docs/apex/REAPER_DEATH_SEQUENCE_QA_2026-11-10.md`, `scripts/reaper-death-qa.mjs` |
| #41 (`fb61d91`) | Death audio follows the staged death: a Reaper is heard dying at the kill (new synthesized `reaper_death`, 5 s, and `reaper_death_small`, 2.2 s) and exploding at the breakup; #39 had left the explosion at the kill, 5.2 s before a capital broke apart. Other classes unchanged | `docs/apex/REAPER_DEATH_SEQUENCE_QA_2026-11-10.md` (correction section), `scripts/reaper-death-audio-qa.mjs` |

The Pages deploy workflow succeeded on `ed39556`; check the run for `fb61d91`. The deployed site itself was not fetched from this environment (the network policy blocks it).

**Merged today (sandbox, base `main`):** #32 (`bfb66b5`, port of Codex #28), #33 (`7ba24bd`, port of #29), #34 (`40f7e32`, port of #30), #35 (`3eb06dc`, port of #31, #32 and #34), #36 (`7b47874`, port of #35 and #36), #37 (`8c05b69`, port of #38, `cameras.ts` byte-identical), #38 (`e8ec355`, port of #39, `deathSequence.ts` and `breakup.ts` byte-identical). The sandbox carries every merged Reaper visual change except the bloom (#37 of the Codex build) and, until its port merges, the death audio fix. Pages deployed after each (workflow status; the site was not fetched from this environment).

**Open at the time of writing — check their state before doing anything else:**

- Sandbox #39 `fix/reaper-death-audio-20261110`: port of Codex #41 (`deathSequence.ts` byte-identical; the sandbox keeps its own mix for deaths in `main.ts`). Open with its checks running when this was written; merge it when they pass. Until then the sandbox plays a Reaper's explosion at the kill, before the breakup. Its `main.ts` wiring was typechecked but not exercised in a browser with audio on.
- Nobody has listened to the new dying sound; it was only played on a live audio context without errors. Judge it by ear and retune `reaper_death` in `src/audio/engine.ts` if it is wrong.
- The bloom (#37) is not ported to the sandbox: the sandbox already has an optional bloom on its Ultra preset without the shader conversion, so its atmosphere and barrier shells are brighter there than at other presets. Whether that is the intended Ultra look is the owner's call; ask before porting `sceneColour.ts`.
- Bloom was not measured on a hardware GPU. On CI's software renderer the browser job took 11.0 and 12.7 minutes with bloom on by default, against 8.9 to 11.7 minutes on the pull requests before it.
- Sandbox `e2e/gunnery-pose.spec.ts:41` (destroyed gunner station) runs a duel at 8× until the gunner's ship dies. It takes 20.1 s locally before today's Reaper ports and 21.5 s after them; CI's software renderer takes about a second per frame, so it sat at the edge of the default 60 s and timed out inside its closing screenshot on #32, #35 and #36, with every assertion already passed. Sandbox #36 marked it `test.slow()` and then passed; no assertion changed. The durable fix is cheaper hero Reapers at the low preset (the level-of-detail work below).

**Concurrent work by the other assistant — do not duplicate:** `fix/reaper-structural-lod-20261110` (no pull request when this was written): level-of-detail policy for Reapers (`shipLod.ts`, `applyShipLod`, `selectReaperRigDetail(level)`), covering the defect that hero Reapers never reduce detail. It was branched before #29 and edits `battleView.ts` near the `animateReaperRig` call and the signature of `selectReaperRigDetail`; merging it after today's work is a small mechanical merge. Their open PRs #26 (draft, reach) and #27 (Oculus damage) are untouched.

**How to reproduce the evidence.** `npm run build && npx vite preview --port 4191 --strictPort`, then `node --import tsx/esm scripts/reaper-visual-qa.mjs <outDir> http://127.0.0.1:4191 after`: six exact-orbit views plus quarter and close views of each Reaper class, close/medium/distant, frigate-beside-capital, a 20-Reaper fleet, deep space and Earth orbit, and triangle counts. All captures so far are cloud Chromium with SwiftShader: shape, materials and framing only; nothing was measured on the RTX 5090, including the cost of the two emitter lights.

**What still falls short, in order of visible gain:**

1. With bloom on, additive sprites (explosions, engine glows, impact flashes) blend in linear light and were not retuned; exposure is unchanged at 1.05; the brightest stars are held 16 levels lower.
2. Reaper death is staged now, but the bursts always start at the hood rather than where the killing hit landed, its dying sound is unheard by anyone, and the carapace separates along its existing meshes rather than fracturing.
3. In the over-the-shoulder two-shot a distant target is a small shape at the end of the beam, and the camera does not check for hulls between it and the Reaper. The tactical default distance is unchanged.
4. No normal maps or micro-detail; silhouettes of the eight-sided limb sleeves are still eight-sided up close; further geometry needs a level-of-detail split first (see the other assistant's branch).
5. The emitter itself is hidden under the hood from most angles; its light shows, the lens does not.
6. Hull rotation, acceleration and inertia are the simulation's (P1 work package A, below); the render side adds no hull motion.
7. Static stand-in limbs and instanced Reapers show the neutral pose and no damage glow, and instanced Reapers die without hull pieces.
8. Issue #16's P0 checklist (Sovereign-class, Harbinger, destroyer) is not ticked: that needs the owner's manual silhouette judgement against private references.

**P1 combat-flow branches (not merged, no pull requests):** `feat/combat-reach-targeting-mass-20261109` (work package A: has PR #26 merged in, RC1+RC5 at `57bf531`, then a work-in-progress commit `0f01204` with the interrupted agent's unfinished RC2 edits and `tests/feasible-targeting.test.ts`) and `feat/fleet-composer-silhouette-20261109` (work package B: composer, headings, altitude bands and staging to `8725e8f`, then work-in-progress `6d30592`). Both are pushed; the work-in-progress commits typecheck but their tests were not run. The agents stopped when the session was interrupted. Do not interfere with #26.

## State on 10 Nov 2026, 02:50 UTC

- **Reaper visual overhaul** (the owner's HIGH task of 10 Nov). Diagnosis first: rendered lengths already match the catalogue (Sovereign-class 20 units = 2,000 m, Harbinger 24, destroyer 1.6, frigate 1.7; 1 unit = 100 m), so the "too small" reading comes from the model, not the scale chain: six smooth glossy tube limbs with ball joints that dominate the silhouette, a short smooth lathe body with no layered plating, cavities, dorsal ridge or spinal housing (body diameter about 15 % of length where the design says under a tenth), a navy plastic-like palette with pink confetti running lights, and no surface detail to give a sense of size. Slices, each its own branch and pull request:
  1. **Carapace, hood cavity, armoured limbs and the §7.8 graphite palette** on `feat/reaper-carapace-limbs-20261110` (in progress; first commit `08f53b3`): aft blade with overlapping longitudinal bands and a split tail housing, stepped hood shells, a ribbed ventral cavity at the limb roots, faceted sleeved limbs with mechanical knuckles and blade claws; lengths, eye/muzzle and engine nodes unchanged; six-view, close/medium/distant, frigate-beside-capital, fleet and two-lighting captures to `docs/apex/qa/reaper-visual-20261110/` with a QA document.
  2. **Instancing defects.** 2a merged as PR #28 (`a1d2d9c`): `createBatch` merged the Reaper rig's hidden static stand-in limbs into every instanced Reaper (12,744 of the Sovereign template's 22,260 vertices, 57 %; Harbinger 46 %; destroyer 48 %); the batch now skips hidden layers; the Ascendant renders at its catalogue 300 units instead of 360. Sandbox port: PR #32. 2b, after slice 1 names structural parts: plates, eye and lights drop at the reduced level because `plates` is a detail mesh name, and `applyLod` only walks direct children so hero Reapers never reduce.
  3. **Motion and presence** (limb articulation per class, render-side deliberateness within the simulation's turn rates) and the sandbox ports of slices 1 and 2.
- **P1 status.** Work package A merged the owner's PR #26 (`fix/class-engagement-reach-20261109`, rear-rank reach and class cruise limits) into its branch as instructed, keeps its modules and fixture, and is on RC1+RC5 (`57bf531`); work package B has the seeded order-of-battle composer, per-hull headings, reach-bounded depth, altitude bands and staging (`8725e8f`) and is at its gate.
- **Owner's open pull requests:** Codex #26 (draft, reach; reconciled by work package A rather than duplicated), #27 (Oculus damage separated from the Annihilation beam multiplier; independent of P1), sandbox #30 (the port of #26).

## State on 9 Nov 2026, 21:30 UTC

- **Audit done.** `docs/apex/COMBAT_AUDIT_2026-11-09.md`: combat flow root causes RC1–RC9 and formation findings FS1–FS8, with executed measurements on `be9a99c` (the head after PR #17) and `6148253` (before it), probe scripts and before/after numbers.
- **P1 in progress** on two feature branches against `codex/apex-combat-overhaul`, each in two implementation steps, an adversarial verification and a fix round, then a pull request:
  - `feat/combat-reach-targeting-mass-20261109` (work package A): reach and anchoring (RC1, RC4–RC6), target scoring (RC2), mass and heading-dependent translation (RC3), Reaper slew (RC7), live doctrine fields (RC8), frigate and screen behaviour (RC9), with `scripts/combat-flow-metrics.ts` for before/after tables.
  - `feat/fleet-composer-silhouette-20261109` (work package B): order-of-battle composer, asymmetric templates, headings, depth within engagement geometry, reform and evolution during combat, altitude, carrier wing stations, multi-fleet staging (FS1–FS8), with `scripts/silhouette-metrics.ts` and plots (commit `422ba5f`).
  - The sandbox (`RDRM95/reaper-war-sandbox`) ports follow each merged pull request, module by module per `docs/DEFINITIVE_WORKFLOW.md`; the shared simulation files that already differ between the two repositories are `ai.ts`, `fireControl.ts`, `separation.ts` and `battle.ts` (the Codex has `projectileBroadphase.ts` and `weaponTargetField.ts`, the sandbox `spatialIndex.ts`).
- **P2 plan (scripted cinematic battles).** The sandbox's `src/spectator/sceneScript.ts` is the shared scene format (timed camera beats, reinforcement waves as ordinary `FleetSpec` arrivals, presentations `directed` / `continuous_pov` / `explore`, a POV anchor validated against the roster; it compiles unchanged against the Codex types). The Codex implements none of `CINEMATIC_DESIGN.md` §1–§3 yet (no beat scheduler, shot list or Showcase; `director.ts` is the activity-weighted pair picker). P2 therefore ports the format into the Codex as a shared module and extends it, in both repositories, with: conditional triggers (event- and state-conditioned beats keyed to simulation time), forced interventions recorded in an event ledger and shown at the end, a shot list with dead-subject fallbacks, captions and telemetry, deterministic replay (a scene pins its seed; replay restarts the same config). First complete scene: the Normandy stealth flank in continuous POV, then the Sol opening salvo as a directed scene.
- **Owner's parallel work on 9 Nov**, merged while P1 ran: Codex PRs #22–#24 (first-person optics rigidly on the barrel, solar-lit orbital terrain and GPU resource release, Oculus optic visibility) and sandbox PRs #25–#29 (POV preflight, gunnery pose, orbital lighting, Oculus optic, large fleet map labels). Rendering only; no simulation files changed, so the P1 branches merge the base cleanly.

## Rules in force

The sandbox repository is retired by the owner's order of 12 Nov 2026: do no work in it. Deterministic simulation (seeded Rng only; no `Math.random`, `Date.now`, `performance.now` or `process.env` under `src/simulation`, `src/data`, `src/scenarios`, `src/timelines`, `src/core`); no fake combat (ranges, arcs, barriers, charge, propulsion and collision decide outcomes; forced scene events are recorded as such); tests are the contract (a pinned value changes only with a measured new value and the reason in the commit); provenance on catalogue values; canon by default, AU labelled; HADES is a penetrator with a nuclear warhead; no ripped assets; GitHub's software WebGL is not hardware proof, so performance claims name what was measured and where.


## SR-2 release handover — 11 Nov 2026, 18:46 UTC

[Codex #51](https://github.com/RDRM95/reaperwarCodexBuild/pull/51) contains the original SR-2 geometry and rendered QA evidence. [Sandbox #47](https://github.com/RDRM95/reaper-war-sandbox/pull/47) merged as `20d6a39`; its Pages deployment and live six-view inspector check passed. Private references remain outside both repositories. The owner explicitly approved PR publication, coordination and safe merges. Final release status is recorded on [issue #16](https://github.com/RDRM95/reaperwarCodexBuild/issues/16).

Codex now integrates `3e96c2e` (regroup/screen, carrier station, deployment depth and CI fallback), retaining the upstream checkpoint and overlay-test slow budget. SR-2 geometry is unchanged. On the preceding integrated head `b54418b`, all 448 unit tests, build and four targeted browser tests passed locally; both full CI runs and reference/large-fleet CI passed. The current head must pass CI before merging.

Rounded fuselage, thin swept supports, separate stepped nacelles and paired fins reduce beam/length from 0.7943 to 0.4733. Gameplay length and gun datum stay fixed; exhaust nodes are verified against nozzle faces. Five material batches remain; full/reduced triangles are 1,752/1,460. See `docs/apex/NORMANDY_SR2_QA_2026-11-11.md` and its linked original-render evidence. SwiftShader checks establish draw counts and correctness, not RTX performance. Issue #16 remains unapproved: exact canon dimensions, underside detail and owner likeness review are outstanding.
