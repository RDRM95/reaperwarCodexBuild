# AU Worlds and civilizations — 0.14.0

Open **AU Worlds & Civilizations** from the main menu. Canonical rules remain in the normal timeline selector; this hub groups speculative histories, historical alternatives, HFY and crossover encounters. Each card explains its divergence and actual technology/strategic effects. **Build a fleet** opens the custom builder with that branch, while **Galactic campaign** appears only for compatible modern-era profiles.

## Alternate paths

| Branch | What changes |
| --- | --- |
| Concordant Earth | Alliance-aligned Cerberus; shared sensors, electronic warfare, heat management and coordination. Cerberus is cooperative. |
| Iron Dawn | First Contact victors retain a war economy: stronger armour and penetrators, slower ships and weaker Council coordination. |
| The Sealed Relay | A Prothean warning in 1800 leads to 290 years of isolated preparation before Charon opens in 2090. Survivability, sensors, reserves and industry receive the investment. |
| The Unbound Route | Non-eezo FTL permits three-week direct campaign crossings for eligible Alliance/Cerberus fleets. In-transit ships cannot defend, fight, receive shipyard output or reroute. Combat thrust remains unchanged. |
| Humanity Ascendant | The existing early-eezo branch remains available with its own prepared-humanity modifiers. |
| Prothean Victory | An invented surviving Empire fields estimated Prothean cruiser/dreadnought designs in a historical battle sandbox. |
| Past Cycles | Original earlier-cycle societies use estimated ancient cruiser/capital frames; the generator supplies persistent identity, politics and seeded technology. |
| HFY — Terran Ascendancy | Explicit power fantasy with large human industrial/technology advantages, hyper-mass accelerators and HADES. |

The ordinary new human branches leave Reaper technology unchanged. Their human advantages have declared costs; no scenario forces an Apex victory. The independent-FTL travel time and all AU performance conversions are authored estimates. Historical factions are battle sandboxes rather than a relabelled 2186 campaign.

The **Timeline editor → Faction technology** panel can set or restore individual faction values in a custom timeline. Research and readiness multiply each campaign fleet's own baseline; they do not replace its AU training or technology. Fleet preservation evaluates the deployed hull-value-weighted technology rather than granting one advanced ship's bonuses to every ally.

## Found a civilization

Choose **Create player civilization** or **Seeded past-cycle generator**. Set a name/seed, origin, government, ethics, doctrine and bounded initial frame budget. A blank name generates a seeded one. The seed is independent of the combat RNG; a civilization does not mutate the shared ship catalogue.

- **Industry** pays catalogue costs to construct real hulls. The inventory and frame-point total show what can deploy; construction does not create free ships.
- **Research** and industry/influence buy technology tiers. The displayed effective technology comes from the actual per-fleet overrides used in battle.
- **Policies** trade industrial output, research, cooperation and stability. Government/ethics also affect resource income or fleet performance.
- **Political decisions** arrive every three months. Their costs and consequences affect the same persistent state; a no-cost deferral prevents an unaffordable vote from blocking play indefinitely.
- **Deploy this fleet** launches the inventory against a Reaper patrol, capital force, invasion force or Skynet machines. On completion, viewing results applies owner-filtered surviving hulls and political consequences once.

While an engagement is pending, strategic mutations are locked. The saved initial configuration can restart with the same seed; there is no mid-frame save/resume. **Cancel pending deployment** unlocks the polity without applying an unfinished battle. Civilizations save locally, support JSON export/import, and retain a previous-civilization backup when replaced. Export a copy to move between browsers or machines.

This is a compact strategic layer, not a full Stellaris map: there is no generated territory simulation, AI state diplomacy or interstellar economy. The initial player and past-cycle rosters each have two hull classes; past-cycle generation changes identity and technology on original reusable geometry. Invented Prothean/past-cycle hardware is labelled AU, and explicit HFY origins deliberately relax the ordinary Reaper challenge.

## Other Earths and faction scale

The hub links directly to **UNSC Earth**, **Imperial Terra** and **Skynet Earth vs Reapers**. The complete builder has sixteen factions: the original eight Mass Effect factions, three AU civilization factions and five crossover factions (UNSC, Covenant, Imperium, Chaos, Skynet). The new roster supplies sixteen original procedural hulls in total.

Conversions use the simulator's common weapon/barrier model, with setting-weighted fleet points rather than equal power per ship. They are explicit encounter estimates. Skynet's orbital spacecraft are invented extrapolations without shields, time travel or factory reproduction; original Prothean plans are likewise not claimed as canon. Crossover and historical factions do not auto-populate ordinary galactic campaigns. See [lore/cadence/crossover notes](LORE_CADENCE_AND_CROSSOVERS.md).

## Names and readable large fleets

Organic, machine and crossover ships receive faction-fitting names or fighter callsigns. Explicit scenario names and signature hulls such as Omaha retain their identity; Reapers keep their numbered convention. Generated names are unique within a battle and do not consume combat randomness. They are original labels, not a claim to a complete canonical fleet roster.

**Overlay labels** in Settings and the pause menu offers Auto, individual ships or fleet names/counts. Auto enters fleet mode at 80 living deployed ships and stays there until fewer than 64 remain. It applies to both tactical annotations and HUD rosters. Fleet rows select a group and **Show ships** expands its individual roster; an inspected ship retains details.

**H** cycles HUD visibility. **O** toggles tactical annotations, and **Keep tactical overlay** allows them to remain visible in cinematic/hidden-HUD views. These preferences persist. Aggregation reduces projection and DOM work, while the underlying simulation still resolves individual ships.

## Later engine work

The [Extreme Scale brief](EXTREME_SCALE_BRIEF.md) preserves the requested full-armada scenario and staged engineering requirements. Workers, multiscale sectors, persistent squadrons, GPU-instanced hulls and the requested extreme-scale benchmarks are future work. This release does not claim those capacities.
