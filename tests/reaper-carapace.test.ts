import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { DETAIL_MESH_NAMES } from '@/rendering/lod';
import { getShipTemplate } from '@/rendering/ships';

/**
 * Contract of the rebuilt Reaper hulls (docs/apex/REAPER_VISUAL_QA_2026-11-10.md): the carapace, hood and limb
 * armour are structural, so they survive the reduced level of detail and instanced batches; the catalogue lengths
 * and the weapon and engine attachment points are where the simulation, the beam code and the glow sprites expect
 * them (values measured on the hulls before the rebuild); and the triangle budget stays bounded.
 */
const EXPECTED: Record<string, { length: number; muzzle: [number, number, number]; engine: [number, number, number]; maxTriangles: number }> = {
  reaper_capital: { length: 20, muzzle: [0, -1.223, -0.219], engine: [0, 0, -9.928], maxTriangles: 14_000 },
  harbinger: { length: 24, muzzle: [0, -1.678, -0.224], engine: [0, 0, -11.85], maxTriangles: 15_000 },
  reaper_destroyer: { length: 1.6, muzzle: [0, -0.196, 0.028], engine: [0, 0, -0.765], maxTriangles: 11_500 },
};

function shown(classId: string): { triangles: number; structural: number; detail: number; names: Set<string>; materials: number } {
  const template = getShipTemplate(classId);
  let triangles = 0, structural = 0, detail = 0;
  const names = new Set<string>(), materials = new Set<string>();
  template.group.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if (!mesh.isMesh) return;
    for (let o: THREE.Object3D | null = mesh; o && o !== template.group; o = o.parent) if (!o.visible) return;
    const n = mesh.geometry.attributes.position.count;
    triangles += (mesh.geometry.index ? mesh.geometry.index.count : n) / 3;
    names.add(mesh.name);
    materials.add((mesh.material as THREE.Material).uuid);
    if (DETAIL_MESH_NAMES.has(mesh.name)) detail += n;
    else structural += n;
  });
  return { triangles, structural, detail, names, materials: materials.size };
}

describe('rebuilt Reaper hulls', () => {
  for (const [classId, want] of Object.entries(EXPECTED)) {
    it(`${classId}: catalogue length, attachment points and triangle budget`, () => {
      const template = getShipTemplate(classId);
      expect(template.lengthUnits).toBe(want.length);
      const bounds = new THREE.Box3().setFromObject(template.group);
      expect(bounds.max.z - bounds.min.z).toBeCloseTo(want.length, 1);
      const tolerance = want.length * 0.02;
      expect(template.muzzle).toBeDefined();
      for (const [i, axis] of (['x', 'y', 'z'] as const).entries()) {
        expect(Math.abs(template.muzzle![axis] - want.muzzle[i])).toBeLessThan(tolerance);
        expect(Math.abs(template.engineNodes[0][axis] - want.engine[i])).toBeLessThan(tolerance);
      }
      expect(shown(classId).triangles).toBeLessThanOrEqual(want.maxTriangles);
    });

    it(`${classId}: the carapace and limb armour are structural, not detail`, () => {
      const { structural, detail, names, materials } = shown(classId);
      expect(names.has('carapace')).toBe(true);
      expect(DETAIL_MESH_NAMES.has('carapace')).toBe(false);
      // Most of the hull must survive the reduced level: before the rebuild the plates were detail and dropped.
      expect(structural / (structural + detail)).toBeGreaterThan(0.7);
      // One draw call per material and detail flag when instanced: keep the slot count small.
      expect(materials).toBeLessThanOrEqual(7);
    });
  }
});
