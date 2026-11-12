import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { buildGethCruiser, buildGethDreadnought } from '@/rendering/ships/geth';
import { buildQuarianHeavy } from '@/rendering/ships/quarian';
import type { BuiltShip } from '@/rendering/ships/types';

/**
 * The geth cruiser and dreadnought and the quarian heavy cruiser were the last hulls built from boxes: a tapered box
 * under a chain of square plates, and a tapered box with boxes on it. The owner asked for them to be redesigned.
 * Each keeps what made it its faction's (the geth head, optic, ring and segments; the quarian spinal gun and
 * bolted-on modules) on a rounded hull. What the simulation and the effects read off each model is unchanged.
 */
const meshes = (ship: BuiltShip) => ship.group.children.filter((c): c is THREE.Mesh<THREE.BufferGeometry> => (c as THREE.Mesh).isMesh);
const points = (mesh: THREE.Mesh<THREE.BufferGeometry>) => (mesh.geometry.index ? mesh.geometry.toNonIndexed() : mesh.geometry).getAttribute('position');
const part = (ship: BuiltShip, name: string) => points(ship.group.getObjectByName(name) as THREE.Mesh<THREE.BufferGeometry>);
const volume = (mesh: THREE.Mesh<THREE.BufferGeometry>): number => {
  const p = points(mesh), a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
  let v = 0;
  for (let i = 0; i < p.count; i += 3) v += a.fromBufferAttribute(p, i).dot(b.fromBufferAttribute(p, i + 1).cross(c.fromBufferAttribute(p, i + 2))) / 6;
  return v;
};
const round = (values: number[]) => values.map(v => +v.toFixed(4));

// Length, muzzle and engine nodes as measured on the box models; triangles before and after.
const EXPECTED = [
  { name: 'geth cruiser', build: buildGethCruiser, length: 5.2, muzzle: [0, 0, 2.76], engines: [[0.26, 0, -2.72], [-0.26, 0, -2.72]], before: 676, after: 944 },
  { name: 'geth dreadnought', build: buildGethDreadnought, length: 11, muzzle: [0, 0, 5.4], engines: [[0.42, 0.28, -5.69], [-0.42, 0.28, -5.69], [0.42, -0.28, -5.69], [-0.42, -0.28, -5.69]], before: 1828, after: 2312 },
  { name: 'quarian heavy cruiser', build: buildQuarianHeavy, length: 8.2, muzzle: [0, 0.1, 4.264], engines: [[0.45, 0.25, -4.32], [-0.45, 0.25, -4.32], [0, -0.3, -4.32]], before: 720, after: 928 },
] as const;

describe('geth and quarian capital hulls', () => {
  it.each(EXPECTED)('the $name keeps its length, muzzle and engine nodes on a rounded hull with every surface outward', (expected) => {
    const ship = expected.build();
    expect(ship.lengthUnits).toBe(expected.length);
    expect(round(ship.muzzle!.toArray())).toEqual(expected.muzzle);
    expect(ship.engineNodes.map(p => round(p.toArray()))).toEqual(expected.engines);
    expect(meshes(ship).map(m => m.name).sort()).toEqual(['accent', 'engine', 'hull', 'hullDark', 'windows']);
    let triangles = 0;
    for (const mesh of meshes(ship)) {
      triangles += points(mesh).count / 3;
      expect(volume(mesh), mesh.name).toBeGreaterThan(0);
      expect(Array.from(points(mesh).array).every(Number.isFinite)).toBe(true);
    }
    expect(triangles).toBe(expected.after);
    expect(triangles).toBeLessThan(expected.before * 1.45);
    // A rounded body: the pale hull was 36 or 108 triangles of boxes and is now a body of revolution.
    expect(part(ship, 'hull').count / 3).toBeGreaterThan(200);
    // The main gun reaches the muzzle and stops there.
    const dark = part(ship, 'hullDark');
    let reach = -Infinity;
    for (let i = 0; i < dark.count; i++) if (Math.hypot(dark.getX(i), dark.getY(i) - expected.muzzle[1]) < 0.3) reach = Math.max(reach, dark.getZ(i));
    expect(reach).toBeCloseTo(expected.muzzle[2], 3);
  });

  it('the geth hulls keep the head and optic, between forward-swept mandibles; the dreadnought keeps its ring', () => {
    for (const build of [buildGethCruiser, buildGethDreadnought]) {
      const ship = build(), L = ship.lengthUnits;
      // One optic on the centre line at the head, ahead of every flank light.
      const lit = part(ship, 'windows');
      let optic = -Infinity;
      for (let i = 0; i < lit.count; i++) if (Math.hypot(lit.getX(i), lit.getY(i)) < L * 0.05) optic = Math.max(optic, lit.getZ(i));
      expect(optic).toBeGreaterThan(L * 0.3);
      // Mandible tips: dark, well off the centre line, as far forward as the muzzle.
      const dark = part(ship, 'hullDark');
      let tip = 0;
      for (let i = 0; i < dark.count; i++) if (dark.getZ(i) > ship.muzzle!.z - L * 0.02) tip = Math.max(tip, Math.abs(dark.getX(i)));
      expect(tip).toBeGreaterThan(L * 0.15);
    }
    const ring = new THREE.Box3().setFromBufferAttribute(part(buildGethDreadnought(), 'accent') as THREE.BufferAttribute);
    expect(ring.max.x).toBeCloseTo(1.85, 2);
    expect(ring.max.y).toBeCloseTo(1.85, 2);
    const noRing = new THREE.Box3().setFromBufferAttribute(part(buildGethCruiser(), 'accent') as THREE.BufferAttribute);
    expect(noRing.max.x).toBeLessThan(0.5);
  });

  it('the quarian heavy cruiser keeps its bolted-on modules and carries stub wings', () => {
    const ship = buildQuarianHeavy();
    // Ten modules, each a dark box with a lit strip (twelve triangles apiece), plus the bridge's one lit band.
    expect(part(ship, 'windows').count / 36).toBe(11);
    const hull = new THREE.Box3().setFromBufferAttribute(part(ship, 'hull') as THREE.BufferAttribute);
    expect(hull.max.x).toBeCloseTo(1.6, 2);
    expect(hull.max.x - hull.min.x).toBeGreaterThan(3);
  });
});
