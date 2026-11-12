import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { buildTurianFrigate } from '@/rendering/ships/turian';
import type { BuiltShip } from '@/rendering/ships/types';

/**
 * The turian frigate was a handful of boxes: a tapered plank, two flat plates for wings, a wedge and a cube. It is the most
 * numerous turian hull in a battle. It is now a blade: a tall narrow faceted hull, a split pincer bow around the gun,
 * wings swept hard back and angled down, a fin above and below. What the simulation and the effects read off the
 * model is unchanged.
 */
const meshes = (ship: BuiltShip) => ship.group.children.filter((c): c is THREE.Mesh<THREE.BufferGeometry> => (c as THREE.Mesh).isMesh);
const points = (mesh: THREE.Mesh<THREE.BufferGeometry>) => (mesh.geometry.index ? mesh.geometry.toNonIndexed() : mesh.geometry).getAttribute('position');
const volume = (mesh: THREE.Mesh<THREE.BufferGeometry>): number => {
  const p = points(mesh), a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
  let v = 0;
  for (let i = 0; i < p.count; i += 3) v += a.fromBufferAttribute(p, i).dot(b.fromBufferAttribute(p, i + 1).cross(c.fromBufferAttribute(p, i + 2))) / 6;
  return v;
};
/** Half-beam and height of the pale hull between two stations along it (render units). */
const section = (ship: BuiltShip, from: number, to: number) => {
  const p = points(ship.group.getObjectByName('hull') as THREE.Mesh<THREE.BufferGeometry>);
  let beam = 0, low = Infinity, high = -Infinity, inner = Infinity;
  for (let i = 0; i < p.count; i++) {
    if (p.getZ(i) < from || p.getZ(i) > to) continue;
    beam = Math.max(beam, Math.abs(p.getX(i))); inner = Math.min(inner, Math.abs(p.getX(i)));
    low = Math.min(low, p.getY(i)); high = Math.max(high, p.getY(i));
  }
  return { beam, inner, low, high };
};

describe('turian frigate', () => {
  it('keeps its length, muzzle and engine nodes, with every surface facing outward', () => {
    const ship = buildTurianFrigate();
    expect(ship.lengthUnits).toBe(1.6);
    expect(ship.muzzle!.toArray()).toEqual([0, 0, 0.8]);
    expect(ship.engineNodes.map((p) => p.toArray())).toEqual([[0.09, -0.02, -0.8], [-0.09, -0.02, -0.8]]);
    const box = new THREE.Box3().setFromObject(ship.group);
    // The pincer blades reach the muzzle and the exhausts stand at the stern (the old model stopped 0.1 units
    // short of its muzzle).
    expect(box.max.z).toBeCloseTo(0.8, 5);
    expect(box.min.z).toBeLessThan(-0.79);
    expect(box.min.z).toBeGreaterThan(-0.81);
    expect(meshes(ship).map((m) => m.name).sort()).toEqual(['accent', 'engine', 'hull', 'hullDark', 'windows']);
    let triangles = 0;
    for (const mesh of meshes(ship)) {
      triangles += points(mesh).count / 3;
      expect(volume(mesh), mesh.name).toBeGreaterThan(0);
      expect(Array.from(points(mesh).array).every(Number.isFinite)).toBe(true);
    }
    // Measured 464 (the box model was 160; the Alliance frigate is held under 900).
    expect(triangles).toBeLessThanOrEqual(600);
  });

  it('is a blade: wings swept hard back and down, a split bow, a tall fin', () => {
    const ship = buildTurianFrigate();
    // Full span aft, hull only amidships-forward, two separate blades at the bow.
    expect(section(ship, -0.5, -0.36).beam).toBeGreaterThan(0.65);
    expect(section(ship, 0.16, 0.26).beam).toBeLessThan(0.12);
    const bow = section(ship, 0.66, 0.8);
    expect(bow.beam).toBeLessThan(0.08);
    expect(bow.inner).toBeGreaterThan(0.03);
    // Wing tips hang below the hull's keel line at the wing root.
    expect(section(ship, -0.5, -0.36).low).toBeLessThan(-0.17);
    // The highest point is the dorsal fin, aft of amidships; the hull itself is taller than it is wide.
    const all = new THREE.Box3().setFromObject(ship.group);
    expect(all.max.y).toBeGreaterThan(0.4);
    const hull = section(ship, -0.12, -0.08);
    expect(hull.high - hull.low).toBeGreaterThan(0.3);
    const dark = points(ship.group.getObjectByName('hullDark') as THREE.Mesh<THREE.BufferGeometry>);
    let top = -Infinity, topZ = 0;
    for (let i = 0; i < dark.count; i++) if (dark.getY(i) > top) { top = dark.getY(i); topZ = dark.getZ(i); }
    expect(top).toBeCloseTo(all.max.y, 6);
    expect(topZ).toBeLessThan(-0.3);
  });
});
