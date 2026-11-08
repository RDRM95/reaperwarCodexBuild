import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { buildQuarianCruiser } from '@/rendering/ships/quarian';

describe('Quarian cruiser reference silhouette', () => {
  it('has a structural transverse annulus and keeps fleet material batching', () => {
    const cruiser = buildQuarianCruiser();
    const meshes = cruiser.group.children.filter((c): c is THREE.Mesh => (c as THREE.Mesh).isMesh);
    expect(meshes).toHaveLength(5);
    expect(meshes.map(m => m.name).sort()).toEqual(['accent', 'engine', 'hull', 'hullDark', 'windows']);
    const bounds = new THREE.Box3().setFromObject(cruiser.group).getSize(new THREE.Vector3());
    expect(bounds.x).toBeGreaterThan(2);
    expect(bounds.y).toBeGreaterThan(2);
    expect(bounds.z).toBeGreaterThan(4);
    for (const mesh of meshes) {
      const pos = mesh.geometry.getAttribute('position') as THREE.BufferAttribute;
      expect(Array.from(pos.array).every(Number.isFinite)).toBe(true);
    }
    expect(cruiser.engineNodes).toHaveLength(2);
    expect(cruiser.muzzle?.z).toBeGreaterThan(2);
  });
});
