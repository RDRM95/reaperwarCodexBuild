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

## Second slice: the worker and the controller mode

- `src/simulation/simWorkerCore.ts` is the worker's side of the protocol without the worker (so tests drive it
  directly): `start` builds the simulation; `advance` steps it; `issueOrders`, `releasePrimaryVolley` and
  `orderShipsAttack` are the commands. Every message after `start` is answered with a snapshot, every fleet's
  battery status and the watched ship's main-battery status. `src/simulation/simWorker.ts` is the thin
  `self.onmessage` wrapper, with the typed arrays transferred.
- `src/simulation/remoteBattle.ts`: `RemoteBattle` is the mirror plus those commands and queries, so it can be
  given to the view, the HUD and the overlay in place of a simulation (`BattleLike` in
  `src/simulation/battleLike.ts` is the type both satisfy). It deploys the battle itself once, without stepping,
  so there are ships on the first frame. Each frame the controller tells it how much simulated time has passed;
  it applies the snapshots that are due and keeps the worker one tick ahead, so the picture does not wait on the
  worker. If the worker falls behind, the picture holds and then resumes at real time; it does not try to repay.
- The controller (`src/ui/app.ts`) uses it when the new setting **Simulation thread** is "Worker
  (experimental)". The default is the main thread, and everything that steps a simulation itself (tests, the QA
  scripts, the campaign's headless battles) is unchanged.

**Measured in the real app** (`scripts/sim-thread-benchmark.mjs`: production build, a real Web Worker, the app's
own frame loop, 40 s of wall time, 320×180 at low quality so the software renderer draws more frames):

| Ships | Mode | Drawing thread, per simulated tick | Worst single frame's share | Mean script time per frame | Simulated time reached |
|---:|---|---:|---:|---:|---:|
| 1,104 | main | 9.63 ms | 25.4 ms | 18.6 ms | 13.8 s |
| 1,104 | worker | 0.74 ms | 9.8 ms | 8.2 ms | 17.7 s |
| 2,208 | main | 21.25 ms | 65.4 ms | 29.1 ms | 6.1 s |
| 2,208 | worker | 1.19 ms | 13.0 ms | 17.2 ms | 9.0 s |

The software renderer here draws about six frames a second, so these say what the drawing thread's script
costs, not what frame rate a hardware GPU reaches. No page errors in either mode.

`tests/remote-battle.test.ts` (4 tests) joins `RemoteBattle` to `SimWorkerCore` with every message cloned as
`postMessage` would: ships on the first frame; driven at 60 frames a second, the battle is identical to an
inline one with the same order issued, the order landing within two ticks of the frame it was given on; battery
queries equal the inline simulation's; a silent worker holds the picture without a catch-up spiral.
`e2e/sim-worker.spec.ts` runs a small battle through the real worker in the browser suite.

**Known differences in worker mode** (why it is experimental and off by default):

- An order takes effect up to two ticks (0.1 s) later than inline.
- An event listener sees the state at the end of its tick, not the instant inside it.
- While paused, an order shows in the HUD at once but its comms line and event arrive on resume.
- `primaryBatteryStatus` for a newly selected ship is empty until the next answer from the worker.
- The speed-up shows only where the simulation, not the renderer, limits the frame: with few ships it does
  nothing useful.
- Not measured on the owner's hardware.

## Remaining, in order

1. **Judge it on hardware.** Turn the setting on with a large fleet on the owner's machine; if it holds, make it
   the default for large battles.
2. **Event timing.** Check the handlers that read live weapon state at event time (`weapon.beamHit` in
   `battleView.processEvents`) against end-of-tick state.
3. **Cost.** Encoding re-sends every dynamic field every tick (2.9 ms at 1,104 ships in the worker); send only
   what the interface reads each frame at full rate and the rest at HUD cadence if that matters.
4. **Sandbox.** Port once the Codex build runs on it by default.
