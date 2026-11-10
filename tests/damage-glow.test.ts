import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { DAMAGE_ONSET, REAPER_ARMOUR_MESHES, REAPER_SEAM_MESHES, damageLevel, reaperDamageGlow } from '@/rendering/damageGlow';
import { getShipTemplate } from '@/rendering/ships';

describe('Reaper damage glow', () => {
  it('an intact or lightly damaged hull keeps pale, steady seams and no ember', () => {
    for (const hull of [1, 0.8, DAMAGE_ONSET]) {
      const a = reaperDamageGlow(hull, 3, 1.2), b = reaperDamageGlow(hull, 47.5, 1.2);
      expect(a.ember).toBe(0);
      expect(a.seam.getHex()).toBe(0x7fb4ff);
      expect(a.seamIntensity).toBeCloseTo(b.seamIntensity, 9);
    }
    expect(damageLevel(1)).toBe(0);
    expect(damageLevel(0)).toBe(1);
  });

  it('the seams run from pale blue to hot red-orange as the hull fails, monotonically', () => {
    let lastRed = -1, lastBlue = 2;
    for (let hull = DAMAGE_ONSET; hull >= 0; hull -= 0.05) {
      const g = reaperDamageGlow(hull, 0, 0);
      expect(g.seam.r).toBeGreaterThanOrEqual(lastRed);
      expect(g.seam.b).toBeLessThanOrEqual(lastBlue);
      lastRed = g.seam.r; lastBlue = g.seam.b;
    }
    const dying = reaperDamageGlow(0, 0, 0);
    expect(dying.seam.r).toBeGreaterThan(0.9);
    expect(dying.seam.b).toBeLessThan(0.05);
  });

  it('the armour never becomes a lantern: the ember stays faint', () => {
    for (let hull = 1; hull >= 0; hull -= 0.02) expect(reaperDamageGlow(hull, 12, 0.4).ember).toBeLessThanOrEqual(0.014);
    expect(reaperDamageGlow(0.1, 0, 0).ember).toBeGreaterThan(0.005);
  });

  it('flicker starts only past half-way to destruction, differs between ships and repeats for the same inputs', () => {
    const steady = Array.from({ length: 40 }, (_, i) => reaperDamageGlow(0.35, i * 0.13, 2).seamIntensity);
    expect(Math.max(...steady) - Math.min(...steady)).toBeLessThan(1e-9);
    const failing = Array.from({ length: 80 }, (_, i) => reaperDamageGlow(0.08, i * 0.13, 2).seamIntensity);
    expect(Math.max(...failing) - Math.min(...failing)).toBeGreaterThan(0.3);
    expect(Math.min(...failing)).toBeGreaterThan(0.9); // dims, never goes dark
    const other = Array.from({ length: 80 }, (_, i) => reaperDamageGlow(0.08, i * 0.13, 4.4).seamIntensity);
    expect(other).not.toEqual(failing);
    expect(Array.from({ length: 80 }, (_, i) => reaperDamageGlow(0.08, i * 0.13, 2).seamIntensity)).toEqual(failing);
  });

  it('every Reaper template has seam and armour meshes under the names the tint looks for', () => {
    for (const classId of ['reaper_capital', 'harbinger', 'reaper_destroyer']) {
      const names = new Set<string>();
      getShipTemplate(classId).group.traverse((o) => { if ((o as THREE.Mesh).isMesh) names.add(o.name); });
      expect([...names].some(n => REAPER_SEAM_MESHES.has(n)), classId + ' seams').toBe(true);
      expect(names.has('carapace') && REAPER_ARMOUR_MESHES.has('carapace')).toBe(true);
    }
  });
});
