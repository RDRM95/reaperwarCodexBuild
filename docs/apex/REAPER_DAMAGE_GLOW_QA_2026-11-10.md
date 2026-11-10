# Reaper damage response: hot seams, graphite armour (10 November 2026)

Rendering only; nothing reads back into the simulation and no RNG is used.

## Defect, reproduced

The generic damage tint pulses a red-orange emissive on the mesh named `hull` once a ship is below 60 % hull. On the
rebuilt Reaper that mesh is the hood dome, about 3 % of the hull's vertices, so a wounded Reaper showed one bright
orange dome and nothing else: no response on the carapace, plates or limbs. Captured at 12 % hull
(`qa/reaper-damage-20261110/before-after-12-percent-hull.jpg`, left column).

## Change

- `src/rendering/damageGlow.ts`: `reaperDamageGlow(hullFraction, time, phase)` gives the seam colour and intensity
  and a faint armour ember. From 60 % hull down the thin seams between the plates run from pale blue to hot
  red-orange and brighten; past half-way to destruction they flicker irregularly, each ship on its own phase; the
  armour's own emissive never exceeds 0.014, so the plates stay graphite.
- `BattleView.tintDamage` clones, for a Reaper, one material per distinct shared seam and armour material (so one
  damaged hull never changes the fleet's) and updates them every frame; other ships keep the existing hull tint.
  The clones are disposed with the view.

After: the right column of the same image.

`tests/damage-glow.test.ts` pins the steady pale seams above the onset, the monotonic run to red-orange, the ember
ceiling, when the flicker starts, that two ships differ and the same inputs repeat, and that every Reaper template
carries seam and armour meshes under the names the tint looks for.

## Limits

- Hero meshes only; instanced Reapers and the static stand-in seams of distant heroes share the fleet materials
  until the hull is close enough to be a hero (the stand-in seams are cloned too once it is).
- No local light from hits and no breakup of Reaper hulls: the death sequence still removes the hull whole, because
  its meshes sit under one model root and the debris code only takes a visual's direct children.
- Stills from cloud software rendering; the flicker was checked numerically, not judged in motion.
