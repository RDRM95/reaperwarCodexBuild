# V2 command and cinematic polish — 0.12.0

This release focuses on fleet command/feedback and the visual concerns raised during play: ship likeness, placement, coherent organic movement, watchable battles, effects, and running-game bugs. It extends the previous combat overhaul rather than changing timeline damage multipliers or introducing a new AU continuity.

## Player-facing changes

- **Spinal fire controls:** choose all commanded fleets or one organic fleet, hold/resume its dreadnought spinal batteries, and release a ready volley. Each eligible mount can fire once during a 0.5-second window; cooldown, heat, ammo, live target, range and bow arc still apply. PD and escorts stay active. Reaper fire cannot be held through these controls.
- **Truthful feedback:** the selected capital shows actual battery readiness or its blocking reason, reload time, target distance and engagement band. The status is observational and shares the firing geometry. Fleet controls show mixed/held/free mode and ready-mount counts. Distances and speed use the same nominal units as the database.
- **Less tactical clutter:** labels are placed by priority with screen-space collision checks. Tactical view has a 60-annotation budget, Command 90, at most eight selected target lines, and range envelopes for one inspected ship. Every ship retains its marker. Clean HUD removes annotations.
- **Watch Battle:** one button selects the cinematic director and minimal HUD, retaining accessible controls; Return to Command restores the tactical view. Watching does not change time, speed, pause, target decisions or battle RNG.
- **Calmer cinematics:** actual engagements are weighted for framing, using a separate RNG. Gun flashes no longer repeatedly interrupt every shot. Capital deaths get a held wreck shot, and vertically stacked duels stay within frame.
- **Capital silhouettes:** Alliance capitals now have long accelerator keels, forward stepped bridges, armoured slab sponsons and distinct sterns. Omaha is a purpose-built heavy spinal hull with six engines, not an enlarged ordinary model. Reapers have more slender ridged bodies, swept arms/four-legged destroyers, blue-black graphite surfaces and crimson lights; Harbinger alone has amber eye/seams. These are original procedural fan designs, not exact game-asset replicas.
- **Correct Reaper scale:** actual model bounds/muzzles/glows now match the existing catalogue: 2,000 m capitals, 160 m destroyers, 2,400 m Harbinger. Harbinger remains an existing simulation estimate. Gameplay hull dimensions and weapon statistics did not change.
- **Hull-shaped barriers:** actual impacts and collapse events generate short hull-following Fresnel/ripple flashes. Beam strikes refresh at bounded intervals. Geometry is cached per class, one active shell per affected ship and at most 40 shells; pooled meshes/materials clean up between battles.

## Movement problem reproduced and fixed

Compact formations started with safe spacing but their role firing offsets could converge onto nearly identical goal positions. In a harmless 120-ship mixed-fleet trace, the original controller developed 42 overlapping friendly pairs around 40 seconds, with 41 persisting through 120 seconds. One cruiser pair's centre distance was only 4.95% of its combined collision radii.

A per-tick immutable spatial snapshot now predicts near collisions and requests local clearance thrust. It does not teleport ships or override acceleration/braking limits. Collinear arrivals take stable passing lanes; Reaper clearance projects out defensive reverse thrust. Isolated ships keep their calm stations, without time-driven weaving or orbits. Numeric cell keys and cached neighborhoods bound repeated lookup work.

The matching trace had zero persistent overlaps at 120 seconds; one transient near-overlap at 80 seconds resolved. The formerly merged pair settled with 1.45 times combined-radius clearance. Sustained fire remained active (22,203 shots by 120 seconds in that harmless controller experiment). This is a targeted reproducible improvement, not a proof that every crowded battle is collision-free.

## Validation

- Unit suite: 164 tests across 20 files, including existing campaign/canon/APEX outcomes, deterministic simulations and all new movement, manual-command, label, model, barrier and camera checks.
- Browser suite: 13 checks passed, including the new fire-control, watch/overlay and real WebGL barrier tests.
- Real browser checks exercise fire controls, readiness reasons, paused-state/RNG purity, Watch mode, large-selection annotation budgets, clean HUD and hull barriers with WebGL error collection, alongside the existing complete-battle/campaign/replay suite.
- The production build/typecheck and actual Pages-subpath startup are checked before release. Visual inspection uses real simulation events, sequentially updating effects during the battle rather than replaying many seconds of impacts in one frame.
- Performance measurements are simulation-only and run independently from browser tests; software WebGL frame rates are not hardware-GPU performance claims. The supplied benchmark prints shot activity and losses as well as mean/worst tick cost.

## Intentional limits

This is a focused V2 pass, not all items in the design pack. Frigates, fighters, carriers and other faction hull families retain their previous models; only the listed capital/cruiser silhouettes received this pass. There is no rigid-body collision/obstacle solver, independently commanded persistent squadrons, Oculus roster, cinematic arrival scheduler, spatial combat aggregation or performance governor in this release. Those remain separate work.

Manual commands are deterministic when given the same input schedule; the existing replay reruns the initial configuration and does not record interactive order history. Preferred standoff can still compress under enemy pressure; no indefinite kiting or forced victory was introduced. Automatic fire remains the default. Transient overlaps can occur under extreme crowding or damage; local avoidance is a bounded manoeuvring controller, not a mathematical no-collision guarantee.

## Isolated simulation benchmark

Seed 42 on the current cloud machine; each shot bucket covers 30 simulated seconds. These are single-run timings.

| Hulls | Simulated time | Mean / worst tick | Shots per bucket | Destroyed |
| --- | --- | --- | --- | --- |
| 92 | 82.85 s | 1.193 / 24.812 ms | 2087, 6158, 2602 | 56 |
| 368 | 120.05 s | 7.511 / 28.331 ms | 6566, 23504, 20051, 12291 | 224 |

## HADES follow-up — 0.12.1

HADES now resolves a kinetic entry stage followed by an internal nuclear warhead only when the penetrator actually reaches the hull. The nominal shot budget is redistributed 65%/35% (an AU tuning estimate); no arbitrary extra damage is added. This changes the distribution between shield loading and internal hull damage, so APEX casualties/timing can change. Canon rounds remain identical. The burst is a direct internal hit, not an external area-of-effect weapon, and a stopped penetrator cannot detonate inside a target.

Actual penetration events drive bounded flash/ring/vent effects and a procedural delayed impact sound. The effect does not claim physical nuclear yield, postprocessed refraction, or a galaxy-wide shockwave. The fleet's manual HADES release can concentrate multiple legitimate nuclear penetrations; it cannot force hits or bypass weapon cooldowns.

Validation: all 168 unit tests and 14 browser tests passed, including a real penetrating projectile driving the nuclear renderer with no WebGL errors. Production build/typecheck passed. The nuclear-impact screenshot was visually inspected.
