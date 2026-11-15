# Oculus interceptor damage — 10 November 2026

## Reproduction and cause

Select Reaper Annihilation (`reaper_hardcore`) and compare the effective Oculus
weapon with Canon ME3. `applyRulesToWeapon` applied both fighter technology and
the 1.4 ship-beam multiplier to the anti-small interceptor beam. The existing
capital one-shot helper already excluded Oculus hulls and weapons; that was
not the cause, and its capital-gun behavior is retained.

| Weapon | Canon | Annihilation before | Annihilation after |
| --- | ---: | ---: | ---: |
| Oculus raw beam damage/s | 26 | 36.4 | 26 |
| Oculus 0.85 s raw burst budget | 22.1 | 30.94 | 22.1 |
| Capital Reaper raw beam damage/s, per emitter | 1900 | 2660 | 2660 |

These are simulation estimates before barriers, armour, accuracy and glancing
hits, not canonical energy yields. The capital Annihilation kill override is
additional to this table. Oculus remains a dangerous interceptor, not a small
capital gun. Its explicit `fighterStrength` upgrade still works. Organic Thanix
and ship-scale Reaper beam upgrades still work. No saved fields or schemas change.

The licensed [ME2 endgame guide](https://primagames.com/eguides/mass-effect-2-eguide/walkthrough/walkthrough/endgame)
describes Oculus attacks on Normandy and the boarding encounter. This supports
a threatening interceptor, but provides no numerical damage ratio; the separation
above is a balance decision, not a claim of exact lore statistics.

## Verification

- Before the change, the new Codex regression tests produced six failures and
  one pass: the effective pulse and actual landed bursts received the extra boost.
- After the change, all **357 Codex unit tests** pass; TypeScript/production build
  passes. Seven new tests cover presets, explicit upgrades, the capital-only
  override, and actual landed 0.85 s bursts against fighter, frigate, cruiser and
  dreadnought targets through `BattleSimulation.step()` and its damage pipeline.
  The landed-hit fixture holds both hulls and unrelated batteries; each target
  survives with nonzero damage and equal Canon/Annihilation damage for that burst.
- Browser Oculus fixtures cover APEX and Annihilation, each with seeds 7, 42 and
  1337: actual targeting, movement and fire, eight original fighters, effective
  pulse damage 26, followed-ship optic captures. Parent batteries and further
  launches are held to isolate the encounter. No fabricated combat events.
- Software-rendered cloud Chromium/SwiftShader is used for browser checks. No
  local RTX 5090 result or GPU frame-rate claim is made.

Run `node --import tsx/esm scripts/oculus-damage-qa.ts` for a reproducible 30 s
four-Trident/four-Oculus probe with real fighter AI and hit rolls. Parent guns
and launches are held. Measured Oculus damage dealt:

| Seed | Canon before/after | Annihilation before | Annihilation after |
| --- | ---: | ---: | ---: |
| 7 | 105.291 | 204.382 | 145.987 |
| 42 | 134.581 | 221.173 | 157.981 |
| 1337 | 112.276 | 247.205 | 176.575 |

All four Tridents survive these 30 s probes, before and after. Oculus survivors
are unchanged: Canon 1/1/0; Annihilation 1/1/2. The fix removes a real multiplier
stack; this sample does not establish that Oculus was previously capital-lethal
or that every full-battle outcome is balanced. Annihilation retains its other
accuracy, sensor and tactical bonuses, so natural encounters need not equal Canon.
