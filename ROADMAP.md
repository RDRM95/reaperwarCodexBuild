# Roadmap

Phases follow the project brief. ✅ done · 🔶 partial · ⬜ not started.

| Phase | Scope | Status |
| --- | --- | --- |
| 1 | Technical foundation, deterministic sim, working 3D Battle of Earth | ✅ |
| 2 | Improved ship models, weapons, effects, audio | ✅ eight hull families, Reaper hood plating and iris, Alliance detail pass, effects, procedural audio; further detail passes remain polish |
| 3 | Additional factions and ship classes (Turian, Asari, Salarian, Quarian, Geth, Cerberus) | ✅ all six factions have original hull families, scenarios, campaign fleets and custom-battle support |
| 4 | Custom battle editor | ✅ (sixteen factions, united fleets, reinforcement wave, formations, timeline, battlefield) |
| 5 | AU rule engine | ✅ (18 tech multipliers, special tech, strategic variables, validated import/export, editor) |
| 6 | Canon vs AU comparison mode | ✅ |
| 7 | Galactic campaign map | 🔶 interactive map, 15 systems, relays, fleets, system intel, orders |
| 8 | Strategic warfare simulation (ticks, production, losses, Crucible, indoctrination) | ✅ weekly ticks, Reaper AI, harvest, ground war, production, research projects, refugee pressure, political events, reinforcements, Crucible, morale, indoctrination, Council war summits with decisions, Cerberus Ascendant post-war reconstruction (2186–2206) |
| 9 | Codex and intelligence systems | ✅ codex, fleet database, Reaper intelligence panel |
| 10 | Additional timelines and scenarios (Palaven, Thessia, Rannoch, Citadel, Final Battle of Earth, Cerberus Intervention, Prime/Apex Palaven) | ✅ all listed scenarios; Final Battle of Earth takes the surviving fleets from a saved campaign |
| 11 | Campaign progression and strategic AI | 🔶 Reaper target selection with competence, allied reinforcement AI, final push on the Citadel |
| 12 | Advanced cinematics, optimisation, polish | 🔶 cinematic director, distance LOD with a shared far-point cloud, draw-call counter; instanced hull meshes and simplified mid-range hulls pending |

## Shipped V2 slice — 0.12.0

Scoped spinal volley commands and real readiness feedback; predictive local fleet clearance; bounded tactical annotations; Watch Battle mode and calmer cinematic framing; Alliance/Reaper capital silhouette and scale fixes; hull-shaped impact barriers and effect cleanup. Validation and remaining V2 work are recorded in [V2 polish notes](docs/V2_POLISH.md).

## Next recommended tasks

1. **Campaign depth**: bilateral negotiation with individual governments, krogan and quarian political chains, Cerberus coup events.
2. **Performance**: simplified mid-range hull meshes, instanced rendering for identical hulls, aggregate distant formations.
3. **Touch**: a dedicated phone campaign map (zoomable canvas), larger hit targets.
4. **Model polish**: procedural normal maps for plating, geth and quarian detail passes.

## Current additions — 0.14.0

AU Worlds groups grounded human branches, historical alternatives, HFY and crossover battles. A compact player/past-cycle civilization layer supplies persistent politics, resources, technology and real fleet inventories. Strict Lore, faction-specific timeline controls, sixteen new hulls, fitting ship names and fleet-level HUD/overlay summaries are included. See [AU Worlds](docs/AU_WORLDS_AND_CIVILIZATIONS.md) and [lore/crossover notes](docs/LORE_CADENCE_AND_CROSSOVERS.md) for scope and limits.

## Pinned for later (owner's list, not scheduled)

The requested local-hardware **Extreme Scale** mode and **Harbinger's Total Offensive** are deferred until after the current AU/civilization release. Full requirements, force accounting and staged correctness/performance gates are saved in [the Extreme Scale brief](docs/EXTREME_SCALE_BRIEF.md). Current labels/LOD are not an implementation of that multi-scale engine.

Priority order agreed on 1 Nov 2026: finish and ship the V2 build first, then additions.

1. **Collector ships** (ME2 Collector cruiser as an optional earlier-campaign opponent; original model).
2. **First Contact War scenarios** (2157 Relay 314 incident: Alliance patrol vs Hierarchy, Shanxi; canon-anchored, pre-Reaper technology).
3. **Non-eezo timelines**: 🔶 non-eezo FTL branch and real independent campaign routes added. A complete eezo-free combat technology tree remains future work.
4. **Multiverse ship battles**: 🔶 separate AU roster now includes Halo, Warhammer and Skynet stand-ins. More hulls, embarked carrier wings and setting-specific mechanics remain future work.
