# Lore, firing cadence and crossover battles — 0.14.0

## Choosing a rules profile

**Canon Mass Effect 3** retains the existing balanced simulation. **Strict Lore — Mass Effect** is a separate source-led profile: it excludes crossover factions, Omaha and the AU Cerberus Black Fleet dreadnought, disables speculative refits, and uses the documented Everest-pattern main-gun base cycle. Alternate-history briefings cannot launch in this mode. Imported rules cannot claim its protected identity.

Strict Lore is not a claim that every catalogue number is established canon. Hull pools, exact broadside/Reaper timings, mount counts, compressed ranges, speeds and turning remain declared simulation estimates. Player-dependent trilogy choices remain available. The original balanced Canon and APEX weapon values are unchanged.

## Why a hull can appear to fire rapidly

Cycles are measured in **simulated seconds**, independently for each physical mount. The Alliance dreadnought has a spinal gun, eight broadside mounts and point defence; several flashes need not be repeated spinal shots. Playback at 4× makes a four-second simulated reload appear to take one real second when rendering keeps up.

| Weapon / profile | Nominal cycle per mount | Status |
| --- | --- | --- |
| Alliance main gun, balanced Canon | 4.00 s reload | Existing simulation calibration |
| Alliance main gun, Strict Lore | 2.00 s base reload | Everest Codex anchor; heat/readiness can delay shots |
| APEX hyper-mass accelerator | 4.5 / 1.1 ≈ 4.09 s reload | AU estimate |
| Omaha spinal cannon, APEX | 8 / 1.1 ≈ 7.27 s reload | AU estimate |
| Alliance broadside | 1.60 s Canon / ≈1.45 s APEX | Per-mount estimate, not whole-ship cadence |
| Reaper capital beam | 2.8 s burst + 7.5 s recharge ≈ 10.3 s between starts | Per-emitter estimate |

Balanced and AU reloads have the existing ±5% scheduling variation. The Strict Lore Everest gun does not use a below-anchor reload jitter. Heat, subsystem damage, ammunition, alignment, range and salvo scheduling can extend real firing intervals. Sustained beam damage ticks are not additional beam shots. The existing two coincident capital-Reaper emitters (three for Harbinger) remain a balance abstraction, not a confirmed canonical emitter count.

The Fleet Database now separates weapon-concept provenance from rate estimates, shows facing/count per hardpoint group and explains beam burst/recharge. Selected ships show their nominal forward-battery cycle and broadside count. A rendering bug also made high-damage secondary guns flash from the spinal muzzle; flashes now use the actual mount position and facing. Turreted lance beams originate at their physical deck hardpoint, while forward projectors and Reaper eyes retain dedicated model emitters.

## Keeping the tactical overlay

**H** still cycles full, minimal and hidden HUD. **O** independently toggles tactical annotations. To retain annotations while hiding the interface, select **Keep tactical overlay** in Settings → Overlay with hidden HUD, or enable **Keep overlay with hidden HUD** in the pause menu. Explicitly turning the overlay on with O while the HUD is hidden also enables this policy. The preference persists and works in Watch battle.

**Overlay labels** in Settings or the pause menu selects Auto, individual ships or fleet names/counts. Auto aggregates annotations and HUD rosters at 80 live deployed ships and retains that view until fewer than 64 remain. Fleet summaries retain live counts; **Show ships** expands an individual HUD group. An inspected ship can still show detailed annotations. This reduces label projections and DOM work without changing combat simulation.

The default remains the previous clean-recording behavior. Esc menus remain usable with a hidden HUD; closing a menu preserves an already-paused battle rather than unexpectedly resuming it.

## Multiverse roster

Custom Battle → **Roster → Multiverse crossover (AU)** exposes the new factions on either side, as allied fleets and as reinforcements. UNSC/Covenant and Imperium/Chaos presets are included. Older saved crossover setups infer their roster mode. Switching to Strict Lore removes excluded hulls with an explicit notice; empty sides need permitted ships before launch.

| Setting | Faction | Starter hulls |
| --- | --- | --- |
| Halo | UNSC | Marathon heavy cruiser; Infinity supercarrier |
| Halo | Covenant | CCS battlecruiser; CAS assault carrier |
| Warhammer 40,000 | Imperium | Lunar cruiser; Retribution battleship |
| Warhammer 40,000 | Chaos | Murder cruiser; Desolator battleship |
| Terminator-inspired AU | Skynet | Orbital Hunter-Killer; Orbital Harvester capital ship |

The five crossover factions have ten hulls. Three further Mass Effect AU factions—Prothean, past cycle and player civilization—add six original hulls; see [AU Worlds](AU_WORLDS_AND_CIVILIZATIONS.md). Skynet spacecraft are invented orbital extrapolations, not established film vessels.

Each hull has an original procedural stand-in model, catalogue-sized geometry and its own movement/weapon parameters. There are no extracted game assets. All cross-setting dimensions and conversions are labelled AU estimates, including precise-looking class-scale lengths.

Power is **setting weighted**, not equalized by hull count. Old UNSC cruisers lack energy shields; Covenant cruisers have substantial shields; 40k cruisers greatly exceed the conventional cruiser tier and their battleships are still heavier encounters. For example, Marathon / CCS / Lunar / Retribution fleet-point weights are 950 / 1,600 / 11,000 / 31,000. These are explicit encounter estimates, not measured canonical cross-universe equivalences. Use fleet points to assemble encounters or author explicit per-faction technology overrides in a custom timeline. APEX refits and HADES do not silently transfer to alien settings.

Imperium and Chaos hulls turn to a stable broadside near their firing station without changing translation or orbiting a target. Lances remain useful and their actual arcs are preserved. Forward approaches and out-of-range lance/torpedo shots keep appropriate facing. Homing missile launch envelopes let UNSC/Covenant side launch banks engage forward targets; fixed-gun arcs, magazines and reloads remain enforced. Setup-time clearance also handles small fleets of multi-kilometre hulls, instead of using the old cruiser spacing and spawning overlaps.

## Limits

This is a starter crossover **battle** roster; ordinary campaigns retain Mass Effect factions. Infinity and CAS currently model ship batteries without embarked fighter wings or deployed escort complements. Boarding, warp powers, Skynet time travel/factory reproduction and setting-specific void/energy-shield physics are not implemented: all settings use the simulator's declared common barrier/weapon abstraction. Weapon energy, durability and points are editable estimates, not a universal power-scaling verdict. Battlegroups still share fleet orders.

## Validation

Deterministic tests cover protected lore rules, real per-mount reloads, sustained beams, mount/effect geometry, crossover damage/technology isolation, campaign isolation, model bounds, oversized deployment clearance, missile reload/magazine enforcement and stable broadside firing. Browser checks cover actual crossover combat, Strict Lore exclusions, saved setups, cadence readouts and independent overlays. [Release verification](QA_V014.md) records test totals and same-host performance results.
