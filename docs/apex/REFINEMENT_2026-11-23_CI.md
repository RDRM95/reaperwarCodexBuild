# APEX refinement checkpoint — 23 November 2026

## Owned work
- Active repository: RDRM95/reaperwarCodexBuild. Retired sandbox not touched.
- Branch `fix/ci-pin-ubuntu24-playwright-20261123`, draft PR #105.
- Changed `.github/workflows/ci.yml`: `ubuntu-latest` -> `ubuntu-24.04` to avoid Playwright 1.56.1 unsupported Ubuntu 26.04 Chromium installation.
- This document is the only other owned path. No simulation or renderer modifications.

## Reproduction and evidence
- PR #104 head 8087e47: workflow runs 44646504143 and 44646504324 fail at Chromium installation, not the application browser tests.
- Job logs report `Playwright does not support chromium on ubuntu26.04-x64` with Playwright 1.56.1, including fallback install.
- PR #69 head fb9e3df: CI and reference-and-fleet workflow both succeeded, but PR remains draft and needs current-base review.
- Issues #16 and #19 remain open; all P0 six-view acceptance and physical GPU evidence still outstanding.
- PR #26 remains a separate conflicting movement branch; concurrent P1 controllers must be reconciled.

## Gates and next concrete task
1. Verify PR #105's new CI run installs Chromium and passes E2E. Fix separate reference-and-fleet workflow runner only after locating its current source and checking ownership.
2. Re-run PR #104 on a supported runner after CI fix merges; test missing/dead/escaped ship HUD plus browser POV and succession.
3. Reconcile #69 against current base and review before merging. Do not infer hardware performance from software rendering.
4. Keep Valkyrie AU specifications unchanged and never publish private references.
