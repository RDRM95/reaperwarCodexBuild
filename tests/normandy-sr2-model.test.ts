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
    expect(shape.z).toBeGreaterThan(2);
    expect(shape.x).toBeGreaterThan(1.4);
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
});
