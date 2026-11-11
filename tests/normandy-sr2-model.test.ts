import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { buildAllianceFrigate, buildNormandySR2 } from '@/rendering/ships/alliance';

describe('Normandy SR-2 reference reconstruction', () => {
  it('uses a distinct four-engine hull without replacing conventional frigates', () => {
    const normandy = buildNormandySR2();
    const routed = buildAllianceFrigate(true);
    const ordinary = buildAllianceFrigate(false);
    expect(normandy.lengthUnits).toBe(2.16);
    expect(routed.engineNodes).toHaveLength(4);
    expect(ordinary.engineNodes).toHaveLength(4);
    const shape = new THREE.Box3().setFromObject(normandy.group).getSize(new THREE.Vector3());
    // Reference-estimated envelope: the old 0.79 beam/length triangle was much
    // wider than the SR-2's separated nacelles (roughly 0.45–0.50 in plan).
    expect(shape.z).toBeCloseTo(2.16, 1);
    expect(shape.x / shape.z).toBeGreaterThan(0.44);
    expect(shape.x / shape.z).toBeLessThan(0.50);
    const name = normandy.group.name;
    expect(name).toContain('Normandy SR-2');
    expect(ordinary.group.name).not.toBe(name);
    const meshes = normandy.group.children.filter((m): m is THREE.Mesh => (m as THREE.Mesh).isMesh);
    expect(meshes.map(m => m.name).sort()).toEqual(['accent', 'engine', 'hull', 'hullDark', 'windows']);
    meshes.forEach(mesh => {
      const attribute = mesh.geometry.getAttribute('position') as THREE.BufferAttribute;
      expect(Array.from(attribute.array).every(Number.isFinite)).toBe(true);
    });
    expect(normandy.muzzle!.z).toBeGreaterThan(1);
  });

  it('keeps the gun datum and attaches all four glows to exposed exhaust faces', () => {
    const ship = buildNormandySR2();
    expect(ship.muzzle!.toArray()).toEqual([0, -0.012, 1.068]);
    const exhaust = ship.group.getObjectByName('engine') as THREE.Mesh;
    ship.group.updateMatrixWorld(true);
    for (const node of ship.engineNodes) {
      // Shoot forward from aft through each attachment point: the first hit
      // must be its emissive face, not empty space or the back of an engine.
      const ray = new THREE.Raycaster(node.clone().add(new THREE.Vector3(0, 0, -0.1)), new THREE.Vector3(0, 0, 1));
      const hit = ray.intersectObject(exhaust)[0];
      expect(hit).toBeDefined();
      expect(hit.point.distanceTo(node)).toBeLessThan(0.00001);
    }
    expect(ship.engineNodes[0].y).toBeGreaterThan(ship.engineNodes[1].y);
    expect(ship.engineNodes[0].x).toBe(-ship.engineNodes[2].x);
    expect(ship.engineNodes[1].x).toBe(-ship.engineNodes[3].x);
    const meshes = ship.group.children as THREE.Mesh[];
    const triangles = meshes.reduce((sum, m) => sum + m.geometry.getAttribute('position').count / 3, 0);
    expect(triangles).toBeLessThan(1800);
    // Both fins and all four pod frames survive the existing reduced LOD.
    const structural = new THREE.Group();
    for (const m of meshes) if (['hull', 'hullDark'].includes(m.name)) structural.add(m.clone());
    const size = new THREE.Box3().setFromObject(structural).getSize(new THREE.Vector3());
    expect(size.y).toBeGreaterThan(0.40);
    expect(size.x).toBeGreaterThan(1);
  });
});
