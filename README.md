# Mass Effect 3 — Reaper War Simulator

> **Change the variables. Change the war.**

A browser-based, real-time 3D naval warfare simulator set during the Reaper War of 2186. Canon Mass Effect 3 is the default; alternate-universe rule sets are optional and never presented as canon.

**Unofficial, non-commercial fan project.** Mass Effect is a trademark of Electronic Arts / BioWare. No game assets, fonts, models, textures, music or dialogue recordings are used. All ship models are original procedural geometry, all audio is synthesised at runtime, and all text is original.

## Play

- **Live site:** [Play the simulator](https://rdrm95.github.io/reaperwarCodexBuild/), published by GitHub Actions from `codex/apex-combat-overhaul` (see *Deployment*).
- **Local:**

```bash
npm install
npm run dev        # http://localhost:5173
```

## What works today (v0.14.0)

- **Galactic campaign**: interactive galaxy map with 15 systems and relay corridors, weekly turns, Reaper offensives and harvest, a ground war per system (ground forces slow the harvest; krogan reinforce Earth and Palaven when the genophage is cured), allied production from intact industry, eight research projects that change fleet technology in engagements, refugee pressure on the Citadel, Council war summits with decisions, political events (indoctrinated officials, shipyard sabotage, Terminus mercenaries, STG intelligence), 2183 world states (Destiny Ascension and Council composition, rachni queen), fleet movement with cooperation constraints, Crucible construction, indoctrination pressure, morale, Reaper strategic assessment, autosave and Load Game. Engagements involving your fleets can be fought in the 3D simulator or auto-resolved; outcomes feed back into the war.
- **Post-war reconstruction** (Cerberus Ascendant, alternate continuity, 2186–2206): quarterly turns, twelve budget programmes, progressive Reaper dismantlement gated by conventional fleet strength and Sol defence, Council and Alliance politics, victory and defeat outcomes. Start it from campaign setup or continue into it after a Cerberus Ascendant campaign victory.
- **Twelve scenarios**: Battle of Earth, Final Battle of Earth (uses a saved campaign's surviving fleets when one exists; the Salarian First Fleet joins when the genophage cure was sabotaged), Defence of Palaven, Fall of Thessia, Defence of Sur'Kesh (a labelled simulation estimate: STG early warning option), Cerberus Intervention (hostile in canon, cooperative in AU timelines), Rannoch Campaign (war with Reaper-upgraded geth, war without upgrades, or peace against the Reapers), Battle of the Citadel (2183, save the Ascension or concentrate on Sovereign), Alliance Fleet Engagement, Prime/Apex Sol Defence, Prime/Apex Palaven Defence, Cerberus Ascendant — Harbinger, plus a **Custom Battle** builder with the eight original Mass Effect factions, three AU civilization factions, and five crossover factions. Canon/Strict Lore keep their permitted rosters; AU and multiverse options are explicit.
- **Real-time 3D battle** with original Alliance (dreadnought, carrier, cruiser, frigate, Normandy-style Thanix frigate, Trident fighter), Turian (dreadnought, cruiser, frigate, interceptor), Asari (Destiny Ascension, dreadnought, cruiser), Cerberus (cruiser, frigate, fighter, AU Black Fleet dreadnought), Geth (dreadnought, cruiser, frigate, fighter), Quarian (liveship, Heavy Fleet warship, Patrol cruiser, fighter) and Reaper (Sovereign-class capital, destroyer, Harbinger) models, a procedural Citadel, Earth/Palaven/Thessia/Rannoch orbital environments, starfield, procedural weapon effects, barrier shimmer, hull damage glow and break-apart destruction.
- **Simulated weapons**: mass accelerators (real projectiles with lead and sweep collision), Thanix streams, Reaper magnetohydrodynamic beams, GARDIAN point defence in heat-limited bursts, disruptor torpedoes with interception and finite magazines (fighters rearm at their carrier). Kinetic barriers, armour with penetration and ablation, hull, subsystem damage, heat.
- **Fleet AI** with per-faction doctrine, formations (six), focus fire, withdrawal, carrier operations.
- **Player command**: attack / advance / hold / defend / withdraw / retreat / escort / intercept, target priorities, formation changes, fighter deploy/recall, focus fire, point-defence mode, selection and right-click attack orders.
- **Seven cameras**: tactical, cinematic director, ship follow, free, projectile, Reaper, command (holographic overlay).
- **Rendering**: original procedural hulls with image-based lighting, distance level of detail (detail meshes and glow sprites drop with range; far ships and fighters collapse into one point cloud), pooled effects and a draw-call counter on the HUD. `npm run perf` benchmarks a 206-ship Final Battle headlessly.
- **Deterministic simulation** with event log, replay (same seed → same battle), pause and 0.25×–8× speed.
- **AU Worlds & Civilizations**: a separate hub for aligned Alliance/Cerberus, First Contact victors, the warning of 1800, non-eezo FTL, early human eezo, Prothean victory, invented past cycles and explicit HFY branches. Supported modern-human branches also work in the galactic campaign. The independent-FTL branch has real three-week direct transit, with fleets unavailable until arrival.
- **Player civilization**: a seeded polity with finite industry, research, influence, political decisions, ship construction and real fleet technology. Battles deploy its actual inventory and return surviving ships; losses and political consequences persist. A generated past-cycle origin uses the same compact strategic layer, separate from the 2186 campaign.
- **Timeline rule engine** with seventeen built-in profiles, a custom rules template and validated JSON import/export. Canon, Strict Lore, grounded AUs, HFY and crossover sandboxes are labelled separately.
- **Canon vs AU comparison**: same scenario, fleets and seed under two rule sets, split results table, replay of either side, and a ranked explanation of which modifiers changed the result.
- **Ship identities and fleet summaries**: faction-fitting generated names and fighter callsigns, preserved signature/explicit names and numbered Reapers. Large battles automatically use fleet names and live ship counts in both annotations and HUD lists; individual ships remain inspectable.
- **Reaper Intelligence** assessment generated from live simulation data.
- **Codex** and **Fleet Database** with per-statistic provenance (canon confirmed / canon inferred / simulation estimate / AU modified).
- **Procedural audio** (Web Audio) with volume and mute; local save of preferences, custom timelines, custom battle and history (IndexedDB with localStorage fallback) with export/import.

- **Saved games**: weekly autosave plus named slots (rename, delete, export/import with the rest of your data); touch pinch zoom in battle.

Not yet implemented: bilateral negotiation with individual governments (diplomacy is summits plus events), simplified mid-range hull meshes and instanced rendering for very large fleets. Extreme Scale is a [saved future brief](docs/EXTREME_SCALE_BRIEF.md), not a supported engine mode. See [ROADMAP.md](ROADMAP.md).

## Controls

| Input | Action |
| --- | --- |
| Left-click | Select ship (Shift: add to selection) |
| Right-click enemy | Selection (or whole fleet) attacks it |
| Right-click ally | Follow camera on that ship |
| Double-click | Focus camera on ship |
| Drag / wheel / middle-drag | Orbit / zoom / pan (tactical) |
| W A S D, Q E | Pan / rotate (tactical); fly (free, R/F up/down, Shift fast) |
| Space, `[` `]` | Pause, slower / faster |
| 1–7 | Camera modes |
| Tab | Select entire fleet |
| H / O | Cycle HUD / toggle tactical overlay independently |
| Esc | Pause menu |

## Development

```bash
npm run typecheck   # tsc
npm test            # vitest unit + regression tests
npm run build       # production build (dist/)
npm run test:e2e    # Playwright (builds and serves dist, software WebGL)
npm run sim -- battle_of_earth prime_apex 42 fixed   # headless battle for balance work
```

Architecture, lore sourcing, AU rules, known issues and the changelog are documented in [ARCHITECTURE.md](ARCHITECTURE.md), [LORE_REFERENCE.md](LORE_REFERENCE.md), [AU_RULES.md](AU_RULES.md), [KNOWN_ISSUES.md](KNOWN_ISSUES.md) and [CHANGELOG.md](CHANGELOG.md).

The current release's controls/scope are in [AU Worlds](docs/AU_WORLDS_AND_CIVILIZATIONS.md); test results and same-host simulation benchmarks are in [v0.14 verification](docs/QA_V014.md).

## Deployment

`.github/workflows/deploy.yml` builds with `VITE_BASE=/<repo>/` and publishes `dist/` to GitHub Pages on every push to `main` or `codex/apex-combat-overhaul` (or manually via *workflow_dispatch*). One-time setup in the repository: **Settings → Pages → Build and deployment → Source: GitHub Actions**. `.github/workflows/ci.yml` runs typecheck, unit tests, the production build and the Playwright suite on every branch.

If the site shows plain, unstyled “INITIALISING COMBAT SIMULATION…” text, it is serving the source `index.html` instead of the compiled application. Select **Source: GitHub Actions**, then run **Actions → Deploy to GitHub Pages → Run workflow** on the branch containing the updated project. The workflow publishes `dist/`; publishing the repository root does not compile TypeScript or load its imported styles.

## V2 command and viewing controls

In battle, **Spinal fire** controls apply to the selected command scope: hold/resume organic dreadnought guns or **Release volley** when ready. Escorts and point defence keep fighting. Select a ship to see its actual firing/range state. **Watch battle** switches to a quieter cinematic view; **Return to command** restores the tactical HUD. H still cycles full/minimal/clean HUD. See [V2 polish notes](docs/V2_POLISH.md) for validation and limitations.

Large fleets deploy in staggered mixed battlegroups with varied organic spacing and more ordered Reaper fronts. Cinematics mix combat shots with held wide passes showing those formations. Under HADES-enabled AU rules, rounds that penetrate the hull trigger internal nuclear bursts with flashes, shock rings and delayed impact audio; coordinated battery releases still obey real range, arcs, heat and reloads.

**Strict Lore** is a separate timeline with a sourced two-second Alliance main-gun base cycle and canonical roster restrictions; other unknown numbers remain estimates. **Custom Battle → Roster → Multiverse crossover** enables UNSC, Covenant, Imperium, Chaos and Skynet fleets with ten original hulls and declared setting-weighted power conversions. AU Worlds also supplies Prothean, past-cycle and player-civilization factions with six further hulls. **O** toggles the overlay; Settings offers **Keep tactical overlay** when H hides the HUD. See [lore, cadence and crossover notes](docs/LORE_CADENCE_AND_CROSSOVERS.md).

Open **AU Worlds & Civilizations** from the main menu to choose a branch, build a fleet or found a civilization. **Overlay labels** offers Auto, individual ships or fleet names/counts in Settings and the pause menu; Auto switches to fleets at 80 living deployed ships and returns to ships below 64. Fleet HUD rows can expand with **Show ships**. See [AU Worlds and civilization notes](docs/AU_WORLDS_AND_CIVILIZATIONS.md) for persistence, politics and scope.

## One-click local GPU edition (Windows)

Download and extract this repository, then double-click **`PLAY_LOCAL_GPU.cmd`**.
Requires Git for Windows and Node.js 20.19+ on the first installation.
The launcher safely installs this Codex build in
`%LOCALAPPDATA%\\ReaperWarCodex\\source` and builds a production release
instead of running the Vite development server.

- A later launch tries a fast-forward update from `codex/apex-combat-overhaul`;
  if offline or if local source files were edited, the existing installation
  is kept. Nothing overwrites the original Reaper War or Spectator installs.
- The first start applies the **local hardware profile**: the Ultra quality
  preset (ship detail three times further out, the display's native pixel
  density, 8x antialiasing with bloom) and the simulation on its own thread.
  Any setting changed afterwards is kept; Settings has the same profile as a
  button and Ultra as a quality level. **Custom Battle** has *Double fleets*
  and *Fleets ×4* for bigger battles.
- The game runs at **http://127.0.0.1:5174/**, avoiding ports 4180 (original)
  and 5173 (spectator). A production preview server must remain open during
  play. Once installed, the battles themselves require no internet connection.
- Saves are tied to the browser origin. Export your older browser saves and
  import them if moving from the published site or a different local port.
- Close the launcher window or press Ctrl+C to stop. WebGL still requires
  browser graphics acceleration and working GPU drivers.

The renderer now retains the original detailed ship models, moving Reaper
rigs for camera subjects, weapon impacts and death effects in large battles,
but renders other repeated hulls in shared GPU batches. Under 150 ships,
the original close-up path remains in use. No FPS claim is made without
a benchmark on the actual target GPU.


## Open 3D theatres and fleet movement

Battles use an **open, three-dimensional battlespace**—not a ground plane
or a fixed arena boundary. Each environment has a reference landmark:
a planet for orbital combat, a mass relay for relay encounters, the Citadel
for station defence, or open stars for deep-space engagements.

New preset/custom deployments use separate vertical approach corridors,
in addition to authored lateral and forward/back positions. The vertical
spacing scales with the opposing fleets' original horizontal distance,
so a close duel is not turned into a long approach. Pre-authored flanking
heights remain intact. Static defence platforms remain fixed. To preserve
an old scenario's exact deployment coordinates, pass world state
`theatre_layout: 'legacy_plane'`.

**Fleet doctrine:** capitals move with the fleet anchor as a firing line;
cruisers have more room to manoeuvre; frigate and fighter screens can
pursue threats. In the Codex/Spectator engines, the main battle line
takes a deterministic shallow curved approach rather than every ship
seeking one central point. Ships retain their actual collision avoidance,
turning limits, weapon ranges, combat AI and deterministic replay rules.

The planetary and relay visuals are **navigation references**, not opaque
invisible walls, scripted weapons or gravity wells. Sector overview
distances are planning/camera guidelines, not hard gameplay boundaries;
the existing simulation-distance compression still applies to combat.

For large-scale spectacles, start opposing fleets farther apart or deploy
reinforcement wings from separated x/z approaches; this produces a transit,
closing artillery battle and later close action without shrinking or
removing ship models. Cinematic camera modes can follow any member.


## Reaper Hardcore — Annihilation (optional)

Select **Reaper Hardcore — Annihilation** under the timeline/combat-rules
selector. This is a separate, reversible gameplay preset, not a change to
Canon, Strict Lore, APEX, or other saved timeline configurations.

- A capital-class Reaper's `reaper_capital_beam` destroys a **conventional
  warship on a successful actual hit** through the existing damage/destruction
  pipeline. Misses remain misses. Smaller Reaper beams do not gain an
  automatic kill.
- Specifically hardened AU hulls (`normandy_valkyrie`,
  `alliance_super_dreadnought`, `turian_super_dreadnought`,
  `alliance_omaha`, `alliance_aegis_command`, `alliance_valkyrie`)
  retain their defences and take heavy, bounded beam damage. Unprotected
  ships such as the Destiny Ascension are not special-cased.
- Reapers prioritise dangerous firing platforms, carriers, capitals and
  actual gun damage. Their gun line keeps station, destroyer screens
  intercept nearby escape attempts, and fleet commanders stop extending
  endless pursuit for a single fleeing target. Reapers do not retreat.
- The spectator camera can observe **actual Reaper main-beam launches**
  as they occur, without scripting kills or affecting the combat RNG.
- Indoctrination is disabled within this preset.

**Open-3D battlespace:** New game setup screens default to **OPEN 3D**.
Older saved scenarios, simulation API calls and replay seed benchmarks keep
their original coordinates unless `theatre_layout: 'three_dimensional'`
is explicitly selected. The setup screen also offers **ORIGINAL** to
compare battle outcomes on their previous tactical positions. Custom
starting distances now support up to 600 km; these map options do not
change weapon ranges or ship physics.

These features have automated regression tests, but FPS and play feel
should also be checked on the actual local GPU build.
