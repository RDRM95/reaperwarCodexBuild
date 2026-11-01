# Known issues and limitations

## Visual

- Reaper models are recognisable (ridged body, swept arms, red seams, forward aperture) but still simpler than the source silhouette; hood plating and arm articulation need another pass.
- All organic hulls have limited surface detail (panel strips, turrets); no textures, only materials. Asari fleets have no frigates; the Citadel's wards are simplified boxes.
- Fighters are rendered at 2× scale for visibility.
- Earth is at compressed scale; cloud layer is baked into the surface texture (no separate cloud sphere).
- Beam cylinders are flat-shaded; very close to the camera they look like ribbons.
- Level of detail hides detail meshes and glow sprites by distance and draws far ships as points; there are no intermediate simplified hull meshes, so mid-range ships still cost two draw calls each (about 590 draw calls for a 206-ship Final Battle in the tactical view).

## Simulation

- Torpedo magazines are finite (8 per tube, 2 per fighter) and fighters rearm alongside their carrier, but carriers themselves never run out of torpedoes to issue; mass accelerator rounds are treated as unlimited (canon describes very large slug magazines).
- Fighters under canon rules still die quickly to Reaper point defence; the new burst recovery helps only marginally.
- Fleets compress to a single formation anchor per fleet; sub-groups (squadrons) are not modelled.
- Point defence will scorch nearby hulls with GARDIAN lasers when no small targets exist (low priority, low damage).
- No automatic fleet-wide withdrawal. Damaged organics can recover behind the line; only explicit organic Retreat orders escape. Reapers ignore Retreat/Withdraw and fight until destroyed.
- Standoff recovery is bounded to prevent endless kiting; a deliberately closing enemy can compress the range. Hull motion is kinematic, without physical collision response or obstacle navigation.
- Omaha was absent from the input project: its new hull and numerical specifications are explicitly AU simulation estimates, selectable in Custom Battle, not established canon.
- Reference canon/APEX outcome regressions are retained, but the tactics changes alter casualties and timing. No comprehensive balance guarantee exists for every custom fleet, seed or campaign state.

## Campaign

- Ground war, research, refugees and politics are abstract tracks (0–1 values and event triggers); there is no ground battle simulation. Diplomacy is a three-option Council summit every twelve weeks, not bilateral negotiation. Production is a point pool per faction.
- The Terminus mercenary fleet event uses Alliance-pattern hulls (no Terminus hull family yet) and is labelled an estimate in the log.
- Engagements cap each side at 70 ships by scaling counts; losses are scaled back proportionally.
- Autosave each week plus named slots (Saved Games screen); slots are browser-local unless exported from Settings.
- Post-war (Cerberus Ascendant) reconstruction is an abstract metric model: budget programmes move eleven 0–1 indicators and a fleet-point total. There are no post-war battles, named characters or map; the Terminus and Council are events, not actors.

## UI / platform

- Touch: one-finger drag orbits, two-finger pinch zooms and pans. On phones the fleet and target panels sit behind a Panels toggle as half-height bottom sheets; the galaxy map canvas keeps its 1200×760 aspect and is small on narrow screens.
- Audio needs a first click (browser policy); it is synthesised and intentionally restrained.
- Headless/software-GL renders at low frame rates; the simulation step budget (40 ms per frame) keeps it responsive but slows simulated time.
- Loading a slot makes it the autosave; the previous autosave is overwritten on the next turn.
