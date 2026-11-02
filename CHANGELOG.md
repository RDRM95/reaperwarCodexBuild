# Changelog

## 0.12.0 — Fleet command and cinematic polish

- Added scoped Hold/Resume spinal fire and Release Volley commands. Organic dreadnoughts fire one ready salvo; heat, ammunition, arcs and cooldowns still apply, and escorts/PD keep defending. Reapers remain relentless.
- Added live battery readiness, reload/aim/range reasons, movement state and nominal-distance readouts. Tactical annotations use priority-based non-overlapping labels, at most eight target lines, and range envelopes for one inspected ship.
- Fixed ships converging onto the same firing station with deterministic local predictive clearance. Thrust and braking limits remain authoritative; nearby ships take clear passing lanes rather than merging or orbiting.
- Added Watch Battle mode with an uncluttered cinematic view. The director weights actual engagements, holds shots rather than cutting on every gun flash, frames stacked duels, and retains capital wreck shots instead of immediately abandoning them.
- Rebuilt Alliance dreadnought/cruiser silhouettes and Omaha's unique heavy spinal hull. Refined Reaper proportions, six-arm capitals/four-leg destroyers, blue-black plating, and Harbinger-only amber illumination. Reaper render lengths now agree with existing catalogue/physics dimensions.
- Replaced spherical barrier flashes with cached hull-shaped impact ripples and collapse pulses, including continuous beam hits. Effect materials and pooled geometry clean up on battle disposal; debris fade no longer changes every fragment's shared material.
- Added simulation, camera, geometry, overlay and browser regressions. Existing timeline, campaign and weapon-damage rules remain unchanged. See `docs/V2_POLISH.md` for validation and remaining limits.

## Unreleased — Disciplined fleet combat (2026-11-01)

- Replaced moving orbit/harassment goals with stable firing stations, class-specific primary-weapon engagement bands, and acceleration-limited, critically damped arrival. Existing hull acceleration, speed, turn limits and firing arcs remain authoritative.
- Fixed the unscaled fleet-range floor, over-compressed dreadnought ranges, rotating formation pursuit, random retargeting, and short-range screens stranded behind the capital line. Fleet and ship target locks use score hysteresis and can recover from unreachable targets.
- Reapers reject initial and issued Retreat/Withdraw orders, never escape or make damaged-ship withdrawals, and press receding targets without defensive kiting. Organic player retreat commands remain supported.
- HADES spinal batteries coordinate bounded fleet salvo windows and concentrate on reachable fleet focus targets. Unready guns never stall the fleet; focus-fire off restores independent fire. Damage and timeline modifiers are unchanged.
- Active beams respect current range/arcs; weapons no longer select targets killed earlier in the same tick.
- Large formations use compact ranks/layers with hull clearance instead of unbounded lines/wedges; existing small layouts are preserved.
- Added SSV Omaha, absent from the supplied source, as an explicitly AU spinal-cannon super-dreadnought with estimated specifications and an enlarged Alliance hull. Its unique cannon retains its identity under APEX substitutions. No default canon fleet or preset was changed.
- Added deterministic combat, motion, formation, salvo and live-firing regressions, plus a reproducible large-battle benchmark. See `docs/COMBAT_OVERHAUL.md` for evidence and limitations.

## 0.11.3 — Camera and recording (hotfix)

- Cinematic director lingers 11–18 s per shot (7 s on a capital death) and cuts away less often.
- Orbit pitch is unlimited above and below the plane; the follow camera is a free orbit around the followed ship (drag to circle it, wheel to change chase distance).
- H cycles the HUD: full → minimal (top bar) → none, the last a clean frame for recordings (cursor hidden).

## 0.11.2 — Nobody runs (hotfix)

- Removed the fleet-wide auto-retreat at 12 % strength and the automatic escape of damaged ships, which made fleets turn away mid-battle and stop fighting. A battered ship now makes a tactical withdrawal: it falls back to a weaving station behind its fleet with its guns still bearing, and re-engages once its barriers recover. Only an explicit Retreat order leaves the battlespace. Battles run to destruction or the time limit.

## 0.11.1 — United fleets and no hull caps (hotfix)

- Custom battle: any number of fleets per side, each with its own faction, formation, name and arrival time ("united fleets"); a Sword Fleet at Earth preset; no hull caps (a performance note appears above 150 hulls on a side).
- Fixed: side B reinforcements spawned Reapers whenever the roster was left over from a Reaper setup; reinforcements now have their own faction picker and a fleet never spawns hulls of another faction.
- The Citadel is selectable as a custom battlefield.

## 0.11.0 — Touch layout and Council hull detail

- Two-finger drag pans the battle camera (with pinch zoom); phone-width layout: the HUD top bar wraps, the fleet and target panels become bottom sheets behind a Panels toggle, screens and the campaign map collapse to one column.
- Turian dreadnought and cruiser: broadside turrets with barrels, GARDIAN blisters, dorsal ridge plates, flank ribs. Asari dreadnought and cruiser: flank viewport rows, accent collars, ventral sensor domes.

## 0.10.0 — War summits and 2183 world states

- Council war summits every twelve weeks while the Citadel holds: interactive campaigns pause for a decision (demand fleet commitments, pool Crucible resources, prioritise refugees) with twelve-week effects; AI-run campaigns press for fleets.
- Rachni queen world state (spared: rachni workers speed the Crucible by 8 %) and Council composition from the Destiny Ascension outcome (old Council: Council races cooperate more; human-led Council: Alliance production +10 %, others −5 % cooperation).
- Campaign setup exposes both choices; tests cover summit timing, decisions and the new world states (83 unit tests).

## 0.9.0 — Level of detail and model detail pass

- Distance-based level of detail: close ships render fully; at range windows, accents, lights and engine glow sprites are dropped; far ships (and fighters beyond 90 units) collapse into one shared point cloud. Toggle in Settings. Final Battle of Earth (206 ships): draw calls fall from about 1,500 to about 590 in the tactical view (`scripts/perf.mjs`).
- Reaper hood plating (three overlapping forward shells), an aperture iris and a larger eye glow; Alliance cruiser broadside barrels and flank panel lines; dreadnought bow panel lines and GARDIAN blisters.
- HUD clock shows the frame's draw-call count.
- Tests: LOD policy (81 unit tests).

## 0.8.0 — Saved games and touch zoom

- Saved Games screen: autosaves for the campaign and the post-war plan plus named slots with rename and delete; "Save slot…" from the campaign and post-war screens; slots are included in the Settings export/import.
- Two-finger pinch zoom in the battle view (touch), with pointer-cancel handling.
- Tests: slot save/list/rename/load/delete, overwrite, export round trip; end-to-end slot save and load (77 unit tests).

## 0.7.0 — Finite ammunition and heat-limited point defence

- Disruptor torpedo tubes carry a magazine (8 rounds per tube on frigates and cruisers, 2 per fighter). Empty batteries stop firing and raise an "ammunition depleted" event.
- Fighters that spend their torpedoes fly back to their carrier, reload during 12 seconds of hangar time and relaunch; a lost carrier leaves them fighting on with guns.
- GARDIAN lasers and Reaper anti-fighter emitters fire in heat-limited bursts (10 and 14 shots) followed by a recovery pause, on top of ship-wide heat.
- Battle HUD shows torpedoes remaining, rearming status and point-defence readiness for the selected ship.
- Tests: magazines, depletion events, fighter rearming, burst recovery, determinism (74 unit tests).

## 0.6.0 — Campaign depth

- Ground war: every system tracks ground forces that slow the population harvest (not orbital bombardment of industry), attrit under occupation at a rate scaled by Reaper competence, and recover when safe; liberation clears more Reaper presence where the ground is still held. The genophage cure sends krogan clans to Earth and Palaven (reinforced ground forces); sabotage keeps the Salarian First Fleet instead.
- Research: eight projects (Reaper armour analysis, barrier overcharge, predictive targeting VI, GARDIAN upgrade, ground defence doctrine, indoctrination screening, Crucible schematics, Thanix refit) funded by intact allied industry (Sur'Kesh counts double); completed projects apply as technology overrides to allied fleets in campaign engagements. Player-selected, auto-queued otherwise.
- Refugee pressure on the Citadel: grows with population loss, erodes Council cooperation and Crucible pace, triggers a refugee crisis.
- Political events: Council war summits, indoctrinated officials exposed, shipyard sabotage, Aria's Terminus fleet (estimate), STG intercepts degrading Reaper coordination.
- Campaign UI: refugee gauge, research panel, ground forces per system. Old saves are migrated on load.
- Tests: ground war, research technology in engagements, refugees and events, save migration (69 unit tests).

## 0.5.0 — Salarian Union

- Salarian Union hull family (original models): Union dreadnought, Union cruiser with a four-interceptor bay, STG stealth frigate (lowest signature of any organic hull), Union interceptor; three new weapons; pale green palette and lighting.
- Defence of Sur'Kesh scenario (labelled simulation estimate) with an STG early-warning option, and a Sur'Kesh orbit environment.
- Campaign: Salarian Third Fleet at the Annos Basin; the genophage world state decides whether the First Fleet joins (cure sabotaged) or the Union keeps its fleets at home (cooperation capped). Salarian production and orbital defence classes. Final Battle of Earth gains the same world-state option.
- Custom battles and the fleet database include salarian fleets; codex entry for the Union.
- Tests: hull family and provenance, Sur'Kesh under canon and Prime/Apex, salarian custom battles, genophage world state (65 unit tests).

## 0.4.0 — Post-war reconstruction and the Final Battle of Earth

- Cerberus Ascendant post-war mode (2186–2206, alternate continuity): quarterly turns, twelve budget programmes, eleven tracked metrics, progressive Reaper dismantlement gated by conventional strength and Sol defence, Council and Alliance political events, victory/defeat outcomes, autosave and Load Game. Reachable from campaign setup or after a Cerberus Ascendant campaign victory.
- Final Battle of Earth scenario: Harbinger-led assault on Sol; when a campaign save exists its surviving allied fleets and remaining Reaper strength are used as the order of battle (world state `forces`).
- Post-war balance: a fleet-first plan completes the dismantlement around 2204–2205; an unfocused plan scrapes a late result or fails; a research-heavy plan fails on Council relations.
- Tests: post-war determinism, dismantlement gating, fleet-first victory; Final Battle campaign linkage; end-to-end post-war screen.

## 0.3.0 — Galactic campaign (first build)

- Galaxy map with 15 systems and relay corridors; weekly campaign ticks.
- Reaper strategic AI (target value, competence, risk), allied reinforcement AI, fleet preservation, final push on the Citadel once the Crucible is complete.
- Harvest, occupation, liberation, production from intact industry, Reaper reinforcements, Crucible construction, indoctrination pressure, morale, cooperation constraints on non-Alliance fleets.
- Engagements expand into the battle simulation (with orbital defence groups) and can be fought in 3D or auto-resolved; results feed losses, retreats and control back into the war.
- Campaign setup with timeline and player-dependent world state; autosave; Load Game.
- Campaign tests and end-to-end tests.

## 0.2.0 — Council factions and Cerberus

- Turian Hierarchy, Asari Republics and Cerberus hull families (original procedural models), weapons and ship classes with provenance tags.
- Scenarios: Defence of Palaven (optional Alliance detachment), Fall of Thessia (Destiny Ascension player-dependent), Cerberus Intervention (hostile under canon, cooperative where the Illusive Man is unindoctrinated), Prime/Apex Palaven Defence.
- Custom battle builder accepts any of Alliance, Turian, Asari, Cerberus or Reaper fleets on either side.
- Reaper aperture glow; camera-relative fill light so hulls stay readable against the sun.
- Beam bursts now count toward hit statistics.
- Geth and Quarian hull families (dreadnought with fighter wing, cruiser, frigate, fighter; liveship, Heavy Fleet warship, Patrol cruiser, fighter).
- Rannoch Campaign with player-dependent outcomes (Reaper-upgraded geth via per-fleet technology overrides, baseline geth, or peace against the Reapers) and Battle of the Citadel (2183) with a procedural Citadel and Serpent Nebula environment.
- Codex entries for the new factions, the Destiny Ascension and the 2183 battle; 45 unit tests.

## 0.1.0 — Vertical slice: Battle of Earth

- Deterministic fixed-step battle simulation with event log and replay.
- Ship and weapon catalogue with provenance tags (canon confirmed / inferred / estimate / AU).
- Damage model: kinetic barriers by damage type, armour with penetration and ablation, hull, subsystems, heat.
- Weapons: mass accelerators (projectiles), Thanix streams, Reaper beams, GARDIAN, disruptor torpedoes with interception.
- Fleet AI with faction doctrines, six formations, player orders and target priorities.
- Three.js renderer: original procedural Alliance and Reaper models, orbital environments, effects, seven camera modes.
- Mass Effect-inspired UI: menu, briefing with world-state choices, battle HUD, results with destruction log, pause menu.
- Timeline rule engine with eight presets, editor, validated JSON import/export.
- Canon vs AU comparison mode with explanation of impactful modifiers.
- Reaper intelligence assessment, codex, fleet database, custom battle builder, settings, local save/export/import.
- Procedural Web Audio sound design.
- Vitest unit/regression suite (41 tests) and Playwright end-to-end suite; GitHub Actions CI and GitHub Pages deployment workflows.
