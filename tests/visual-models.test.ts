import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { getShipTemplate, instantiateShip } from '@/rendering/ships';
import { buildAllianceDreadnought, buildAllianceOmaha } from '@/rendering/ships/alliance';
import { buildHarbinger, buildReaperCapital } from '@/rendering/ships/reaper';
import { buildBarrierGeometry, HullBarriers } from '@/rendering/barriers';

const bounds = (group: THREE.Group) => new THREE.Box3().setFromObject(group).getSize(new THREE.Vector3());

describe('original hull silhouettes and impact shells', () => {
  it.each([['reaper_capital', 20], ['reaper_destroyer', 1.6], ['harbinger', 24]] as const)('%s render size agrees with its catalogue length', (id, length) => {
    const built = getShipTemplate(id);
    expect(built.lengthUnits).toBe(length);
    expect(bounds(built.group).z).toBeCloseTo(length, 4);
    expect(built.muzzle!.z).toBeGreaterThan(-length / 2);
    expect(built.muzzle!.z).toBeLessThan(length / 2);
    built.group.traverse(object => {
      const mesh = object as THREE.Mesh;
      if (!mesh.isMesh) return;
      for (const attribute of [mesh.geometry.attributes.position, mesh.geometry.attributes.normal]) {
        expect(Array.from(attribute.array).every(Number.isFinite)).toBe(true);
      }
    });
  });

  it('Omaha has a distinct six-engine heavy hull, retaining the narrow long spinal silhouette', () => {
    const ordinary = buildAllianceDreadnought(), omaha = buildAllianceOmaha();
    expect(ordinary.engineNodes).toHaveLength(4);
    expect(omaha.engineNodes).toHaveLength(6);
    for (const ship of [ordinary, omaha]) {
      const size = bounds(ship.group);
      expect(size.z / size.x).toBeGreaterThan(3);
      expect(size.z / size.y).toBeGreaterThan(6);
      expect(ship.muzzle!.z).toBeGreaterThan(ship.lengthUnits * 0.4);
      expect(ship.engineNodes.every(p => p.z < 0)).toBe(true);
      expect(ship.group.children.filter(c => (c as THREE.Mesh).isMesh)).toHaveLength(5);
    }
    const before = bounds(ordinary.group).clone();
    omaha.group.traverse(o => { if ((o as THREE.Mesh).isMesh) (o as THREE.Mesh).geometry.scale(2, 2, 2); });
    expect(bounds(ordinary.group)).toEqual(before);
  });

  it('Harbinger illumination does not repaint ordinary Reapers', () => {
    const normal = buildReaperCapital();
    const before = (normal.group.getObjectByName('eye') as THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>).material.emissive.getHex();
    const boss = buildHarbinger();
    const bossColour = (boss.group.getObjectByName('eye') as THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>).material.emissive.getHex();
    expect(bossColour).not.toBe(before);
    expect((normal.group.getObjectByName('eye') as THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>).material.emissive.getHex()).toBe(before);
  });

  it('barrier shells retain the long hull shape without modifying shared template geometry', () => {
    const template = getShipTemplate('alliance_dreadnought');
    const before = bounds(template.group).clone();
    const geometry = buildBarrierGeometry(template);
    const size = geometry.boundingBox!.getSize(new THREE.Vector3());
    expect(size.z / size.x).toBeGreaterThan(3);
    expect(size.z).toBeGreaterThan(before.z);
    expect(bounds(template.group)).toEqual(before);
    geometry.dispose();
  });

  it('impact shells follow live rotations, reuse a hull cache and expire cleanly', () => {
    const barriers = new HullBarriers(), scene = new THREE.Scene();
    scene.add(barriers.group);
    const ship = instantiateShip('alliance_dreadnought').group;
    scene.add(ship);
    barriers.hit('ship', 'alliance_dreadnought', ship, new THREE.Vector3(0, 0, 3), 500);
    expect(barriers.activeCount).toBe(1);
    expect(barriers.cachedClasses).toBe(1);
    ship.position.set(4, 2, 1); ship.rotation.y = Math.PI / 2;
    barriers.update(0.1);
    expect(barriers.group.children[0].matrix.elements).toEqual(ship.matrixWorld.elements);
    barriers.hit('ship', 'alliance_dreadnought', ship, new THREE.Vector3(4, 2, 4), 1000);
    expect(barriers.activeCount).toBe(1);
    barriers.update(1);
    expect(barriers.activeCount).toBe(0);
    expect(barriers.group.children).toHaveLength(0);
    barriers.dispose();
    expect(barriers.cachedClasses).toBe(0);
    expect(bounds(ship).z).toBeGreaterThan(1);
  });
});
