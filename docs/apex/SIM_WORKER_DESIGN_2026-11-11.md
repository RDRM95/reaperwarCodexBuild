# Simulation in a Web Worker: design and first slice (11 November 2026)

Approved by the owner on 11 November. This note is the design; the first slice (the snapshot codec and the
mirror) is in the same change. Nothing in the running game uses it yet.

## Why

The simulation ticks at 20 Hz on the thread that draws. After the tick work in #43 a tick costs about 11 ms at
1,104 ships and 24 ms at 2,208 on this cloud CPU, so every frame that carries a tick is long, whatever the GPU.
Tuning the tick further returns little: its cost is spread thinly (largest single function 13 %).

## Shape

- A worker owns the real `BattleSimulation` and steps it.
- After each tick `SnapshotEncoder` (`src/simulation/snapshot.ts`) packs what changed: the dynamic fields of
  every ship (53 numbers) and weapon (18) in `Float64Array`s, projectiles, missiles and point-defence flashes
  the same way, and the few things that are not numbers as plain data: ships that have just appeared (whole),
  weapon definitions first carried by a shot, new events, fleet state. Ship references travel as indices.
- The drawing thread holds a `SimMirror` with the simulation's readable shape (`ships`, `getShip`, `fleets`,
  `projectiles`, `missiles`, `flashes`, `events`, `time`, `finished`, `result`, `config`, `rules`). `apply`
  updates it in place, so the ship objects that `ShipVisual` and the HUD rows hold for a whole battle keep
  working, and so do the simulation helpers the interface calls on live ships (`shipEngagementRange`,
  `engagementBand`, `inWeaponArc`).
- Commands (`issueOrders`, `releasePrimaryVolley`, `orderShipsAttack`) are posted to the worker and take effect
  at the next tick boundary.
- The inline mode stays: tests, the 14 QA scripts that call `app.battle.sim.step()`, the campaign's headless
  battles and the results screen need a simulation they can step synchronously.

## Measured (first slice)

`scripts/snapshot-benchmark.ts`, bundled, cloud CPU, 30 s of the scale-benchmark battle:

| Ships | Tick (leaves the drawing thread) | Encode (worker) | Clone on arrival | Apply to mirror | Left on the drawing thread | Snapshot |
|---:|---:|---:|---:|---:|---:|---:|
| 276 | 3.05 ms | 0.98 ms | 0.09 ms | 0.29 ms | 0.38 ms | 0.4 MB |
| 1,104 | 11.06 ms | 2.89 ms | 0.11 ms | 0.74 ms | 0.86 ms | 1.5 MB |
| 2,208 | 24.31 ms | 5.46 ms | 0.12 ms | 2.24 ms | 2.35 ms | 3.0 MB |

The typed arrays are transferable, so they are not copied between threads. These are Node figures for the
codec alone; nothing has been measured in a browser worker or on the owner's hardware.

`tests/snapshot-mirror.test.ts`: over three seeded battles (carriers launching fighters, torpedoes, a
reinforcement wave arriving mid-battle, three rule sets), with every snapshot passed through `structuredClone`
as `postMessage` would, the mirror equals the simulation field for field every 20 ticks and at the end: ships,
weapons, projectiles, missiles, flashes, fleets, events and the result. Any field the simulation starts to
change that the codec does not carry fails that test.

## Remaining slices, in order

1. **Worker and controller.** A worker entry that builds the simulation from a `BattleConfig`, steps to the time
   the drawing thread asks for and posts snapshots; a controller mode that drives the view and HUD from the
   mirror; a setting to choose it, off by default until measured in a browser.
2. **Queries.** `primaryBatteryStatus` and `fleetBatteryStatus` read the simulation's private volley state:
   compute them in the worker at HUD cadence and send them with the snapshot. `assessReapers(sim)` takes the
   whole simulation: check it against the mirror or move it to the worker too.
3. **Event timing.** Inline, a listener runs in the middle of a tick and sees the state at that instant; from a
   snapshot it sees the state at the end of the tick. Handlers that read live weapon state at event time
   (`weapon.beamHit` in `battleView.processEvents`) need checking.
4. **Results.** `finishBattle` and the results screen keep the whole simulation after a battle; give them the
   mirror, or have the worker post what they need.
5. **Cost.** Encoding re-sends every dynamic field every tick; if the worker's 3 to 5 ms matters, send only
   what the interface reads each frame at full rate and the rest at HUD cadence.
6. **Sandbox.** Port once the Codex build runs on it by default.
