# Deferred brief: Extreme Scale engine upgrade

Owner request, 3 November 2026. This is a later engineering project, separate from the current AU/civilization release. It is not implemented or advertised as supported by the present engine.

## Scenario: Harbinger's Total Offensive

Immediately after the Alpha Relay explosion at Bahak, Harbinger simulates potential Reaper defeat and concentrates the remaining invasion fleet in a rapid conventional offensive. Military forces, shipyards, orbital defences and command infrastructure take priority; planetary harvesting is postponed until organised resistance is disabled. This is an explicitly alternate-universe scenario.

Reaper force: 7,500 capital Reapers **including Harbinger**, 30,000 destroyers and 15,000 distinct harvesting/support vessels: 52,500 vessels. Support vessels require their own data and behavior; they must not be substituted with capitals or destroyers.

Opposition: up to 22,600 coalition warships, 18,000 HADES batteries and 300,000 automated combat craft. The 75,100-vessel benchmark is the sum of major Reaper/coalition vessels. Automated craft raise the vessel count to 375,100; including fixed batteries gives up to 393,100 combat entities. Report these categories separately.

## Preserve

Extend the existing TypeScript/Vite/Three.js application, fixed-step simulation, tests and performance scripts. Preserve combat rules, APEX presets, acceleration/braking, determinism, campaigns, graphics, faction advantages, HADES ammunition, hyper-mass accelerators, Reaper weapons, shields and doctrines. Never remove ships to improve FPS, distort damage to hide load, hardcode an APEX victory or replace the project wholesale. Reapers must be able to win.

## Staged engineering requirements

1. Profile the current Node and Chromium implementations before changing architecture. Extend `scripts/perf.mjs` and the existing deterministic benchmarks.
2. Introduce a simulation Web Worker with transferable bounded snapshots and explicit ordering/backpressure. Physical simulation time remains independent of rendering FPS.
3. Add spatial partitioning for targeting, range queries, projectile collision and separation, plus persistent squadrons and theatre-level commands.
4. Implement one continuous, sector-managed battle. Distant formations may use calibrated squadron/sector resolution; active sectors use ship-level detail. Preserve every vessel identity and loss and avoid double-resolving engagements at sector boundaries.
5. Make adaptive update schedules deterministic within the mode. Camera movement, machine speed and visual LOD must not become gameplay inputs. Time and weapon energy are not arbitrary performance knobs.
6. Add GPU instanced hulls, multi-level LOD, distant fleet visualization and scalable beam/projectile/missile/shield/explosion budgets. Provide a dedicated Extreme Scale preset that can use capable local hardware while retaining a usable fallback.
7. Persist bounded/indexed event logs, complete battle results, saves and replay configuration. Document aggregate-model approximation explicitly rather than claiming identical detailed event histories without proof.
8. Add the scenario and accessible fleet/theatre commands only after stability and accuracy gates pass. Improve cinematic graphics afterward.

## Calibration and verification

Use identical configurations and seeds when comparing full-detail and multi-scale runs. Measure changes in losses, shield/hull damage, weapon cycles, ammunition, engagement timing and faction outcomes, as well as repeatability within each mode. Define acceptance tolerances from measured evidence before relying on aggregate combat.

Run staged 1,000 / 5,000 / 10,000 / 25,000 / 75,100 major-vessel benchmarks in headless Node and Chromium. Also measure the added craft and battery populations. Record simulation milliseconds per tick, render FPS, memory/heap/GPU resources where available, targeting cost, collision cost and event-log growth. Validate every stage before increasing scale.

Use the strongest available coding/reasoning tools, including Fable or Ultracode if they are actually available in the future session. Their names do not imply current access or replace profiling and correctness checks.

Deliver a working Extreme Scale mode, its scenario, reproducible benchmark artifacts, regression tests and an interface for commanding and watching the continuous battle. Do not claim target scale from a theoretical estimate or from a run that omitted the requested vessel classes.
