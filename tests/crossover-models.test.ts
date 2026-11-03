import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { getShipTemplate, hasModel, instantiateShip } from '@/rendering/ships';

const entries = [
  ['unsc_marathon', 11.70], ['unsc_infinity', 56.94], ['covenant_ccs', 17.82], ['covenant_cas', 53.47],
  ['imperium_lunar', 50], ['imperium_retribution', 80], ['chaos_murder', 50], ['chaos_desolator', 75],
] as const;

describe('original crossover hull stand-ins', () => {
  it.each(entries)('%s has a finite catalogue-sized hull and attached weapon/engine markers', (id, length) => {
    expect(hasModel(id)).toBe(true);
    const ship = getShipTemplate(id);
    const box = new THREE.Box3().setFromObject(ship.group), size = box.getSize(new THREE.Vector3());
    expect(ship.lengthUnits).toBe(length);
    expect(size.z).toBeCloseTo(length, 4);
    expect(size.x).toBeGreaterThan(length * 0.10); expect(size.x).toBeLessThan(length);
    expect(size.y).toBeGreaterThan(length * 0.04); expect(size.y).toBeLessThan(length * 0.5);
    expect(ship.group.children).toHaveLength(5);
    expect(ship.engineNodes.length).toBeGreaterThanOrEqual(3);
    const tolerance = length * 0.005;
    const markerBox = box.clone().expandByScalar(tolerance);
    for (const point of [...ship.engineNodes, ship.muzzle!]) {
      expect(Number.isFinite(point.x + point.y + point.z)).toBe(true);
      expect(markerBox.containsPoint(point)).toBe(true);
    }
    for (const engine of ship.engineNodes) expect(engine.z).toBeLessThan(-length * 0.25);
    ship.group.traverse(object => {
      const mesh = object as THREE.Mesh;
      if (!mesh.isMesh) return;
      for (const key of ['position', 'normal']) expect(Array.from(mesh.geometry.attributes[key].array).every(Number.isFinite)).toBe(true);
      expect(mesh.geometry.attributes.position.count).toBeLessThan(20000);
    });
  });

  it('families keep distinct broad/industrial/gothic/jagged silhouettes at the same viewing scale', () => {
    const shape = (id: string) => {
      const ship = getShipTemplate(id), size = new THREE.Box3().setFromObject(ship.group).getSize(new THREE.Vector3());
      return { width: size.x / size.z, height: size.y / size.z, engines: ship.engineNodes.length };
    };
    const unsc = shape('unsc_marathon'), covenant = shape('covenant_ccs'), imperial = shape('imperium_lunar'), chaos = shape('chaos_murder');
    expect(covenant.width).toBeGreaterThan(unsc.width * 1.5);
    expect(imperial.height).toBeGreaterThan(covenant.height * 1.8);
    expect(chaos.width).toBeGreaterThan(imperial.width * 1.2);
    expect(shape('unsc_infinity').engines).toBeGreaterThan(unsc.engines);
    expect(shape('imperium_retribution').engines).toBeGreaterThan(imperial.engines);
  });

  it('instances share cached geometry while keeping transforms and marker vectors independent', () => {
    const a = instantiateShip('covenant_cas'), b = instantiateShip('covenant_cas');
    expect(a.group).not.toBe(b.group);
    expect((a.group.children[0] as THREE.Mesh).geometry).toBe((b.group.children[0] as THREE.Mesh).geometry);
    const before = b.engineNodes[0].clone(), muzzle = b.muzzle!.clone();
    a.engineNodes[0].set(100, 100, 100); a.muzzle!.set(100, 100, 100); a.group.position.set(50, 50, 50);
    expect(b.engineNodes[0]).toEqual(before); expect(b.muzzle).toEqual(muzzle); expect(b.group.position.length()).toBe(0);
  });
});
