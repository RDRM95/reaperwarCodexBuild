import * as THREE from 'three';
import { at, plateStrip, rot, taperedBox, wedge, zCylinder } from '../geometry';
import { assemble, newParts, type Parts } from './alliance';
import type { BuiltShip } from './types';

/**
 * Hyper-dreadnoughts (AU): hulls beyond the super-dreadnoughts, longer than a Sovereign, each built round a spinal
 * gun that is most of the ship. Original designs in their factions' visual languages. Dimensions in render units
 * (100 m). Each merges into the usual five material batches.
 */

/** A turret: a round barbette with two long barrels, pointing forward. `up` is +1 on the back, -1 on the belly. */
function railTurret(parts: Parts, x: number, y: number, z: number, size: number, up: 1 | -1): void {
  parts.hullDark.push(at(rot(zCylinder(size * 0.62, size * 0.72, size * 0.5, 14), Math.PI / 2, 0, 0), x, y + up * size * 0.25, z));
  parts.hull.push(at(taperedBox(size * 1.05, size * 0.5, size * 1.5, 0.7, 0.9), x, y + up * size * 0.72, z + size * 0.1));
  for (const side of [-1, 1]) {
    parts.hullDark.push(at(zCylinder(size * 0.085, size * 0.11, size * 3.4, 8), x + side * size * 0.24, y + up * size * 0.74, z + size * 2.2));
    parts.accent.push(at(zCylinder(size * 0.13, size * 0.13, size * 0.22, 8), x + side * size * 0.24, y + up * size * 0.74, z + size * 3.8));
  }
}

/**
 * Titan-class hyper-dreadnought, Systems Alliance, 5,200 m. Two armoured hulls carried either side of an open
 * accelerator: the KRONOS Lance runs between them from the drives to the bow, held by a yoke every four hundred
 * metres. Command citadel aft of centre, four railgun turrets, a broadside battery on each outer flank, ten drives.
 */
export function buildAllianceTitan(): BuiltShip {
  const L = 52, parts = newParts();
  const hullX = 3.05, hullW = 2.5, hullH = 2.7, barrelY = -0.6;
  // The lance: a dark barrel the length of the ship, its last third exposed forward of the hulls' taper.
  parts.hullDark.push(at(zCylinder(0.5, 0.74, L * 0.9, 16), 0, barrelY, L * 0.045));
  parts.accent.push(at(zCylinder(0.6, 0.6, 0.5, 16), 0, barrelY, L * 0.488));
  parts.hullDark.push(at(zCylinder(0.86, 0.6, 1.4, 16), 0, barrelY, L * 0.468));
  for (const side of [-1, 1]) {
    // The two hulls, slab-sided, tapering to armoured prows.
    parts.hull.push(at(taperedBox(hullW, hullH, L * 0.86, 0.34, 0.94, { frontHeight: 0.42 }), side * hullX, 0, L * 0.012));
    parts.hull.push(at(wedge(hullW * 0.36, hullH * 0.5, L * 0.07, 0.2), side * (hullX - 0.2), 0.02, L * 0.455));
    // Outer armour belt and the broadside casemates it carries.
    parts.hull.push(at(taperedBox(0.7, hullH * 0.56, L * 0.62, 0.55, 0.92), side * (hullX + hullW * 0.56), -0.15, -L * 0.05));
    for (let i = 0; i < 12; i++) {
      const z = -L * 0.31 + i * L * 0.047;
      parts.hullDark.push(at(new THREE.BoxGeometry(0.5, 0.42, 1.25), side * (hullX + hullW * 0.74), 0.34, z));
      parts.hullDark.push(at(rot(zCylinder(0.05, 0.05, 0.9, 6), 0, side * Math.PI / 2, 0), side * (hullX + hullW * 0.74 + 0.6), 0.36, z));
    }
    // Inner faces: rail housings toward the barrel.
    parts.hullDark.push(at(taperedBox(0.5, hullH * 0.5, L * 0.74, 0.5, 1), side * (hullX - hullW * 0.56), barrelY * 0.4, L * 0.0));
    // Deck stripe, deck lights, and running lights along the outer belt.
    parts.accent.push(at(new THREE.BoxGeometry(0.2, 0.06, L * 0.6), side * (hullX + 0.4), hullH * 0.5 + 0.02, -L * 0.03));
    parts.windows.push(...plateStrip(22, 0.09, 0.05, 0.42,
      new THREE.Vector3(side * (hullX - 0.35), hullH * 0.5 + 0.03, -L * 0.33), new THREE.Vector3(side * (hullX - 0.35), hullH * 0.5 + 0.03, L * 0.2)));
    parts.windows.push(...plateStrip(18, 0.05, 0.07, 0.36,
      new THREE.Vector3(side * (hullX + hullW * 0.5 + 0.02), -0.55, -L * 0.3), new THREE.Vector3(side * (hullX + hullW * 0.5 + 0.02), -0.55, L * 0.16)));
    // Railgun turrets: one on the back of each hull, one under it.
    railTurret(parts, side * hullX, hullH * 0.5, L * 0.17, 1.25, 1);
    railTurret(parts, side * hullX, -hullH * 0.5, L * 0.09, 1.25, -1);
    // Point-defence blisters toward the bow.
    for (const z of [L * 0.27, L * 0.33, L * 0.39]) parts.hullDark.push(at(new THREE.SphereGeometry(0.2, 8, 6), side * hullX, hullH * 0.33, z));
  }
  // Yokes: the frames that hold the two hulls to the gun.
  for (let i = 0; i < 9; i++) {
    const z = -L * 0.3 + i * L * 0.078;
    parts.hullDark.push(at(new THREE.BoxGeometry(hullX * 2 - hullW * 0.5, 1.5, 0.7), 0, barrelY * 0.5, z));
    parts.hull.push(at(new THREE.BoxGeometry(hullX * 2 - hullW * 0.2, 0.22, 1.15), 0, 0.72, z));
    parts.accent.push(at(new THREE.BoxGeometry(1.5, 0.05, 0.22), 0, 0.85, z));
  }
  // Spine deck over the after half, and the command citadel on it.
  parts.hull.push(at(taperedBox(hullX * 2 + 0.6, 0.7, L * 0.42, 0.72, 1), 0, hullH * 0.5 + 0.2, -L * 0.2));
  parts.hull.push(at(taperedBox(3.4, 1.5, 7.5, 0.62, 0.9, { frontHeight: 0.55 }), 0, hullH * 0.5 + 1.25, -L * 0.2));
  parts.hullDark.push(at(taperedBox(2.3, 1.1, 4.2, 0.7, 0.92), 0, hullH * 0.5 + 2.5, -L * 0.215));
  parts.windows.push(at(new THREE.BoxGeometry(2.0, 0.12, 0.5), 0, hullH * 0.5 + 2.75, -L * 0.18));
  parts.windows.push(at(new THREE.BoxGeometry(2.9, 0.1, 0.45), 0, hullH * 0.5 + 1.55, -L * 0.135));
  parts.hullDark.push(at(new THREE.BoxGeometry(0.12, 1.6, 0.12), 0.6, hullH * 0.5 + 3.8, -L * 0.24));
  parts.hullDark.push(at(new THREE.BoxGeometry(0.12, 1.1, 0.12), -0.7, hullH * 0.5 + 3.55, -L * 0.225));
  // Ventral keel under the gun, with the radiators that dump a round's heat.
  parts.hullDark.push(at(taperedBox(1.5, 0.9, L * 0.5, 0.5, 1), 0, -hullH * 0.5 - 0.1, -L * 0.14));
  for (const side of [-1, 1]) for (let i = 0; i < 5; i++) {
    parts.hull.push(at(rot(new THREE.BoxGeometry(2.3, 0.06, 1.7), 0, 0, side * 0.5), side * 1.55, -hullH * 0.5 - 0.75, -L * 0.3 + i * 2.6));
  }
  // Drive block: ten drives in two rows.
  parts.hullDark.push(at(taperedBox(hullX * 2 + hullW + 0.9, hullH + 1.3, L * 0.115, 0.92, 0.84), 0, 0, -L * 0.43));
  parts.hull.push(at(taperedBox(hullX * 2 + hullW + 0.5, 0.3, L * 0.11, 0.9, 0.86), 0, hullH * 0.5 + 0.72, -L * 0.43));
  parts.accent.push(at(new THREE.BoxGeometry(5.4, 0.06, 0.5), 0, hullH * 0.5 + 0.9, -L * 0.415));
  const engineNodes: THREE.Vector3[] = [];
  for (let i = 0; i < 10; i++) {
    const x = (i % 5 - 2) * 1.72, y = i < 5 ? 0.95 : -0.95, r = 0.62;
    parts.hullDark.push(at(zCylinder(r * 1.2, r, L * 0.03, 14, true), x, y, -L * 0.484));
    parts.engine.push(at(zCylinder(r * 0.84, r * 0.72, 0.16, 14), x, y, -L * 0.4985));
    engineNodes.push(new THREE.Vector3(x, y, -L * 0.5));
  }
  const built = assemble(parts, 'alliance', engineNodes, L, new THREE.Vector3(0, barrelY, L * 0.49));
  built.group.name = 'Titan-class hyper-dreadnought - Systems Alliance / APEX';
  return built;
}

/**
 * Imperator-class siege hyper-dreadnought, Turian Hierarchy, 4,400 m. A tall narrow hull whose split bow is two
 * siege rails; a dorsal fin a kilometre high, swept blade wings, two railgun turrets ahead of the fin, five drives.
 */
export function buildTurianImperator(): BuiltShip {
  const L = 44, parts = newParts();
  const W = 3.8, H = 5.2, railX = 1.5;
  parts.hull.push(at(taperedBox(W, H, L * 0.66, 0.72, 1, { frontHeight: 0.74 }), 0, 0, -L * 0.03));
  // The pincer bow: each blade is the housing of a siege rail.
  for (const side of [-1, 1]) {
    parts.hull.push(at(taperedBox(1.5, H * 0.56, L * 0.36, 0.3, 1, { frontHeight: 0.4 }), side * (railX + 0.25), 0, L * 0.32));
    parts.hullDark.push(at(zCylinder(0.3, 0.42, L * 0.37, 12), side * railX * 0.72, -0.1, L * 0.312));
    parts.accent.push(at(zCylinder(0.38, 0.38, 0.4, 12), side * railX * 0.72, -0.1, L * 0.492));
    parts.accent.push(at(new THREE.BoxGeometry(0.1, 0.3, L * 0.22), side * (railX + 1.0), H * 0.2, L * 0.26));
    // Hull ribs, viewports, casemates.
    for (let i = 0; i < 9; i++) parts.hullDark.push(at(new THREE.BoxGeometry(0.3, H * 0.4, 1.5), side * W * 0.5, -0.1, -L * 0.3 + i * 2.9));
    parts.windows.push(...plateStrip(20, 0.06, 0.09, 0.5,
      new THREE.Vector3(side * W * 0.49, H * 0.26, -L * 0.3), new THREE.Vector3(side * W * 0.44, H * 0.22, L * 0.12)));
    for (let i = 0; i < 10; i++) {
      const z = -L * 0.27 + i * 2.4;
      parts.hullDark.push(at(new THREE.BoxGeometry(0.55, 0.4, 1.0), side * (W * 0.5 + 0.12), H * 0.36, z));
      parts.hullDark.push(at(rot(zCylinder(0.05, 0.05, 0.9, 6), 0, side * Math.PI / 2, 0), side * (W * 0.5 + 0.7), H * 0.37, z));
    }
    for (let i = 0; i < 4; i++) parts.hullDark.push(at(new THREE.SphereGeometry(0.2, 8, 6), side * W * 0.47, -H * 0.36, -L * 0.2 + i * 5));
    // Blade wings, swept back and drooped, with a lit leading edge.
    const wing = taperedBox(9.5, 0.32, 9.0, 0.3, 1);
    wing.rotateY(side * -0.5);
    wing.rotateZ(side * -0.12);
    parts.hull.push(at(wing, side * (W * 0.5 + 4.2), -0.5, -L * 0.2));
    parts.accent.push(at(rot(new THREE.BoxGeometry(5.6, 0.36, 0.5), 0, side * -0.5, side * -0.12), side * (W * 0.5 + 5.4), -0.62, -L * 0.13));
  }
  // The throat between the blades, where the rails meet the hull.
  parts.hullDark.push(at(taperedBox(1.9, H * 0.42, L * 0.2, 0.6, 1), 0, -0.1, L * 0.24));
  // Dorsal fin and ventral blade.
  parts.hullDark.push(at(taperedBox(0.4, 6.2, 13.5, 0.32, 1, { frontHeight: 0.28 }), 0, H * 0.5 + 3.0, -L * 0.12));
  parts.windows.push(at(new THREE.BoxGeometry(0.44, 0.12, 6.5), 0, H * 0.5 + 5.6, -L * 0.2));
  parts.hullDark.push(at(taperedBox(0.45, 3.6, 10.5, 0.4, 1), 0, -H * 0.5 - 1.7, -L * 0.06));
  // Command bridge ahead of the fin.
  parts.hull.push(at(taperedBox(2.0, 1.5, 6.0, 0.7, 1, { frontHeight: 0.6 }), 0, H * 0.5 + 0.7, L * 0.085));
  parts.windows.push(at(new THREE.BoxGeometry(1.7, 0.14, 1.3), 0, H * 0.5 + 1.2, L * 0.12));
  // Railgun turrets on the foredeck.
  railTurret(parts, 0, H * 0.5 * 0.86, L * 0.2, 1.15, 1);
  railTurret(parts, 0, H * 0.5 * 0.74, L * 0.29, 1.0, 1);
  // Dorsal ridge plates down the spine.
  for (let i = 0; i < 7; i++) parts.accent.push(at(taperedBox(1.7, 0.2, 1.7, 0.8, 1), 0, H * 0.5 + 0.12, -L * 0.33 + i * 1.5));
  // Drives.
  parts.hullDark.push(at(taperedBox(W + 2.4, H + 0.6, L * 0.15, 1, 0.84), 0, 0, -L * 0.41));
  const engineNodes: THREE.Vector3[] = [];
  const nozzles = [{ x: 1.75, y: 1.3, r: 0.86 }, { x: -1.75, y: 1.3, r: 0.86 }, { x: 0, y: -0.2, r: 1.15 }, { x: 1.75, y: -1.6, r: 0.8 }, { x: -1.75, y: -1.6, r: 0.8 }];
  for (const n of nozzles) {
    parts.hullDark.push(at(zCylinder(n.r * 1.15, n.r, L * 0.03, 14, true), n.x, n.y, -L * 0.484));
    parts.engine.push(at(zCylinder(n.r * 0.84, n.r * 0.7, 0.16, 14), n.x, n.y, -L * 0.4985));
    engineNodes.push(new THREE.Vector3(n.x, n.y, -L * 0.5));
  }
  const built = assemble(parts, 'turian', engineNodes, L, new THREE.Vector3(0, -0.1, L * 0.495), 0x9fe0ff);
  built.group.name = 'Imperator-class siege hyper-dreadnought - Turian Hierarchy / APEX';
  return built;
}
