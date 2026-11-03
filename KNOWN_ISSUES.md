# Known issues and limitations

## Visual

- Reaper and Alliance capitals have a silhouette/detail pass, with catalogue-consistent Reaper scale, but remain original procedural fan models. Other faction families have not received the same new pass; no exact screen-model match is claimed.
- Halo/40k crossover hulls are original stand-ins on a declared AU scale. Prothean/past-cycle frames and Skynet orbital warships are explicitly invented AU designs; no recovered canonical ship plans are claimed. Their shared shield/weapon physics is an abstraction; Infinity/CAS embarked wings, boarding and warp effects are not represented. Crossover fleets are battle-builder options, not ordinary campaign factions.
- All organic hulls have limited surface detail (panel strips, turrets); no textures, only materials. Asari fleets have no frigates; the Citadel's wards are simplified boxes.
- Fighters are rendered at 2× scale for visibility.
- Earth is at compressed scale; cloud layer is baked into the surface texture (no separate cloud sphere).
- Manual fire commands are deterministic under identical command schedules, but the existing replay feature reruns the initial battle configuration and does not record/reapply interactive order history.
- Beam cylinders are flat-shaded; very close to the camera they look like ribbons.
- Level of detail hides detail meshes and glow sprites by distance and draws far ships as points; there are no intermediate simplified hull meshes, so mid-range ships still cost two draw calls each (about 590 draw calls for a 206-ship Final Battle in the tactical view).

## Simulation

- Torpedo magazines are finite (8 per tube, 2 per fighter) and fighters rearm alongside their carrier, but carriers themselves never run out of torpedoes to issue; mass accelerator rounds are treated as unlimited (canon describes very large slug magazines).
- Fighters under canon rules still die quickly to Reaper point defence; the new burst recovery helps only marginally.
- Fleets retain one anchor with role layers and local clearance; independent persistent squadrons are not modelled.
- Point defence will scorch nearby hulls with GARDIAN lasers when no small targets exist (low priority, low damage).
- No automatic fleet-wide withdrawal. Damaged organics can recover behind the line; only explicit organic Retreat orders escape. Reapers ignore Retreat/Withdraw and fight until destroyed.
- Standoff recovery is bounded to prevent endless kiting; a deliberately closing enemy can compress the range. Hull motion is kinematic, without physical collision response or obstacle navigation.
- Omaha was absent from the input project: its new hull and numerical specifications are explicitly AU simulation estimates, selectable in Custom Battle, not established canon.
- Reference canon/APEX outcome regressions are retained, but the tactics changes alter casualties and timing. No comprehensive balance guarantee exists for every custom fleet, seed or campaign state.
- Sixteen new AU/crossover hulls extend the roster, but their shared damage/barrier model is not a universal physical equivalence. Skynet has no energy shields, time travel, autonomous factory reproduction or self-repair.
- Fleet labels reduce annotation/HUD work; they do not replace ship-level physics with aggregate combat. Workers, persistent squadrons, instanced hulls and Extreme Scale remain future work described in `docs/EXTREME_SCALE_BRIEF.md`.
- Strict Lore uses a sourced Alliance main-gun base cycle and excludes AU-only hulls/refits. Unknown movement/range/weapon figures and Reaper emitter counts remain estimates; the mode does not assert exact canon for every statistic.

## Campaign

- Ground war, research, refugees and politics are abstract tracks (0–1 values and event triggers); there is no ground battle simulation. Diplomacy is a three-option Council summit every twelve weeks, not bilateral negotiation. Production is a point pool per faction.
- The Terminus mercenary fleet event uses Alliance-pattern hulls (no Terminus hull family yet) and is labelled an estimate in the log.
- Engagements cap each side at 70 ships by scaling counts; losses are scaled back proportionally.
- Autosave each week plus named slots (Saved Games screen); slots are browser-local unless exported from Settings.
- Post-war (Cerberus Ascendant) reconstruction is an abstract metric model: budget programmes move eleven 0–1 indicators and a fleet-point total. There are no post-war battles, named characters or map; the Terminus and Council are events, not actors.

## AU civilizations

- The player-civilization layer has finite resources, monthly politics, research, ship construction and persistent combat losses, but no generated galaxy, territory conquest, AI diplomatic states or full Stellaris-style economy. Its initial roster is a cruiser and a dreadnought; generated past cycles reuse two estimated frames with seeded identity/technology rather than generating new geometry.
- The strategic fleet is bounded to 256 ships. Civilization records retain the latest 50 entries; the screen shows the latest 12. This record is separate from battle event logs.
- Pending deployments lock strategic mutations. A reload can restart the saved initial engagement with the same seed, not resume an exact mid-battle state. Cancelling a deployment restores strategic access without applying an unfinished result. Imported civilization JSON carries the strategic record but may need a pending deployment cancelled if its launch configuration is absent.
- Grounded AU parameters are authored estimates, not a guarantee that every fleet/seed is balanced. Explicit HFY branches intentionally exceed the normal Reaper challenge.

## UI / platform

- Touch: one-finger drag orbits, two-finger pinch zooms and pans. On phones the fleet and target panels sit behind a Panels toggle as half-height bottom sheets; the galaxy map canvas keeps its 1200×760 aspect and is small on narrow screens.
- Audio needs a first click (browser policy); it is synthesised and intentionally restrained.
- Headless/software-GL renders at low frame rates; the simulation step budget (40 ms per frame) keeps it responsive but slows simulated time.
- Loading a slot makes it the autosave; the previous autosave is overwritten on the next turn.
