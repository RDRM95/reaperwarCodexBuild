import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { buildGethFrigate } from '@/rendering/ships/geth';
import { buildCerberusFrigate } from '@/rendering/ships/cerberus';
import type { BuiltShip } from '@/rendering/ships/types';

/**
 * The geth and Cerberus frigates were the last frigates made of boxes: the geth one a box with the family's head
 * on it, the Cerberus one a few boxes with two flat plates for wings. Both are rebuilt from the fighter kit in the
 * design language their own files describe. What the simulation and the effects read off each model is unchanged.
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
/** Greatest and least distance from the centre line of a part's vertices between two stations. */
const reach = (p: THREE.BufferAttribute | THREE.InterleavedBufferAttribute, from: number, to: number) => {
  let outer = 0, inner = Infinity;
  for (let i = 0; i < p.count; i++) if (p.getZ(i) >= from && p.getZ(i) <= to) { outer = Math.max(outer, Math.abs(p.getX(i))); inner = Math.min(inner, Math.abs(p.getX(i))); }
  return { outer, inner };
};

const EXPECTED = [
  { name: 'geth', build: buildGethFrigate, length: 1.5, muzzle: [0, 0, 0.75], engines: [[0.07, 0, -0.75], [-0.07, 0, -0.75]] },
  { name: 'Cerberus', build: buildCerberusFrigate, length: 1.8, muzzle: [0, 0, 0.9], engines: [[0.72, -0.05, -0.75], [-0.72, -0.05, -0.75]] },
] as const;

describe('geth and Cerberus frigates', () => {
  it.each(EXPECTED)('the $name frigate keeps its length, muzzle and engine nodes, with every surface facing outward', (expected) => {
    const ship = expected.build();
    expect(ship.lengthUnits).toBe(expected.length);
    expect(ship.muzzle!.toArray()).toEqual(expected.muzzle);
    expect(ship.engineNodes.map((p) => p.toArray())).toEqual(expected.engines);
    expect(meshes(ship).map((m) => m.name).sort()).toEqual(['accent', 'engine', 'hull', 'hullDark', 'windows']);
    // The model reaches its own muzzle (the old geth frigate stopped 0.19 units short of it, the old Cerberus
    // one 0.13).
    expect(new THREE.Box3().setFromObject(ship.group).max.z).toBeCloseTo(expected.length / 2, 3);
    let triangles = 0;
    for (const mesh of meshes(ship)) {
      triangles += points(mesh).count / 3;
      expect(volume(mesh), mesh.name).toBeGreaterThan(0);
      expect(Array.from(points(mesh).array).every(Number.isFinite)).toBe(true);
    }
    // Measured: geth 644 (was 328), Cerberus 552 (was 280). The Alliance frigate is held under 900.
    expect(triangles).toBeLessThanOrEqual(700);
  });

  it('the geth frigate carries its head and optic between two forward-swept mandibles', () => {
    const ship = buildGethFrigate();
    // Mandibles: dark blades whose tips stand wide of the head, out at the muzzle.
    const tips = reach(part(ship, 'hullDark'), 0.68, 0.76);
    expect(tips.outer).toBeGreaterThan(0.33);
    expect(tips.inner).toBeGreaterThan(0.3);
    // The pale body ends at the head: nothing pale forward of it.
    expect(new THREE.Box3().setFromBufferAttribute(part(ship, 'hull') as THREE.BufferAttribute).max.z).toBeLessThan(0.56);
    // One optic on the centre line at the front, and small lights along the back.
    const lit = part(ship, 'windows');
    let optic = 0, lights = 0;
    for (let i = 0; i < lit.count; i++) { if (lit.getZ(i) > 0.45) optic++; else lights++; }
    expect(optic).toBeGreaterThan(0);
    expect(lights).toBeGreaterThan(0);
    // A rounded body, not a box: more than twice as many pale triangles as a box has.
    expect(part(ship, 'hull').count / 3).toBeGreaterThan(100);
  });

  it('the Cerberus frigate is a pointed hull with twin booms and its drives on the wing tips', () => {
    const ship = buildCerberusFrigate(), hull = part(ship, 'hull');
    // Drawn to a point at the muzzle.
    expect(reach(hull, 0.8, 0.9).outer).toBeLessThan(0.04);
    // Twin booms: pale structure well off the centre line forward of the wings, with nothing between them and
    // the hull's nose at their tips.
    const booms = reach(hull, 0.6, 0.63);
    expect(booms.outer).toBeGreaterThan(0.18);
    expect(booms.outer).toBeLessThan(0.23);
    // Nacelles on the wing tips, where the engine nodes are.
    expect(reach(hull, -0.74, -0.6).outer).toBeGreaterThan(0.75);
    const lit = part(ship, 'engine');
    for (let i = 0; i < lit.count; i++) expect(Math.abs(Math.abs(lit.getX(i)) - 0.72)).toBeLessThan(0.06);
    // The old model's bridge was a lit block 16 m across; the bridge is now dark glass with one thin lit band.
    expect(part(ship, 'windows').count / 3).toBe(12);
  });
});
