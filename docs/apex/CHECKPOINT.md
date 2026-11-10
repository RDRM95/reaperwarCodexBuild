# APEX programme checkpoint

Lead engineer's running checkpoint for the handover of 9 November 2026 (priorities P1–P8). Short by design; the evidence lives in the files it names.

## State on 10 Nov 2026, 15:00 UTC — Reaper visual overhaul

Read this section first. Everything below it is older.

**Merged today (Codex build, base `codex/apex-combat-overhaul`):**

| PR | What | Evidence |
|---|---|---|
| #28 (`a1d2d9c`) | Instanced batches skip a template's hidden stand-in limbs (46–57 % fewer vertices per instanced Reaper); Ascendant renders at 300 units | `docs/apex/qa/INSTANCED_REAPER_LIMBS_2026-11-10.md` |
| #29 (`2270474`) | Reaper hulls rebuilt: lofted carapace with armour bands, stepped hood, ribbed ventral cavity, faceted plated limbs with knuckles and blade claws, readable graphite palette; lengths, muzzle and engine nodes unchanged; triangles 1.16–1.29× | `docs/apex/REAPER_VISUAL_QA_2026-11-10.md`, `docs/apex/qa/reaper-visual-20261110/` |
| #30 (`ca6f4c5`) | Limb travel and combat stances, slow and limb by limb (claw-tip shift on a capital 14 m → 230 m) | `docs/apex/REAPER_LIMB_STANCES_QA_2026-11-10.md` |

**Merged today (sandbox, base `main`):** #32 (`bfb66b5`, port of #28) and #33 (`7ba24bd`, port of #29); Pages deployed from `7ba24bd`.

**Open at the time of writing — check their state before doing anything else:**

- Codex #31 `feat/reaper-camera-presence-20261110`: over-the-carapace Reaper view, closer follow and solo cinematic orbit for capital-scale hulls (follow share 25 % → 45 %); gate green locally. Sandbox port is committed locally on `feat/reaper-camera-presence-20261110` in that repository (not pushed; push after sandbox #34 merges).
- Codex #32 `feat/reaper-emitter-glow-20261110`: a pool of two point lights at the emitters of charging and firing Reapers; gate green locally. Not yet ported to the sandbox (copy `src/rendering/emitterLights.ts` and the `BattleView` hunk; the sandbox's `battleView.ts` differs, apply by hand).
- Sandbox #34 `feat/reaper-limb-stances-20261110`: port of Codex #30.
- All three were opened with every check still running. Merge each when its checks pass and the head is mergeable; #31 and #32 touch disjoint files.

**Concurrent work by the other assistant — do not duplicate:** `fix/reaper-structural-lod-20261110` (no pull request yet): level-of-detail policy for Reapers (`shipLod.ts`, `applyShipLod`, `selectReaperRigDetail(level)`), which covers the defect that hero Reapers never reduce detail. It was branched before #29 and edits `battleView.ts` near the `animateReaperRig` call and the signature of `selectReaperRigDetail`; merging it after #30/#32 is a small mechanical merge. Their open PRs #26 (draft, reach) and #27 (Oculus damage) are untouched.

**How to reproduce the evidence.** `npm run build && npx vite preview --port 4191 --strictPort`, then `node --import tsx/esm scripts/reaper-visual-qa.mjs <outDir> http://127.0.0.1:4191 after`: six exact-orbit views plus quarter and close views of each Reaper class, close/medium/distant, frigate-beside-capital, a 20-Reaper fleet, deep space and Earth orbit, and triangle counts. All captures so far are cloud Chromium with SwiftShader: shape, materials and framing only; nothing was measured on the RTX 5090.

**What still falls short, in order of visible gain:**

1. Surfaces are flat-shaded facets: no curved shells, normal maps or micro-detail. Smooth normals on the carapace bands with hard edges only at plate lips would read as curved armour.
2. Damage response: only the mesh named `hull` gets the damage tint; the carapace, plates and limbs do not, and there is no local light from hits.
3. No bloom or exposure pass in the Codex build (the sandbox has an optional bloom preset); the emitter and seams would benefit from a restrained one.
4. Two-subject cinematic shots still frame by the distance between ships; a Reaper fighting a target 20 km away is small in them. The tactical default distance is unchanged.
5. Hull rotation, acceleration and inertia are the simulation's (P1 work package A, below); the render side adds no hull motion.
6. Static stand-in limbs and instanced Reapers show the neutral pose; a hull crossing the articulated range mid-fight changes pose.
7. Issue #16's P0 checklist (Sovereign-class, Harbinger, destroyer) is not ticked: that needs the owner's manual silhouette judgement against private references.

**P1 combat-flow branches (not merged, no pull requests):** `feat/combat-reach-targeting-mass-20261109` (work package A: has PR #26 merged in, RC1+RC5 at `57bf531`, then a work-in-progress commit `0f01204` with the interrupted agent's unfinished RC2 edits and `tests/feasible-targeting.test.ts`) and `feat/fleet-composer-silhouette-20261109` (work package B: composer, headings, altitude bands and staging to `8725e8f`, then work-in-progress `6d30592`). Both are pushed; the work-in-progress commits typecheck but their tests were not run. The agents stopped when the session was interrupted. Do not interfere with #26.

## State on 10 Nov 2026, 02:50 UTC

- **Reaper visual overhaul** (the owner's HIGH task of 10 Nov). Diagnosis first: rendered lengths already match the catalogue (Sovereign-class 20 units = 2,000 m, Harbinger 24, destroyer 1.6, frigate 1.7; 1 unit = 100 m), so the "too small" reading comes from the model, not the scale chain: six smooth glossy tube limbs with ball joints that dominate the silhouette, a short smooth lathe body with no layered plating, cavities, dorsal ridge or spinal housing (body diameter about 15 % of length where the design says under a tenth), a navy plastic-like palette with pink confetti running lights, and no surface detail to give a sense of size. Slices, each its own branch and pull request:
  1. **Carapace, hood cavity, armoured limbs and the §7.8 graphite palette** on `feat/reaper-carapace-limbs-20261110` (in progress; first commit `08f53b3`): aft blade with overlapping longitudinal bands and a split tail housing, stepped hood shells, a ribbed ventral cavity at the limb roots, faceted sleeved limbs with mechanical knuckles and blade claws; lengths, eye/muzzle and engine nodes unchanged; six-view, close/medium/distant, frigate-beside-capital, fleet and two-lighting captures to `docs/apex/qa/reaper-visual-20261110/` with a QA document.
  2. **Instancing defects.** 2a merged as PR #28 (`a1d2d9c`): `createBatch` merged the Reaper rig's hidden static stand-in limbs into every instanced Reaper (12,744 of the Sovereign template's 22,260 vertices, 57 %; Harbinger 46 %; destroyer 48 %); the batch now skips hidden layers; the Ascendant renders at its catalogue 300 units instead of 360. Sandbox port: PR #32. 2b, after slice 1 names structural parts: plates, eye and lights drop at the reduced level because `plates` is a detail mesh name, and `applyLod` only walks direct children so hero Reapers never reduce.
  3. **Motion and presence** (limb articulation per class, render-side deliberateness within the simulation's turn rates) and the sandbox ports of slices 1 and 2.
- **P1 status.** Work package A merged the owner's PR #26 (`fix/class-engagement-reach-20261109`, rear-rank reach and class cruise limits) into its branch as instructed, keeps its modules and fixture, and is on RC1+RC5 (`57bf531`); work package B has the seeded order-of-battle composer, per-hull headings, reach-bounded depth, altitude bands and staging (`8725e8f`) and is at its gate.
- **Owner's open pull requests:** Codex #26 (draft, reach; reconciled by work package A rather than duplicated), #27 (Oculus damage separated from the Annihilation beam multiplier; independent of P1), sandbox #30 (the port of #26).

## State on 9 Nov 2026, 21:30 UTC

- **Audit done.** `docs/apex/COMBAT_AUDIT_2026-11-09.md`: combat flow root causes RC1–RC9 and formation findings FS1–FS8, with executed measurements on `be9a99c` (the head after PR #17) and `6148253` (before it), probe scripts and before/after numbers.
- **P1 in progress** on two feature branches against `codex/apex-combat-overhaul`, each in two implementation steps, an adversarial verification and a fix round, then a pull request:
  - `feat/combat-reach-targeting-mass-20261109` (work package A): reach and anchoring (RC1, RC4–RC6), target scoring (RC2), mass and heading-dependent translation (RC3), Reaper slew (RC7), live doctrine fields (RC8), frigate and screen behaviour (RC9), with `scripts/combat-flow-metrics.ts` for before/after tables.
  - `feat/fleet-composer-silhouette-20261109` (work package B): order-of-battle composer, asymmetric templates, headings, depth within engagement geometry, reform and evolution during combat, altitude, carrier wing stations, multi-fleet staging (FS1–FS8), with `scripts/silhouette-metrics.ts` and plots (commit `422ba5f`).
  - The sandbox (`RDRM95/reaper-war-sandbox`) ports follow each merged pull request, module by module per `docs/DEFINITIVE_WORKFLOW.md`; the shared simulation files that already differ between the two repositories are `ai.ts`, `fireControl.ts`, `separation.ts` and `battle.ts` (the Codex has `projectileBroadphase.ts` and `weaponTargetField.ts`, the sandbox `spatialIndex.ts`).
- **P2 plan (scripted cinematic battles).** The sandbox's `src/spectator/sceneScript.ts` is the shared scene format (timed camera beats, reinforcement waves as ordinary `FleetSpec` arrivals, presentations `directed` / `continuous_pov` / `explore`, a POV anchor validated against the roster; it compiles unchanged against the Codex types). The Codex implements none of `CINEMATIC_DESIGN.md` §1–§3 yet (no beat scheduler, shot list or Showcase; `director.ts` is the activity-weighted pair picker). P2 therefore ports the format into the Codex as a shared module and extends it, in both repositories, with: conditional triggers (event- and state-conditioned beats keyed to simulation time), forced interventions recorded in an event ledger and shown at the end, a shot list with dead-subject fallbacks, captions and telemetry, deterministic replay (a scene pins its seed; replay restarts the same config). First complete scene: the Normandy stealth flank in continuous POV, then the Sol opening salvo as a directed scene.
- **Owner's parallel work on 9 Nov**, merged while P1 ran: Codex PRs #22–#24 (first-person optics rigidly on the barrel, solar-lit orbital terrain and GPU resource release, Oculus optic visibility) and sandbox PRs #25–#29 (POV preflight, gunnery pose, orbital lighting, Oculus optic, large fleet map labels). Rendering only; no simulation files changed, so the P1 branches merge the base cleanly.

## Rules in force

Deterministic simulation (seeded Rng only; no `Math.random`, `Date.now`, `performance.now` or `process.env` under `src/simulation`, `src/data`, `src/scenarios`, `src/timelines`, `src/core`); no fake combat (ranges, arcs, barriers, charge, propulsion and collision decide outcomes; forced scene events are recorded as such); tests are the contract (a pinned value changes only with a measured new value and the reason in the commit); provenance on catalogue values; canon by default, AU labelled; HADES is a penetrator with a nuclear warhead; no ripped assets; GitHub's software WebGL is not hardware proof, so performance claims name what was measured and where.
