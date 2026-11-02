# Architecture

TypeScript + Vite + Three.js, no framework. The simulation never imports Three.js and runs headless in Node (tests, balance scripts, comparison mode).

```
src/
  core/         rng (seeded), vec3, provenance tags, storage (IndexedDB/localStorage)
  data/         ship classes, weapons, factions — every stat carries a provenance tag
  timelines/    rule-set schema, presets, apply-rules (effective stats), JSON validation
  simulation/   fixed-step battle sim: battle.ts (loop), ai.ts, motion.ts, separation.ts, fireControl.ts, volleys.ts, damage.ts, formations.ts,
                results.ts, reaperIntel.ts, constants.ts (battlespace compression)
  scenarios/    scenario definitions + builders, custom battle builder, comparison runner
  rendering/    Three.js: ships/ (procedural models), environment, effects, cameras, battleView
  ui/           DOM screens (menu, briefing, HUD, results, comparison, codex, database,
                custom, timelines, settings), tactical overlay canvas, app/controller
  codex/        codex entries with canon / estimate / AU sections
  audio/        procedural Web Audio engine
tests/          vitest (determinism, damage, AU isolation, battle completion, schema)
e2e/            Playwright (startup, full battle, replay, comparison, screens)
scripts/        headless battle runner, visual QA screenshot driver
```

## Simulation

- **Fixed step** of 50 ms (`SIM_DT`). The UI accumulates real time × speed and steps with a 40 ms wall-clock budget per frame so slow machines slow down rather than hang.
- **Determinism**: all randomness flows from one `Rng` seeded by the battle config. Ships are created in config order; events are appended in step order. Same config ⇒ identical event log (tested).
- **Units**: catalogue values are in "nominal km / km·s⁻¹". `BATTLESPACE_SCALE` (0.4) multiplies every distance and speed inside the simulation so that a 2 km Reaper and a 40 km engagement range can share a camera frame. Ship lengths are not scaled. Balance is unaffected because ranges and speeds scale together.
- **Entities**: `ShipState` (hull/armour/barriers/heat/subsystems/weapons/orders), `Projectile` (swept segment–sphere collision each tick), `Missile` (homing, interceptable), beams (per-weapon burst state with damage-over-time).
- **Damage** (`damage.ts`): barriers absorb a damage-type fraction (slug 100 %, Thanix 45 %, Reaper beam 40 %, warhead 25 %, laser 0 %) until exhausted; armour then subtracts `armour × (1.2 − penetration)` (HADES rounds bypass half the armour); the remainder hits hull and can disable a subsystem. HADES reserves 35% of its existing shot budget for an internal nuclear warhead, applied only after kinetic hull penetration; this AU estimate redistributes damage rather than increasing the nominal budget.
- **AI** (`ai.ts`): fleets advance a stable formation anchor to the capital line’s weighted primary-weapon range. Ship target locks (5 s), fleet focus locks (8 s), 25% score hysteresis and reachable-target recovery replace random retargeting. Cached deployment role centres supply forward firing-line advances; individual range corrections are bounded instead of projecting every hull onto the same target sphere. Gun facing is independent of translation. Stationary lines keep their formation basis instead of rotating their slots around the enemy. Reapers only press or hold, while organic withdrawals and player orders remain supported.
- **Motion** (`motion.ts`): critically damped 3D arrival brakes lateral momentum and respects catalogue acceleration/speed, including engine damage. Hull rotation still respects class turn limits.
- **Fire control** (`fireControl.ts`, `volleys.ts`): ready HADES capital spinal batteries share a fleet salvo clock (0.6 s assembly, 0.5 s release windows). Readiness/range/arc checks precede scheduling, so stragglers cannot stall a salvo. Focus-fire off bypasses coordination. Active beams must retain a valid firing solution. Organic capital spinal guns support bounded manual releases and hold/free policies; pure diagnostics share the firing geometry and never advance RNG or salvo clocks.
- **Local clearance** (`separation.ts`): an immutable per-tick spatial snapshot predicts near collisions. Numeric cell keys and cached local neighborhoods avoid repeated global scans; separation is an acceleration request subject to class limits, never a positional teleport. Reaper avoidance projects out defensive reverse thrust.
- **Formations** (`formations.ts`): large fleets deploy mixed-role battlegroups on staggered, swept fronts. Bounded deterministic organic variation contrasts with ordered Reaper waves. Setup-time spatial clearance searches nearby lateral positions; small formations retain their existing layouts. These are spatial groups within the existing fleet command structure, not independently ordered squadrons.
- **Rules** (`timelines/rules.ts`): `applyRulesToShip` / `applyRulesToWeapon` turn a `RuleSet` into effective stats, including weapon substitution (hyper-mass accelerator, fleet-wide Thanix). Canon has every multiplier at 1, which the tests assert.

## Rendering

- `BattleView` reads simulation state each frame (interpolating between fixed steps) and reacts to events (muzzle flashes, impacts, deaths). It never writes to the simulation.
- Ship models are built once per class from procedural geometry (`rendering/ships`), merged by material into a few meshes, and cloned per instance. On death the merged parts become debris.
- Effects are pooled: instanced tracers and missiles, cylinder beams, sprite sparks, cached hull-shaped barrier shells, instanced debris, point-defence line segments.
- The tactical overlay budgets labels, target lines and inspected-ship range envelopes; `labelLayout.ts` places priority annotations without overlaps.
- The camera director uses an independent RNG and engagement weights, alternating combat pairs with bounded fleet passes over up to 12 living fleetmates. Membership is chosen at shot changes; per-frame framing reads only that bounded set. Watching never changes battle outcomes.
- The environment is generated at load time: planet textures via value-noise on a canvas, a fresnel atmosphere shader, a point-sprite starfield and a galaxy band.
- `CameraRig` smooths every mode toward a desired pose, so mode switches transition.

## UI

Plain DOM built with a tiny `el()` helper; screens are functions returning an element. The HUD keeps stable controls and updates in place (keyed ship rows), which matters for hover states and automation. A 2D canvas overlay draws tactical markers above the WebGL view.

## Decisions

- No physics engine: ship motion is kinematic with acceleration and turn-rate limits, which is sufficient for naval-scale behaviour and keeps the sim deterministic and portable.
- Hit-scan beams rather than ray-marched streams keep Reaper weapons both lethal and cheap.
- Replay = re-simulation. Because the sim is deterministic, a replay is bit-identical and costs nothing to store; the exported event log is available for external analysis.
- Comparison mode fixes fleets by default (`fleet_scaling: fixed`) so only technology/doctrine differ between the two runs.
