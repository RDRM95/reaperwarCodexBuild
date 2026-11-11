import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { buildAllianceCarrier, buildAllianceCruiser, buildAllianceDreadnought, buildAllianceFrigate, buildAllianceOmaha } from '@/rendering/ships/alliance';
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

  it('the frigate is a swept-wing dart: same length, muzzle and four engine nodes, low chisel bow', () => {
    const ship = buildAllianceFrigate();
    expect(ship.lengthUnits).toBe(1.7);
    expect(ship.muzzle!.toArray().map(v => +v.toFixed(5))).toEqual([0, -0.02, 0.85]);
    expect(ship.engineNodes.map(p => p.toArray().map(v => +v.toFixed(5)))).toEqual([[0.78, -0.06, -0.8], [-0.78, -0.06, -0.8], [0.09, 0, -0.85], [-0.09, 0, -0.85]]);
    expect(meshes(ship).map(m => m.name).sort()).toEqual(['accent', 'engine', 'hull', 'hullDark', 'windows']);
    expect(triangles(ship)).toBeLessThanOrEqual(900);
    // The hull now reaches its own muzzle; the old one stopped a tenth of a length short of it.
    const box = new THREE.Box3().setFromObject(ship.group);
    expect(box.max.z).toBeCloseTo(0.85, 5);
    expect(box.min.z).toBeGreaterThan(-0.87);
    // Wings sweep back: full span aft, fuselage only forward, drawn to a point.
    expect(halfBeam(ship, -0.3)).toBeGreaterThan(0.45);
    expect(halfBeam(ship, 0)).toBeLessThan(0.26);
    expect(halfBeam(ship, 0.2)).toBeLessThan(0.08);
    expect(halfBeam(ship, 0.4)).toBeLessThan(halfBeam(ship, 0.2) * 0.6);
    // The pale armour's upper face falls toward the bow.
    const top = (station: number): number => {
      const position = (ship.group.getObjectByName('hull') as THREE.Mesh<THREE.BufferGeometry>).geometry.getAttribute('position');
      let highest = -Infinity;
      for (let i = 0; i < position.count; i++) if (Math.abs(position.getZ(i) / ship.lengthUnits - station) < 0.02) highest = Math.max(highest, position.getY(i));
      return highest / ship.lengthUnits;
    };
    expect(top(0.5)).toBeLessThan(0.01);
    expect(top(-0.3)).toBeGreaterThan(0.05);
  });

  it('the carrier is a twin-prong flight deck with an island, in the armour of the line hulls', () => {
    const ship = buildAllianceCarrier(), dreadnought = buildAllianceDreadnought();
    expect(ship.lengthUnits).toBe(9);
    // Prong tips to exhaust is the stated length; the old model was 9.82 units long for a stated 9.
    const box = new THREE.Box3().setFromObject(ship.group);
    expect(box.max.z).toBeCloseTo(4.5, 5);
    expect(box.min.z).toBeGreaterThan(-4.5);
    expect(box.min.z).toBeLessThan(-4.45);
    expect(ship.engineNodes.map(p => p.toArray().map(v => +v.toFixed(5)))).toEqual([[0.603, 0.18, -4.5], [-0.603, 0.18, -4.5], [0, -0.27, -4.5]]);
    expect(meshes(ship).map(m => m.name).sort()).toEqual(['accent', 'engine', 'hull', 'hullDark', 'windows']);
    // Measured 1,976 (the box model was 432; the dreadnought is 1,660). A fleet carries one to four carriers.
    expect(triangles(ship)).toBeLessThanOrEqual(2100);
    const s = size(ship);
    expect(s.z / s.x).toBeGreaterThan(3);
    expect(s.z / s.y).toBeGreaterThan(5);
    // Full beam past amidships, and the prongs still carry most of it where the dreadnought is down to its blade.
    expect(halfBeam(ship, -0.2)).toBeCloseTo(0.15, 3);
    expect(halfBeam(ship, 0.35)).toBeGreaterThan(0.12);
    expect(halfBeam(ship, 0.35)).toBeGreaterThan(4 * halfBeam(dreadnought, 0.35));
    // The launch channel: forward of the recovery deck no pale armour comes within 5 % of the length of the centre line.
    const hull = (ship.group.getObjectByName('hull') as THREE.Mesh<THREE.BufferGeometry>).geometry.getAttribute('position');
    let innermost = Infinity;
    for (let i = 0; i < hull.count; i++) if (hull.getZ(i) > 0.23 * 9) innermost = Math.min(innermost, Math.abs(hull.getX(i)));
    expect(innermost / 9).toBeGreaterThan(0.05);
    // The highest point is the island's mast: aft of amidships and on the starboard deck edge.
    let top = -Infinity, topX = 0, topZ = 0;
    for (const mesh of meshes(ship)) {
      const position = mesh.geometry.getAttribute('position');
      for (let i = 0; i < position.count; i++) if (position.getY(i) > top) { top = position.getY(i); topX = position.getX(i); topZ = position.getZ(i); }
    }
    expect(topX / 9).toBeGreaterThan(0.1);
    expect(topZ / 9).toBeLessThan(-0.15);
    // Hangars are openings with a strip of light in them, not lit slabs: the old model's two slabs were 0.3 units
    // tall and 2.4 long (30 m by 240 m). No lit element is now taller than 4.5 m.
    const lit = (ship.group.getObjectByName('windows') as THREE.Mesh<THREE.BufferGeometry>).geometry.getAttribute('position');
    let tallest = 0;
    for (let t = 0; t < lit.count; t += 36) {
      let low = Infinity, high = -Infinity;
      for (let i = t; i < t + 36; i++) { low = Math.min(low, lit.getY(i)); high = Math.max(high, lit.getY(i)); }
      tallest = Math.max(tallest, high - low);
    }
    expect(tallest).toBeLessThan(0.045);
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
