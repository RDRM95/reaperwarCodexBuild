# APEX refinement checkpoint — 12 November 2026

## Bounded change
Draft PR #69 on `fix/attack-bearing-large-fleets-20261112`, based on `codex/apex-combat-overhaul`.

- `src/simulation/manoeuvre.ts`: replace `Math.max(1e-6, ...members.map(...))` with a loop; avoids engine function-argument limit when a custom fleet contains a very large number of hulls of one role.
- `tests/manoeuvre-large-fleet.test.ts`: 150,000-frigate regression for successful assignment, finite values and deterministic results independent of input order.
- Reproduction on Node 22.16: `Math.max(...Array.from({length:150000}, ...))` throws `RangeError: Maximum call stack size exceeded`; equivalent loop completes.

## Evidence and limits
The isolated Node reproduction passed. **Project Vitest, TypeScript, build, browser, screenshot and GPU checks have not been run for this PR.** Keep draft until full CI and reviewer checks pass. This fix changes no visual output, weapon rules or fleet tactics.

## Concurrent work
Codex PRs #66 (Alliance carrier), #67 (fighter flashes), #68 (Turian frigate) and sandbox PR #52 (model/flash ports) were open during this pass. Do not merge overlapping geometry changes blindly. In particular, PR #68 explicitly says the private reference pack contains no Turian frames; do not grant canon-likeness approval without adequate external or private source evidence. Issues #16 and #19 retain manual acceptance gates.

## Next actions
1. Run full CI on #69 and merge only if green and current head remains mergeable.
2. Port the tiny deterministic fix to the sandbox only after the Codex PR is accepted; do not duplicate before.
3. Reconcile #66–#68 and #52, verify six-view provenance, and source stronger Turian/Salarian/Geth reference coverage before claiming visual likeness.
4. Continue line-of-fire masking, independent tactical fleet decisions, fighter squadrons and carrier standoff after avoiding concurrent combat changes.
5. Validate full-size Reaper Annihilation battles and 4K rendering on the owner's hardware; cloud checks are insufficient.
