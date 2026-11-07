import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { SHIP_CLASSES } from '@/data/ships';
import { WEAPONS } from '@/data/weapons';
import { getShipTemplate, hasModel } from '@/rendering/ships';
import { CANON_ME3, PRIME_APEX } from '@/timelines/presets';
import { applyRulesToWeapon } from '@/timelines/rules';
import { isShipAllowedInRules } from '@/timelines/lore';

describe('APEX dual Omaha fidelity and canon isolation', () => {
  it('keeps two independent service variants with an actual Cerberus hull', () => {
    const alliance = SHIP_CLASSES.alliance_omaha;
    const blackFleet = SHIP_CLASSES.cerberus_omaha;
    expect(alliance.faction).toBe('alliance');
    expect(blackFleet.faction).toBe('cerberus');
    expect(alliance.lengthM.value).toBe(1800);
    expect(blackFleet.lengthM.value).toBe(1800);
    expect(hasModel(alliance.id)).toBe(true);
    expect(hasModel(blackFleet.id)).toBe(true);
    const a = getShipTemplate(alliance.id);
    const c = getShipTemplate(blackFleet.id);
    expect(a.group.name).not.toEqual(c.group.name);
    expect(a.lengthUnits).toEqual(c.lengthUnits);
    expect(c.engineNodes.length).toBeGreaterThanOrEqual(4);
    expect(c.muzzle?.z).toBeGreaterThan(8);
    const dimensions = new THREE.Box3().setFromObject(c.group).getSize(new THREE.Vector3());
    expect(dimensions.z / dimensions.x).toBeGreaterThan(2.4);
    expect(dimensions.z / dimensions.y).toBeGreaterThan(6);
  });

  it('keeps HADES and Omega weapon events in the authentic damage pipeline', () => {
    const ship = SHIP_CLASSES.cerberus_omaha;
    const weapons = ship.hardpoints.map(m => WEAPONS[m.weaponId]);
    expect(weapons.every(Boolean)).toBe(true);
    expect(ship.hardpoints.some(m => m.weaponId === 'cerberus_hades_spinal')).toBe(true);
    expect(ship.hardpoints.some(m => m.weaponId === 'cerberus_omega_battery')).toBe(true);
    const hades = WEAPONS.cerberus_hades_spinal;
    const canon = applyRulesToWeapon(hades, ship.faction, ship, CANON_ME3, WEAPONS);
    const apex = applyRulesToWeapon(hades, ship.faction, ship, PRIME_APEX, WEAPONS);
    expect(canon.armourBypass).toBe(0);
    expect(canon.barrierEfficiencyMultiplier).toBe(1);
    expect(apex.armourBypass).toBeGreaterThan(0);
    expect(apex.internalWarheadFraction).toBeGreaterThan(0);
    expect(apex.id).toBe('cerberus_hades_spinal');
  });

  it('is not available in canonical Strict Lore', () => {
    expect(isShipAllowedInRules(SHIP_CLASSES.cerberus_omaha, { ...CANON_ME3, strictLore: true })).toBe(false);
    expect(isShipAllowedInRules(SHIP_CLASSES.cerberus_omaha, PRIME_APEX)).toBe(true);
  });
});
