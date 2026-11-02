# APEX combat overhaul — 2026-11-01

Historical notes for the first combat fix. Subsequent 0.12 releases add live fleet controls, local clearance, capital silhouettes, hull-shaped effects, HADES internal nuclear payloads and swept battlegroups. The later payload and formation changes supersede the corresponding historical descriptions below; see [V2 polish notes](V2_POLISH.md).

The supplied archive is the implementation baseline. The configured Git remote was empty when work began; the source was imported into `/workspace/reaperwarCodexBuild` without replacing user work. The updated project is delivered on `codex/apex-combat-overhaul`; no existing `main` branch was modified. Existing scenarios, campaign/save formats, timeline multipliers, weapon damage and default canon fleets are preserved.

## Reproduced causes

- `fleetEngagementRange` started at an unscaled 20, exceeding a normal dreadnought’s actual simulation range of 16.8. Doctrine/aggression then applied a second range compression; different classes followed the same longest-range fleet anchor.
- Harmless stationary-target experiments put Alliance/Cerberus dreadnoughts at approximately 55%/44% of primary range. Omaha was absent from the input archive entirely.
- Fighter goals explicitly orbited with time; frigates alternated between harassment and formation stations. Fleet heading continuously rotated those stations. These moving goals and randomized target switching created competing steering/aim commands.
- Arrival used a fixed hull-size radius rather than available acceleration and lateral momentum. A damaged dreadnought was still 3.67 simulation km from its held station after 180 seconds.
- A Reaper accepted Retreat, moved 15.86 simulation km, escaped, and fired zero shots in a 100-second reproduction.
- A 368-ship custom battle generated zero shots and zero kills in 120 simulated seconds. Large lines/wedges grew hundreds of simulation kilometres across, beyond all weapons.

## Changes

`ai.ts` now owns tactical intent; `motion.ts` owns acceleration-limited translation; existing heading control owns hull rotation; `volleys.ts` owns HADES release timing. No controller adds a time-driven circular waypoint.

- Engagement bands derive from each ship’s available principal battery. Dreadnoughts prefer 84% of spinal range, cruisers 76%, frigates 72%, carriers 90%, and Reaper capitals/destroyers 68%/64%. All distances use the existing compression consistently. Spent torpedoes no longer hold a craft outside its remaining guns’ range, including fighters whose only remaining cannon is classified anti-small.
- Fleet anchors approach the weighted capital/core line range, then hold. Their basis freezes on station. Short-range screens have sufficient forward reach to fire alongside the capital line, and Reapers use full formation speed against receding targets.
- Ship target commitment lasts five seconds; fleet focus commitment lasts eight. Challengers generally need a 25% score advantage. Death, escape, invalid targets, explicit player commands, and a reachable replacement for a remote target break commitment appropriately.
- Capital firing offsets persist inside a range band. Organic standoff recovery is bounded behind the formation station; it cannot become unlimited defensive kiting. Reapers never reverse toward a station behind the enemy: they brake, rotate and continue fighting. Initial and issued Retreat/Withdraw commands are normalized to Attack for Reapers, damaged-ship withdrawal is forbidden, and escape checks exclude them.
- Translation is critically damped in three dimensions, using actual class acceleration and speed limits. Engine damage does not instantly delete momentum. Hull rotation and firing arcs retain their class limits. Active beams stop when their firing solution is lost; cached enemy lists cannot make later weapons target a ship killed earlier in the same tick.
- Focused HADES spinal batteries share 0.6-second assembly and 0.5-second release windows, with subsequent cycles based on weapon cooldown. Dead, overheated, unaligned and out-of-range guns cannot hold up the battery. Explicit ship targets take precedence; focus-fire off bypasses synchronization. No new nuclear-damage rules were invented.
- Large tiers split into compact ranks/layers with deterministic spatial clearance. A 100-capital formation now spans at most 32.5 simulation km on an axis, versus up to 469.7 previously. Existing small layouts are preserved.
- `alliance_omaha` adds the requested SSV Omaha as an explicitly AU spinal super-dreadnought: a distinct narrow 8-degree, long-range cannon, heavy hull and slow manoeuvring, plus broadside/PD screens. Its cannon survives APEX substitutions. Its 1.8 km hull and numerical statistics are labelled AU simulation estimates, not supplied lore facts. It is available in Custom Battle and is not inserted into canon scenario fleets.

## Validation

- Original baseline: **87/87 unit tests passed**, demonstrating why new behavioural regressions were necessary.
- Updated source: **132/132 unit tests passed**, including existing deterministic replays, canon/APEX outcomes, campaign, save, damage, ammunition, fighter and timeline checks.
- Added 45 tests: Reaper initial/issued non-retreat, Alliance/Cerberus/Omaha long-range spinal firing, settled position/path length, off-axis formation cohesion, target commitment and reachable recovery, damaged-engine arrival, 120-ship sustained combat with real losses, large-formation clearance, HADES synchronization, acceleration limits, beam solution loss and same-tick dead-target exclusion.
- Production build/typecheck passed. Browser suite: **8/8 passed**, including complete battle controls, replay, canon/AU comparison, campaign combat, persistence, postwar and database/custom screens. System Chromium uses software WebGL; `CHROMIUM_EXECUTABLE_PATH` is optional and normal CI keeps its bundled browser.
- Rendered the real 60-ship Alliance/Omaha/Cerberus versus Reaper battle at 20, 50 and 90 seconds, inspected screenshots and collected live shots/kills/escape telemetry. No browser runtime errors. This is visual evidence, not a claim of hardware-GPU frame rate.

Run from the project root:

```bash
npm ci
npm test
npm run build
CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium npm run test:e2e
node --import tsx/esm scripts/combat-benchmark.ts
# With a preview server running:
CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium node --import tsx/esm scripts/combat-visual.mjs
```

Isolated Node 24, seed 42 simulation benchmark on this cloud machine:

| Ships | Simulated time | Mean tick | Worst tick | Shots per successive 30 s window | Ships destroyed |
| --- | --- | --- | --- | --- | --- |
| 92 | 82.55 s | 0.718 ms | 5.725 ms | 1933, 5682, 3045 | 59 |
| 368 | 120.05 s | 3.899 ms | 28.277 ms | 6848, 21928, 19489, 7685 | 216 |

The 92-ship battle ended by destruction before 90 seconds; the 368-ship battle remained active through its 120-second limit. The last bucket folds the fixed-step boundary at 120.05 seconds into the final window. These are single-run measurements, not statistical latency guarantees.

Benchmark measurements and captured evidence accompany the delivery. Performance tests run separately from browser/unit workloads; they measure simulation ticks, not rendering FPS. The benchmark prints mean/worst step cost, successive shot windows and actual losses rather than merely reporting a running process.

## Limits and intentional tradeoffs

- Ships use kinematic thrusters with estimated class limits, not a gravitational or rigid-body physics engine. There is no collision-response/obstacle-navigation solver. Formation clearance is assigned at deployment or formation changes.
- One anchor and role firing layers per fleet remain; persistent autonomous squadrons are not implemented. Fighters now use stable attack stations and carrier rearming instead of artificial perpetual orbits.
- A faster closing enemy can compress a dreadnought’s preferred range. Bounded repositioning intentionally cannot guarantee permanent standoff against deliberate pursuit. Explicit organic retreat remains supported but can be intercepted and destroyed.
- Casualties and battle durations change with corrected tactics. Existing reference outcomes pass; no exhaustive balance guarantee is made for every custom fleet, seed or campaign state. Omaha specifications may need adjustment if a separate authoritative AU specification is supplied.
- Existing render/effect caps, distant LOD and tactical label crowding remain. Software WebGL is slower than a hardware GPU; simulation timing is not an FPS claim.
- The environment draft stores install/start instructions and the corrected repository mount. Publishing is a separate user action; restoration in a new task has not been independently tested.
