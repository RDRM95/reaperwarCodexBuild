import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { buildDestinyAscension } from '@/rendering/ships/asari';

describe('Destiny Ascension swept fan geometry', () => {
  it('keeps the broad capital-ship outline in five material meshes', () => {
    const ship = buildDestinyAscension();
    const meshes = ship.group.children.filter((o): o is THREE.Mesh => (o as THREE.Mesh).isMesh);
    expect(meshes.map(o => o.name).sort()).toEqual(['accent', 'engine', 'hull', 'hullDark', 'windows']);
    const bounds = new THREE.Box3().setFromObject(ship.group).getSize(new THREE.Vector3());
    expect(bounds.x).toBeGreaterThan(9);
    expect(bounds.z).toBeGreaterThan(12);
    expect(ship.lengthUnits).toBe(16);
    expect(ship.engineNodes).toHaveLength(1);
    expect(ship.muzzle?.z).toBeGreaterThan(7);
    meshes.forEach(mesh => {
      const vertices = mesh.geometry.getAttribute('position') as THREE.BufferAttribute;
      expect(Array.from(vertices.array).every(Number.isFinite)).toBe(true);
    });
  });
});
