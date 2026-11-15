import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { DETAIL_MESH_NAMES } from '@/rendering/lod';
import { getShipTemplate } from '@/rendering/ships';

/**
 * Contract of the rebuilt Reaper hulls (docs/apex/REAPER_VISUAL_QA_2026-11-10.md): the carapace, hood and limb
 * armour are structural, so they survive the reduced level of detail and instanced batches; the catalogue lengths
 * and the weapon and engine attachment points are where the simulation, the beam code and the glow sprites expect
 * them; and the triangle budget stays bounded.
 *
 * The capital's and Harbinger's attachment points were re-measured on 15 Nov 2026, when their proportions were
 * changed (the owner: "maybe the body is too small for the legs"). The mantle is half as broad again and a third
 * taller, and the limbs are 0.7 of their length, so the body is now 64 % of the hull's length where it was 53 %, and
 * the emitter, which hangs under the hood, sits further forward in a hull of the same overall length. Before:
 * capital muzzle (0, −1.223, −0.219), engine (0, 0, −9.928); Harbinger muzzle (0, −1.678, −0.224), engine
 * (0, 0, −11.85). The beam, the muzzle flash and the glow sprites all read these points from the model, so they moved
 * with it. The destroyer is unchanged.
 */
const EXPECTED: Record<string, { length: number; muzzle: [number, number, number]; engine: [number, number, number]; maxTriangles: number }> = {
  reaper_capital: { length: 20, muzzle: [0, -1.478, 1.821], engine: [0, 0, -9.913], maxTriangles: 14_000 },
  harbinger: { length: 24, muzzle: [0, -2.026, 2.217], engine: [0, 0, -11.819], maxTriangles: 15_000 },
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

/** Width, height and length of the meshes whose names pass `pick`, as drawn (render units; 20 units is 2 km). */
function extent(classId: string, pick: (name: string) => boolean): { width: number; height: number; length: number; from: number; to: number } {
  const template = getShipTemplate(classId);
  template.group.updateMatrixWorld(true);
  const box = new THREE.Box3();
  template.group.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if (!mesh.isMesh || !pick(mesh.name)) return;
    for (let o: THREE.Object3D | null = mesh; o && o !== template.group; o = o.parent) if (!o.visible) return;
    mesh.geometry.computeBoundingBox();
    box.union(mesh.geometry.boundingBox!.clone().applyMatrix4(mesh.matrixWorld));
  });
  return { width: box.max.x - box.min.x, height: box.max.y - box.min.y, length: box.max.z - box.min.z, from: box.min.z, to: box.max.z };
}
const isBody = (name: string): boolean => name === 'hull' || name === 'carapace';
const isLimb = (name: string): boolean => name.startsWith('reaper-arm') || name === 'reaper-joint';

describe('a capital Reaper is a body with limbs, not limbs with a body', () => {
  // Measured before, on the Sovereign-class hull (2 km overall): body 1,060 m long, 278 m wide and 290 m tall; limbs
  // 1,343 m long, spread over 725 m. The body was 38 % as wide as the spread of its limbs and shorter than they were.
  it.each(['reaper_capital', 'harbinger'])('%s: the mantle is most of the length, and more than half as wide as the limbs spread', (classId) => {
    const body = extent(classId, isBody), limbs = extent(classId, isLimb);
    const overall = getShipTemplate(classId).lengthUnits;
    expect(body.length / overall).toBeGreaterThan(0.6);
    expect(limbs.length).toBeLessThan(body.length);
    expect(body.width / limbs.width).toBeGreaterThan(0.5);
    expect(body.width / overall).toBeGreaterThan(0.2);
    expect(body.height / overall).toBeGreaterThan(0.18);
    // The limbs still reach well beyond the hood, and still spread wider than it.
    expect(limbs.to - body.to).toBeGreaterThan(overall * 0.3);
    expect(limbs.width).toBeGreaterThan(body.width * 1.4);
  });

  it('the destroyer keeps its build: four heavy legs under a compact body', () => {
    const body = extent('reaper_destroyer', isBody), limbs = extent('reaper_destroyer', isLimb);
    expect(body.width / limbs.width).toBeCloseTo(0.32, 1);
    expect(body.length / 1.6).toBeCloseTo(0.55, 1);
  });
});

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
