import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { buildAllianceCruiser, buildAllianceDreadnought, buildAllianceOmaha } from '@/rendering/ships/alliance';
import { PALETTES } from '@/rendering/materials';
import type { BuiltShip } from '@/rendering/ships/types';

/**
 * The line dreadnought and cruiser were one three-rail box at two scales. They now have their own outlines: the
 * dreadnought a broad arrowhead that narrows into a spinal blade with its citadel aft, the cruiser a forked deck
 * either side of its gun spine. What the simulation and the effects read off the model is unchanged: length, the
 * muzzle and the engine nodes are the values measured on the hulls before the rebuild.
 */
const EXPECTED = {
  dreadnought: { build: buildAllianceDreadnought, length: 8.88, muzzle: [0, -0.07992, 4.2624],
    engines: [[-0.43867, 0.21978, -4.44], [0.43867, 0.21978, -4.44], [-0.43867, -0.21978, -4.44], [0.43867, -0.21978, -4.44]], maxTriangles: 2000 },
  cruiser: { build: buildAllianceCruiser, length: 5.2, muzzle: [0, -0.0468, 2.496],
    engines: [[-0.247, 0, -2.6], [0.247, 0, -2.6]], maxTriangles: 1500 },
} as const;

const meshes = (ship: BuiltShip) => ship.group.children.filter(c => (c as THREE.Mesh).isMesh) as THREE.Mesh<THREE.BufferGeometry>[];
const triangles = (ship: BuiltShip) => meshes(ship).reduce((n, m) => n + m.geometry.getAttribute('position').count / 3, 0);
const size = (ship: BuiltShip) => new THREE.Box3().setFromObject(ship.group).getSize(new THREE.Vector3());

/**
 * Half-beam of the pale armour at one station along the hull, as fractions of its length: the widest point at which
 * the plane across the hull at that station cuts a triangle edge.
 */
function halfBeam(ship: BuiltShip, station: number): number {
  const position = (ship.group.getObjectByName('hull') as THREE.Mesh<THREE.BufferGeometry>).geometry.getAttribute('position');
  const z = station * ship.lengthUnits;
  let widest = 0;
  for (let t = 0; t < position.count; t += 3) {
    for (let e = 0; e < 3; e++) {
      const i = t + e, j = t + (e + 1) % 3;
      const zi = position.getZ(i), zj = position.getZ(j);
      if ((zi - z) * (zj - z) > 0 || zi === zj) continue;
      const x = position.getX(i) + (position.getX(j) - position.getX(i)) * (z - zi) / (zj - zi);
      widest = Math.max(widest, Math.abs(x));
    }
  }
  return widest / ship.lengthUnits;
}

/** Where along the hull its highest point sits, as a fraction of its length (negative is aft). */
function crownStation(ship: BuiltShip): number {
  let top = -Infinity, station = 0;
  for (const mesh of meshes(ship)) {
    const position = mesh.geometry.getAttribute('position');
    for (let i = 0; i < position.count; i++) if (position.getY(i) > top) { top = position.getY(i); station = position.getZ(i) / ship.lengthUnits; }
  }
  return station;
}

describe('Alliance line hulls', () => {
  it.each(Object.entries(EXPECTED))('%s keeps its length, muzzle and engine nodes, in five merged meshes', (_name, expected) => {
    const ship = expected.build();
    expect(ship.lengthUnits).toBe(expected.length);
    expect(size(ship).z).toBeGreaterThan(expected.length * 0.985);
    expect(size(ship).z).toBeLessThanOrEqual(expected.length + 1e-6);
    expect(ship.muzzle!.toArray().map(v => +v.toFixed(5))).toEqual(expected.muzzle);
    expect(ship.engineNodes.map(p => p.toArray().map(v => +v.toFixed(5)))).toEqual(expected.engines);
    expect(meshes(ship).map(m => m.name).sort()).toEqual(['accent', 'engine', 'hull', 'hullDark', 'windows']);
    expect(triangles(ship)).toBeLessThanOrEqual(expected.maxTriangles);
    for (const mesh of meshes(ship)) {
      for (const name of ['position', 'normal']) expect(Array.from(mesh.geometry.getAttribute(name).array).every(Number.isFinite)).toBe(true);
    }
  });

  it('stay long, narrow and low', () => {
    for (const { build } of Object.values(EXPECTED)) {
      const s = size(build());
      expect(s.z / s.x).toBeGreaterThan(3);
      expect(s.z / s.y).toBeGreaterThan(6);
    }
  });

  it('the dreadnought is an arrowhead narrowing to a spinal blade, with its citadel aft', () => {
    const ship = buildAllianceDreadnought();
    expect(halfBeam(ship, -0.25)).toBeCloseTo(0.15, 3);
    expect(halfBeam(ship, 0.05)).toBeLessThan(0.11);
    expect(halfBeam(ship, 0.3)).toBeLessThan(0.03);
    expect(halfBeam(ship, 0.3)).toBeGreaterThan(0.02);
    expect(crownStation(ship)).toBeLessThan(-0.15);
  });

  it('the cruiser is its own forked silhouette, not a scaled dreadnought', () => {
    const cruiser = buildAllianceCruiser(), dreadnought = buildAllianceDreadnought();
    // Prongs carry the full beam well forward, where the dreadnought is already down to its blade.
    expect(halfBeam(cruiser, 0.3)).toBeCloseTo(0.135, 3);
    expect(halfBeam(cruiser, 0.3)).toBeGreaterThan(4 * halfBeam(dreadnought, 0.3));
    // Ahead of the prongs only the gun spine remains.
    expect(halfBeam(cruiser, 0.42)).toBeLessThan(0.03);
  });

  it('lit ports are many and small, and belong to the detail tier that distant ships drop', () => {
    for (const { build, length } of Object.values(EXPECTED)) {
      const windows = build().group.getObjectByName('windows') as THREE.Mesh<THREE.BufferGeometry>;
      // Twelve triangles a port.
      expect(windows.geometry.getAttribute('position').count / 36).toBeGreaterThan(50);
      const box = new THREE.Box3().setFromBufferAttribute(windows.geometry.getAttribute('position') as THREE.BufferAttribute);
      expect(box.getSize(new THREE.Vector3()).z).toBeGreaterThan(length * 0.5);
    }
  });

  it('Alliance armour is matt paint over darker machinery', () => {
    const { hull, hullDark } = PALETTES.alliance;
    expect(hull.metalness).toBeLessThanOrEqual(0.25);
    expect(hull.roughness).toBeGreaterThanOrEqual(0.7);
    const pale = hull.color.getHSL({ h: 0, s: 0, l: 0 }).l, dark = hullDark.color.getHSL({ h: 0, s: 0, l: 0 }).l;
    expect(pale).toBeGreaterThan(3 * dark);
  });

  it('the heavy gunship hull of the Omaha family is untouched', () => {
    const omaha = buildAllianceOmaha();
    expect(triangles(omaha)).toBe(1952);
    expect(omaha.engineNodes).toHaveLength(6);
    expect(size(omaha).z).toBeCloseTo(17.802, 3);
  });
});
