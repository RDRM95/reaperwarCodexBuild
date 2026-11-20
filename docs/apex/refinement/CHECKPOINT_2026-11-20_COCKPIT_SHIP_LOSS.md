# APEX refinement checkpoint — 2026-11-20

Base: `codex/apex-combat-overhaul` at `f39a93348fcf1918170c0be23a3197d734076539`.
Active repo only: `RDRM95/reaperwarCodexBuild`; sandbox retired and untouched.

## This pass
- Inspected open PRs #2, #7, #26, #69, #86; issues #16 and #19; active branches and `docs/apex/CHECKPOINT.md`.
- Created focused draft PR #104, branch `fix/cockpit-stale-ship-readout-20261120`.
- Owned paths: `src/ui/screens/cockpitOverlay.ts`, `tests/cockpit-ship-loss.test.ts`, and this checkpoint.
- Reproducible case: cockpit view follows a ship that is removed, destroyed, or escaped; previous HUD instruments and target bracket remain on screen because `update()` returns without clearing them.
- Fix clears stale fields and bracket, resets refresh timer. Three regression cases added, no WebGL required.
- No combat rules, weapon damage, AU balance, saves, model geometry or camera physics modified.
- GitHub check `test` was in progress when inspected; no merge or visual acceptance claimed.
- Local clone unavailable: DNS resolution of github.com fails in this runtime. Browser screenshots, 4K hardware and six-view QA not run.

## Remaining / next
- Wait for PR #104 CI, verify browser POV during ship loss/succession, and merge only when checks green and head mergeable.
- Reconcile #69 large-fleet stack-overflow work and #26 movement work with current base; do not duplicate.
- Issue #16: all 13 P0 visual acceptance boxes still unchecked. Issue #19: combat/camera/hardware acceptance remains open.
- Test deep/asymmetric 3D participation and actual RTX 5090 hardware separately.
