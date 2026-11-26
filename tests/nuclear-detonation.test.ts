import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { WEAPONS } from '@/data/weapons';
import {
  DETONATION_PARTS, FLASH_SECONDS, NuclearDetonations, PENETRATION_DELAY, TIER_PAYLOAD, cloudReach, detonationTier, planDetonation, vapourBrightness, vapourColour, type DetonationMoment,
} from '@/rendering/nuclear';
import { buildCustomBattle } from '@/scenarios';
import { BattleSimulation } from '@/simulation/battle';
import { getPreset } from '@/timelines/presets';
import { applyRulesToWeapon } from '@/timelines/rules';
import { SHIP_CLASSES } from '@/data/ships';

/**
 * Owner's brief, 26 Nov 2026, sections 3 to 5: nuclear detonations with an identity of their own in vacuum (flash,
 * luminous vapour that cools fast, light on hulls, exposure, fragments where something was struck; no mushroom
 * cloud, smoke or blast wave); an external warhead and a penetrator's warhead told apart by what the simulation
 * says happened; a hierarchy of weapons that is not one explosion at several sizes; no yield or damage invented.
 *
 * Before: a HADES detonation was one white sprite, a ring of the kind used for a shock wave, ten sparks and three
 * puffs of smoke, the same at every weight but for its size, drawn at the instant of the strike at the hull's
 * centre. There was no external nuclear detonation at all.
 */
const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);

describe('what a detonation is, from the simulation’s own figures', () => {
  // The share of a round the simulation reserves for its warhead under HADES rules.
  const prime = getPreset('prime_apex');
  const payload = (weaponId: string, classId: string): number => {
    const w = applyRulesToWeapon(WEAPONS[weaponId], 'alliance', SHIP_CLASSES[classId], prime, WEAPONS);
    return w.damage * (w.internalWarheadFraction ?? 0);
  };

  it('its tier comes from the warhead’s damage, and the real guns fall in the order of their weight', () => {
    expect(detonationTier(0)).toBe(0);
    TIER_PAYLOAD.forEach((from, i) => { expect(detonationTier(from - 1)).toBe(i); expect(detonationTier(from)).toBe(i + 1); });
    const ladder = [payload('alliance_frigate_main', 'alliance_frigate'), payload('alliance_broadside', 'alliance_dreadnought'), payload('apex_hyper_ma', 'alliance_dreadnought'),
      payload('cerberus_hades_spinal', 'alliance_dreadnought'), payload('aegis_nova_command', 'alliance_dreadnought'), payload('valkyrie_nova', 'alliance_dreadnought'), payload('kronos_lance', 'alliance_dreadnought')];
    for (const p of ladder) expect(p).toBeGreaterThan(0);
    const tiers = ladder.map(detonationTier);
    expect([...tiers].sort((a, b) => a - b)).toEqual(tiers);
    // An escort's round, a battery's, a dreadnought's spinal gun, the HADES gun, the Aegis gun, a NOVA round, a KRONOS round.
    expect(tiers[0]).toBe(0);
    expect(tiers[2]).toBe(2);
    expect(tiers[3]).toBe(2);
    expect(tiers[4]).toBe(3);
    expect(tiers[5]).toBe(4);
    expect(tiers[6]).toBe(4);
    // Nothing here is a yield: canon rounds carry no warhead and are no detonation at all.
    const canon = applyRulesToWeapon(WEAPONS.alliance_dn_main, 'alliance', SHIP_CLASSES.alliance_dreadnought, getPreset('canon_me3'), WEAPONS);
    expect(canon.internalWarheadFraction ?? 0).toBe(0);
  });

  it('tiers of a penetrator differ in what happens, not only in how large it is drawn', () => {
    const plans = [25, 112, 1100, 13_300, 50_750].map((p) => planDetonation('internal', p, 20, p));
    expect(plans.map((p) => p.tier)).toEqual([0, 1, 2, 3, 4]);
    // A glint; shafts of light; light on other hulls and the exposure answering; a streak and the camera knocked; pulses and vapour out of the far side.
    expect(plans.map((p) => p.rays.count)).toEqual([0, 2, 4, 6, 9]);
    expect(plans.map((p) => p.light.intensity > 0)).toEqual([false, false, true, true, true]);
    expect(plans.map((p) => p.exposure.dip > 0)).toEqual([false, false, true, true, true]);
    expect(plans.map((p) => p.streak)).toEqual([false, false, false, true, true]);
    expect(plans.map((p) => p.pulses)).toEqual([1, 1, 1, 2, 3]);
    expect(plans.map((p) => !!p.cloud)).toEqual([false, false, false, false, true]);
    expect(plans.map((p) => p.ember > 0)).toEqual([false, true, true, true, true]);
    for (let i = 1; i < plans.length; i++) {
      expect(plans[i].delay).toBeGreaterThan(plans[i - 1].delay);
      expect(plans[i].radius).toBeGreaterThan(plans[i - 1].radius);
      expect(plans[i].shake).toBeGreaterThanOrEqual(plans[i - 1].shake);
    }
    // A beat after the strike, always: never at the instant of it.
    for (const p of plans) { expect(p.delay).toBeGreaterThanOrEqual(0.1); expect(p.delay).toBeLessThan(0.3); expect(p.delay).toBe(PENETRATION_DELAY[p.tier]); }
    // Size is the logarithm of the damage: a round with 2,000 times the warhead is drawn about five times as large, not 2,000.
    expect(plans[4].radius / plans[0].radius).toBeGreaterThan(3);
    expect(plans[4].radius / plans[0].radius).toBeLessThan(8);
  });

  it('a warhead inside a hull is never drawn larger than the hull lets it be, and throws no fragments where no hull was reached', () => {
    const inFrigate = planDetonation('internal', 50_750, 1.7, 1000), inReaper = planDetonation('internal', 50_750, 20, 1000);
    expect(inFrigate.radius).toBeLessThanOrEqual(1.7 * 0.5 + 1e-9);
    expect(inReaper.radius).toBeGreaterThan(inFrigate.radius);
    expect(planDetonation('internal', 1100, 20, 0).fragments.count).toBe(0);
    expect(planDetonation('internal', 1100, 20, 300).fragments.count).toBeGreaterThan(0);
    expect(planDetonation('external', 10_500, 20, 0).fragments.count).toBe(0);
    expect(planDetonation('external', 10_500, 20, 300).fragments.count).toBeGreaterThan(0);
  });

  it('an external warhead is a different thing: at once, in the open, a cloud of vapour and its front, a deeper dip in the exposure', () => {
    const outside = planDetonation('external', 10_500, 20, 400), inside = planDetonation('internal', 10_500, 20, 400);
    expect(outside.delay).toBe(0);
    expect(outside.rays.count).toBe(0);
    expect(outside.cloud).toMatchObject({ shell: true });
    expect(outside.cloud!.life).toBeLessThan(3); // cooled and gone in a couple of seconds: no fire that lingers
    expect(outside.ember).toBe(0);
    expect(outside.flash.radius).toBeGreaterThan(inside.flash.radius * 2);
    expect(outside.exposure.dip).toBeGreaterThan(inside.exposure.dip);
    expect(outside.streak).toBe(true);
    // The two weapons that carry one, and what they are in the simulation: missiles, with the damage they always had.
    const marked = Object.values(WEAPONS).filter((w) => w.warhead === 'nuclear');
    expect(marked.map((w) => w.id).sort()).toEqual(['skynet_missile', 'wh_torpedo']);
    for (const w of marked) { expect(w.kind).toBe('missile'); expect(w.damageType).toBe('warhead'); }
    expect(WEAPONS.wh_torpedo.damage).toBe(10_500);
    expect(WEAPONS.skynet_missile.damage).toBe(480);
  });

  it('vapour cools from white through yellow and orange to a dull red, and its light falls away fast', () => {
    const [r1, g1, b1] = vapourColour(1), [r0, g0, b0] = vapourColour(0), [rm, gm, bm] = vapourColour(0.45);
    expect(b1).toBeGreaterThan(r1); // white with a little blue
    expect(g1).toBeGreaterThan(0.9);
    expect(rm).toBeGreaterThan(gm); expect(gm).toBeGreaterThan(bm); // orange
    expect(r0).toBeGreaterThan(g0 * 5); expect(r0).toBeLessThan(0.3); // dull red
    for (let h = 0; h < 1; h += 0.05) expect(vapourColour(h + 0.05)[1]).toBeGreaterThanOrEqual(vapourColour(h)[1] - 1e-9);
    expect(vapourBrightness(0)).toBe(1);
    expect(vapourBrightness(0.5)).toBeLessThan(0.25);
    expect(vapourBrightness(1)).toBe(0);
    // The cloud runs out fast and slows: three quarters of the way in the first third of its life.
    expect(cloudReach(0)).toBeCloseTo(0.12, 6);
    expect(cloudReach(1)).toBeCloseTo(1, 6);
    expect(cloudReach(0.33)).toBeGreaterThan(0.7);
    expect(FLASH_SECONDS).toBeLessThan(0.15);
  });
});

describe('drawing them', () => {
  it('a penetrator’s warhead goes off a beat after its strike, inside the hull and with the hull, and is over in seconds', () => {
    const fx = new NuclearDetonations(), plan = planDetonation('internal', 1100, 20, 400);
    const hull = V(100, 0, 50), seen: DetonationMoment[] = [];
    fx.onDetonation = (m) => seen.push(m);
    fx.detonate(plan, V(102, 0, 50), V(1, 0, 0), V(), () => hull);
    expect(fx.liveParts).toBe(0);
    expect(fx.waiting).toBe(1);
    fx.update(plan.delay - 0.02);
    expect(seen).toHaveLength(0);
    // The hull moves on in the meantime: the warhead is where the hull now is.
    hull.set(140, 5, 50);
    fx.update(0.04);
    expect(seen).toHaveLength(1);
    expect(seen[0].position.distanceTo(V(142, 5, 50))).toBeLessThan(1e-6);
    // Core, ember and four shafts: one mesh for what is in the open, one for light inside hulls.
    expect(fx.liveParts).toBe(1 + 1 + plan.rays.count);
    expect(fx.group.children).toHaveLength(2);
    // The shafts break out over a few hundredths of a second, not all at one instant.
    for (let i = 0; i < 5; i++) fx.update(0.02);
    const [open, inside] = fx.group.children as THREE.Mesh<THREE.InstancedBufferGeometry, THREE.ShaderMaterial>[];
    expect(open.geometry.instanceCount).toBe(plan.rays.count);
    expect(inside.geometry.instanceCount).toBe(2);
    expect(inside.material.depthTest).toBe(false);
    expect(open.material.depthTest).toBe(true);
    for (const mesh of [open, inside]) { expect(mesh.material.blending).toBe(THREE.AdditiveBlending); expect(mesh.material.depthWrite).toBe(false); }
    for (let t = 0; t < plan.ember + 1; t += 0.05) fx.update(0.05);
    expect(fx.liveParts).toBe(0);
    expect(open.geometry.instanceCount + inside.geometry.instanceCount).toBe(0);
  });

  it('light inside a hull goes with the hull: once the hull is gone from the picture it is not drawn', () => {
    const fx = new NuclearDetonations();
    let hull: THREE.Vector3 | undefined = V(10, 0, 0);
    fx.detonate(planDetonation('internal', 13_300, 20, 400), V(11, 0, 0), V(1, 0, 0), V(), () => hull);
    fx.update(0.3);
    const drawn = (fx.group.children as THREE.Mesh<THREE.InstancedBufferGeometry>[]).reduce((n, m) => n + m.geometry.instanceCount, 0);
    expect(drawn).toBeGreaterThan(3);
    hull = undefined;
    fx.update(0.02);
    expect((fx.group.children as THREE.Mesh<THREE.InstancedBufferGeometry>[]).reduce((n, m) => n + m.geometry.instanceCount, 0)).toBe(0);
  });

  it('an external warhead is drawn at once, in the open, off the surface that stopped it', () => {
    const fx = new NuclearDetonations(), plan = planDetonation('external', 10_500, 20, 0), seen: DetonationMoment[] = [];
    fx.onDetonation = (m) => seen.push(m);
    fx.detonate(plan, V(0, 0, 0), V(0, 0, -3), V());
    fx.update(0.016);
    expect(seen).toHaveLength(1);
    expect(seen[0].outward.length()).toBeCloseTo(1, 6);
    // Flash, streak, cloud and its front; nothing drawn through a hull.
    expect(fx.liveParts).toBe(4);
    const [open, inside] = fx.group.children as THREE.Mesh<THREE.InstancedBufferGeometry>[];
    expect(open.geometry.instanceCount).toBe(4);
    expect(inside.geometry.instanceCount).toBe(0);
    const centre = open.geometry.getAttribute('centre') as THREE.InstancedBufferAttribute;
    expect(centre.getZ(0)).toBeLessThan(0); // on the side it came from
    fx.update(FLASH_SECONDS * 3);
    expect(fx.liveParts).toBe(2); // the flash and the streak are gone; the vapour is not
    for (let t = 0; t < 3; t += 0.05) fx.update(0.05);
    expect(fx.liveParts).toBe(0);
  });

  it('a detonation a few pixels across is its flash alone', () => {
    const fx = new NuclearDetonations(), seen: DetonationMoment[] = [];
    fx.onDetonation = (m) => seen.push(m);
    fx.detonate(planDetonation('internal', 50_750, 20, 400), V(), V(1, 0, 0), V(), undefined, 0);
    fx.update(0.3);
    expect(fx.liveParts).toBe(1);
    expect(seen[0].plan.fragments.count).toBe(0);
    expect(seen[0].plan.tier).toBe(4); // still what it is: its light, its sound and the exposure are not reduced by distance here
  });

  it('a thousand at once are still two draw calls, and the batch is never overrun', () => {
    const fx = new NuclearDetonations();
    for (let i = 0; i < 1000; i++) fx.detonate(planDetonation('internal', i % 5 === 0 ? 13_300 : 1100, 20, 400), V(i, 0, 0), V(1, 0, 0), V());
    fx.update(0.25);
    expect(fx.stats.detonations).toBe(1000);
    expect(fx.liveParts).toBeLessThanOrEqual(DETONATION_PARTS + 96);
    expect(fx.stats.dropped).toBeGreaterThan(0);
    const [open, inside] = fx.group.children as THREE.Mesh<THREE.InstancedBufferGeometry>[];
    expect(open.geometry.instanceCount).toBeLessThanOrEqual(DETONATION_PARTS);
    expect(inside.geometry.instanceCount).toBeLessThanOrEqual(128);
    expect(fx.group.children).toHaveLength(2);
    fx.clear();
    expect(fx.liveParts).toBe(0);
    expect(fx.waiting).toBe(0);
  });

  it('the reduced-flash setting dims flashes and streaks and leaves the vapour as it is', () => {
    const run = (scale: number): number[] => {
      const fx = new NuclearDetonations();
      fx.flashScale = scale;
      fx.detonate(planDetonation('external', 10_500, 20, 0), V(), V(0, 0, -1), V());
      fx.update(0.016);
      const state = (fx.group.children[0] as THREE.Mesh<THREE.InstancedBufferGeometry>).geometry.getAttribute('state') as THREE.InstancedBufferAttribute;
      return [0, 1, 2, 3].map((i) => state.getW(i));
    };
    const full = run(1), reduced = run(0.3);
    expect(reduced[0]).toBeCloseTo(full[0] * 0.3, 5); // flash
    expect(reduced[1]).toBeCloseTo(full[1] * 0.3, 5); // streak
    expect(reduced[2]).toBeCloseTo(full[2], 5); // cloud
    expect(reduced[3]).toBeCloseTo(full[3], 5); // its front
  });
});

describe('in the effects system and the battle', () => {
  it('the simulation says where the round went in, and only for a round that reached the hull', () => {
    const sim = new BattleSimulation(buildCustomBattle({ seed: 11, rulesId: 'prime_apex', environment: 'deep_space', startingDistanceKm: 40, maxDuration: 60,
      sideA: { faction: 'alliance', name: 'A', formation: 'line_abreast', counts: { alliance_dreadnought: 4, alliance_cruiser: 6 } },
      sideB: { faction: 'reaper', name: 'B', formation: 'line_abreast', counts: { reaper_capital: 1, reaper_destroyer: 2 } } } as never));
    while (!sim.finished && sim.time < 60) sim.step();
    const detonations = sim.events.filter((e) => e.type === 'hades_detonation'), impacts = sim.events.filter((e) => e.type === 'projectile_impact');
    expect(detonations.length).toBeGreaterThan(5);
    for (const d of detonations) {
      if (d.type !== 'hades_detonation') continue;
      expect(d.entry).toBeDefined();
      // Nothing more to destroy where the round itself had already destroyed the hull.
      expect(d.internalDamage).toBeGreaterThanOrEqual(0);
      expect(d.payloadDamage).toBeGreaterThan(0);
      // The same instant as an impact on the same hull that reached its hull.
      const strike = impacts.find((i) => i.type === 'projectile_impact' && i.t === d.t && i.targetId === d.targetId && i.shipId === d.shipId && i.hullDamage > 0);
      expect(strike, `detonation at ${d.t}`).toBeDefined();
    }
    // Never more detonations than rounds that reached a hull, and every impact says which gun it was.
    expect(detonations.length).toBeLessThanOrEqual(impacts.filter((i) => i.type === 'projectile_impact' && i.hullDamage > 0).length);
    for (const i of impacts) if (i.type === 'projectile_impact') expect(i.weaponId).toBeDefined();
  });
});
