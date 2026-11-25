import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { BridgeSpec } from './bridgeSpec';
import { screenUv, type ScreenName } from './instruments';

/**
 * A warship's bridge, built from its spec (bridgeSpec.ts): original procedural geometry, in metres, in the seat's
 * own frame (the eye at the origin, x to starboard, y up, the bow at −z).
 *
 * The whole room is six meshes whatever its size: its structure (walls, decks, frames, rail, consoles and chairs,
 * tinted by vertex colour so that they share one material), its strip lights, its lit trims, its screens, its
 * holograms and its glass. It is drawn in a pass of its own over the battle (interiorView.ts), so its cost is six
 * draw calls while the eye is on a bridge and nothing at any other time.
 */
export interface BridgeMaterials {
  structure: THREE.Material;
  /** The room's strip lights: their colour is the material's, so that the room can go to action stations. */
  lights: THREE.Material;
  trims: THREE.Material;
  screens: THREE.Material;
  holograms: THREE.Material;
  glass: THREE.Material;
}

export interface BuiltBridge {
  group: THREE.Group;
  spec: BridgeSpec;
  /** Where the room's lamps hang: over the commanding officer's deck, in the helm pit, at the plot, at the windows. */
  lamps: { room: THREE.Vector3; helm: THREE.Vector3; plot: THREE.Vector3; windows: THREE.Vector3 };
  /** The windows, each by its four corners: what is seen through them is the battle. */
  panes: THREE.Vector3[][];
  /** Where each instrument is, for a test or a caption: the centre of its screen. */
  instruments: Partial<Record<ScreenName, THREE.Vector3>>;
}

/** One tile of the panel texture covers this many metres. */
const TILE = 2.4;
type Rgb = readonly [number, number, number];

/** A box whose texture coordinates run in metres, so that a long wall is not one stretched panel. */
function box(w: number, h: number, d: number): THREE.BufferGeometry {
  const g = new THREE.BoxGeometry(w, h, d);
  const uv = g.getAttribute('uv') as THREE.BufferAttribute;
  // Faces in order: +x, −x (depth by height), +y, −y (width by depth), +z, −z (width by height); four corners each.
  const across = [d, d, w, w, w, w], up = [h, h, d, d, h, h];
  for (let i = 0; i < uv.count; i++) { const f = Math.floor(i / 4); uv.setXY(i, uv.getX(i) * across[f] / TILE, uv.getY(i) * up[f] / TILE); }
  return g;
}

/** A flat screen showing one picture of the instruments' canvas. */
function screen(name: ScreenName, w: number, h: number): THREE.BufferGeometry {
  const g = new THREE.PlaneGeometry(w, h);
  const [u0, v0, u1, v1] = screenUv(name), uv = g.getAttribute('uv') as THREE.BufferAttribute;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, u0 + (u1 - u0) * uv.getX(i), v0 + (v1 - v0) * uv.getY(i));
  return g;
}

interface Pose { x?: number; y?: number; z?: number; rx?: number; ry?: number; rz?: number }

class Parts {
  private readonly list: THREE.BufferGeometry[] = [];
  private readonly m = new THREE.Matrix4();
  private readonly q = new THREE.Quaternion();
  private readonly e = new THREE.Euler();
  /** Add a part at a pose (turned about y first, then x, then z), painted one colour. */
  add(g: THREE.BufferGeometry, pose: Pose, colour: Rgb = [1, 1, 1]): void {
    this.q.setFromEuler(this.e.set(pose.rx ?? 0, pose.ry ?? 0, pose.rz ?? 0, 'YXZ'));
    g.applyMatrix4(this.m.compose(new THREE.Vector3(pose.x ?? 0, pose.y ?? 0, pose.z ?? 0), this.q, new THREE.Vector3(1, 1, 1)));
    const n = g.getAttribute('position').count, c = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { c[i * 3] = colour[0]; c[i * 3 + 1] = colour[1]; c[i * 3 + 2] = colour[2]; }
    g.setAttribute('color', new THREE.BufferAttribute(c, 3));
    this.list.push(g);
  }
  mesh(material: THREE.Material, name: string): THREE.Mesh | undefined {
    if (!this.list.length) return undefined;
    const merged = mergeGeometries(this.list, false);
    for (const g of this.list) g.dispose();
    const mesh = new THREE.Mesh(merged, material);
    mesh.name = name;
    // The eye is inside the room: its bounds are no use for culling.
    mesh.frustumCulled = false;
    return mesh;
  }
}

const scale = (c: Rgb, k: number): Rgb => [c[0] * k, c[1] * k, c[2] * k];
const rgb = (hex: number, k = 1): Rgb => { const c = new THREE.Color(hex); return [c.r * k, c.g * k, c.b * k]; };

export function buildBridge(spec: BridgeSpec, materials: BridgeMaterials): BuiltBridge {
  const structure = new Parts(), lights = new Parts(), trims = new Parts(), screens = new Parts(), holograms = new Parts(), glass = new Parts();
  const { halfWidth: W, noseHalfWidth: N, nose: F, shoulder: S, aft: A, dais, deck, ceiling: top, sill, brow, skylight: sky, palette } = spec;
  const k = W / 3; // the room's size against the standard bridge
  const wall = palette.wall, dark = scale(palette.wall, 0.45), floor = palette.deck, fit = palette.fitting, stripe = palette.stripe;
  const lamp = rgb(palette.light, 1.5), haptic = rgb(palette.haptic, 1.35), plotInk = rgb(palette.plot, 1.2);
  const instruments: BuiltBridge['instruments'] = {};
  const height = top - deck, D = 1.5 * k; // half the width of the commanding officer's deck

  // --- Decks, ceiling, the walls behind and beside.
  structure.add(box(2 * W + 0.4, 0.2, A + F + 0.4), { y: deck - 0.1, z: (A - F) / 2 }, floor);
  // The commanding officer's deck ends, and its rail stands, far enough ahead that the rail's displays are read, not loomed over.
  const daisFront = -Math.max(S + 0.3, 1.85);
  structure.add(box(2 * D, dais - deck, A - daisFront), { y: (dais + deck) / 2, z: (A + daisFront) / 2 }, scale(floor, 1.25));
  structure.add(box(2 * W + 0.4, 0.2, A + F - sky), { y: top + 0.1, z: (A - (F - sky)) / 2 }, dark);
  for (const s of [-1, 1]) structure.add(box(W - N + 0.2, 0.2, sky + 0.1), { x: s * (N + (W - N + 0.2) / 2), y: top + 0.1, z: -F + sky / 2 }, dark);
  structure.add(box(2 * W + 0.4, height, 0.2), { y: (top + deck) / 2, z: A + 0.1 }, wall);
  structure.add(box(1.25, 2.25, 0.06), { y: dais + 1.125, z: A - 0.02 }, fit); // the door aft
  lights.add(box(1.25, 0.04, 0.04), { y: dais + 2.3, z: A - 0.05 }, lamp);
  for (const s of [-1, 1]) structure.add(box(0.2, height, A + S), { x: s * (W + 0.1), y: (top + deck) / 2, z: (A - S) / 2 }, wall);

  // --- The windows across the bow: sill wall and shelf, the bar across their head, posts and mullions.
  const pane = brow - sill, paneY = (brow + sill) / 2;
  structure.add(box(2 * N, sill - deck, 0.25), { y: (sill + deck) / 2, z: -F - 0.125 }, wall);
  structure.add(box(2 * N + 0.1, 0.08, 0.5), { y: sill, z: -F + 0.2 }, fit);
  trims.add(box(2 * N, 0.015, 0.02), { y: sill + 0.045, z: -F + 0.44 }, haptic);
  structure.add(box(2 * N + 0.11, 0.1, 0.16), { y: brow, z: -F }, dark);
  const bars: number[] = [-N, N];
  for (let i = 1; i <= spec.mullions; i++) bars.push(-N + (2 * N * i) / (spec.mullions + 1));
  for (const x of bars) structure.add(box(Math.abs(x) === N ? 0.11 : 0.05, pane, Math.abs(x) === N ? 0.14 : 0.09), { x, y: paneY, z: -F }, dark);
  glass.add(new THREE.PlaneGeometry(2 * N, pane), { y: paneY, z: -F });
  const V = (x: number, y: number, z: number): THREE.Vector3 => new THREE.Vector3(x, y, z);
  const panes: THREE.Vector3[][] = [[V(-N, sill, -F), V(N, sill, -F), V(N, brow, -F), V(-N, brow, -F)]];

  // --- The glazing carried on overhead: a rail up from every post and mullion, a beam where it meets the ceiling.
  const rise = top - brow, run = Math.hypot(rise, sky), pitch = Math.atan2(rise, sky);
  for (const x of bars) structure.add(box(Math.abs(x) === N ? 0.1 : 0.05, 0.07, run), { x, y: (brow + top) / 2, z: -F + sky / 2, rx: -pitch }, dark);
  structure.add(box(2 * N + 0.16, 0.14, 0.16), { y: top, z: -(F - sky) }, dark);
  glass.add(new THREE.PlaneGeometry(2 * N, run), { y: (brow + top) / 2, z: -F + sky / 2, rx: Math.atan2(sky, rise) });
  panes.push([V(-N, brow, -F), V(N, brow, -F), V(N, top, -F + sky), V(-N, top, -F + sky)]);
  // The ship's name over the windows, read by looking up.
  screens.add(screen('plate', 1.9 * k, 1.9 * k / 6), { y: top - 0.24, z: -(F - sky) + 0.09, rx: 0.5 });
  instruments.plate = new THREE.Vector3(0, top - 0.24, -(F - sky) + 0.09);

  // --- The windows of either bow, from the corner posts back to the room's shoulders.
  const bowRun = Math.hypot(W - N, F - S);
  for (const s of [-1, 1]) {
    const x = s * (N + W) / 2, z = -(F + S) / 2, ry = Math.atan2(-(F - S), s * (W - N));
    structure.add(box(bowRun, sill - deck, 0.25), { x, y: (sill + deck) / 2, z, ry }, wall);
    structure.add(box(bowRun, top - brow, 0.25), { x, y: (top + brow) / 2, z, ry }, wall);
    structure.add(box(bowRun, 0.08, 0.36), { x, y: sill, z, ry }, fit);
    structure.add(box(bowRun, 0.1, 0.16), { x, y: brow, z, ry }, dark);
    structure.add(box(0.05, pane, 0.09), { x, y: paneY, z, ry }, dark);
    structure.add(box(0.14, height, 0.26), { x: s * W, y: (top + deck) / 2, z: -S }, dark);
    glass.add(new THREE.PlaneGeometry(bowRun, pane), { x, y: paneY, z, ry });
    panes.push([V(s * N, sill, -F), V(s * W, sill, -S), V(s * W, brow, -S), V(s * N, brow, -F)]);
  }

  // --- Frames: a post up each side and a beam across at every bay, with a strip light under the beam.
  const bays = spec.stations, bay = (A + S) / bays;
  for (let i = 0; i <= bays; i++) {
    const z = -S + i * bay;
    if (i > 0) for (const s of [-1, 1]) structure.add(box(0.18, height, 0.22), { x: s * (W - 0.09), y: (top + deck) / 2, z }, dark);
    structure.add(box(2 * W, 0.16, 0.22), { y: top - 0.08, z }, dark);
    lights.add(box(2 * W * 0.62, 0.03, 0.09), { y: top - 0.175, z }, lamp);
    // An arched frame carries its beam on haunches.
    if (spec.arched) for (const s of [-1, 1]) structure.add(box(0.9, 0.12, 0.2), { x: s * (W - 0.42), y: top - 0.42, z, rz: s * -0.78 }, dark);
  }
  for (const s of [-1, 1]) lights.add(box(0.1, 0.03, A + S - 0.3), { x: s * W * 0.58, y: top - 0.016, z: (A - S) / 2 }, lamp);

  // --- A chair: seat, back, headrest and pedestal, facing −z before it is turned.
  const chair = (x: number, floorY: number, z: number, ry: number): void => {
    const at = (dx: number, dy: number, dz: number): Pose => ({ x: x + dx * Math.cos(ry) + dz * Math.sin(ry), y: floorY + dy, z: z - dx * Math.sin(ry) + dz * Math.cos(ry), ry });
    structure.add(box(0.52, 0.1, 0.5), at(0, 0.5, 0), fit);
    structure.add(box(0.52, 0.78, 0.1), at(0, 0.92, 0.26), fit);
    structure.add(box(0.3, 0.2, 0.09), at(0, 1.42, 0.26), fit);
    structure.add(box(0.46, 0.03, 0.02), at(0, 1.2, 0.315), stripe);
    structure.add(new THREE.CylinderGeometry(0.07, 0.14, 0.46, 8), at(0, 0.23, 0), dark);
  };

  // --- Crew stations down both sides: a desk against the wall, a screen over it, a haptic board on it.
  const stationScreens: ScreenName[] = ['sensors', 'power', 'comms'];
  for (const s of [-1, 1]) for (let i = 0; i < bays; i++) {
    const z = -S + (i + 0.5) * bay, name = stationScreens[(i + (s > 0 ? 1 : 0)) % stationScreens.length];
    structure.add(box(0.5, 0.78, bay * 0.62), { x: s * (W - 0.25), y: deck + 0.39, z }, fit);
    structure.add(box(0.62, 0.06, bay * 0.74), { x: s * (W - 0.31), y: deck + 0.81, z }, dark);
    structure.add(box(0.05, 0.7, bay * 0.66), { x: s * (W - 0.035), y: deck + 1.42, z }, fit);
    screens.add(screen(name, bay * 0.6, Math.min(0.62, bay * 0.6)), { x: s * (W - 0.07), y: deck + 1.42, z, ry: -s * Math.PI / 2 });
    holograms.add(screen('keys', bay * 0.46, 0.34), { x: s * (W - 0.33), y: deck + 0.86, z, ry: -s * Math.PI / 2, rx: -1.25 });
    if (spec.seated) chair(s * (W - 0.98), deck, z, -s * Math.PI / 2);
    instruments[name] ??= new THREE.Vector3(s * (W - 0.07), deck + 1.42, z);
  }

  // --- The helm pit under the windows: a console and a seat for each of the helm, with haptic boards either side.
  const helmZ = -F + 1.05, seats = spec.helms === 2 ? [-0.9 * k, 0.9 * k] : [0];
  seats.forEach((x, i) => {
    structure.add(box(1.25, 0.86, 0.6), { x, y: deck + 0.43, z: -F + 0.36 }, fit);
    structure.add(box(1.3, 0.05, 0.5), { x, y: deck + 0.92, z: -F + 0.5, rx: -0.5 }, dark);
    const name: ScreenName = i === 0 ? 'helm' : 'guns';
    screens.add(screen(name, name === 'helm' ? 0.9 : 0.5, name === 'helm' ? 0.45 : 0.5), { x, y: deck + 1.02, z: -F + 0.5, rx: -0.9 });
    instruments[name] = new THREE.Vector3(x, deck + 1.02, -F + 0.5);
    for (const s of [-1, 1]) holograms.add(screen('keys', 0.34, 0.34), { x: x + s * 0.66, y: deck + 1.08, z: -F + 0.62, rx: -0.9, ry: -s * 0.5 });
    if (spec.seated) chair(x, deck, helmZ, 0);
  });

  // --- The commanding officer's rail: posts, rails, the navy's stripe; a display at either hand; the plot.
  const railZ = daisFront + 0.14, railY = dais + 0.98;
  structure.add(box(2 * D, 0.07, 0.09), { y: railY, z: railZ }, dark);
  structure.add(box(2 * D, 0.03, 0.095), { y: railY - 0.07, z: railZ }, stripe);
  structure.add(box(2 * D, 0.04, 0.05), { y: dais + 0.5, z: railZ }, dark);
  for (const x of [-D, -D * 0.38, D * 0.38, D]) structure.add(box(0.06, 0.98, 0.06), { x, y: dais + 0.49, z: railZ }, dark);
  const hand: [ScreenName, number][] = [['status', -1], ['target', 1]];
  for (const [name, s] of hand) {
    const x = s * 1.02 * k, y = railY + 0.02, z = railZ + 0.04, size = 0.3 + 0.1 * k;
    structure.add(box(size + 0.06, size + 0.06, 0.04), { x, y, z: z - 0.01, rx: -0.62, ry: -s * 0.36 }, fit);
    screens.add(screen(name, size, size), { x: x - s * 0.008, y: y + 0.016, z: z + 0.016, rx: -0.62, ry: -s * 0.36 });
    instruments[name] = new THREE.Vector3(x, y, z);
  }
  const plotR = 0.36 * k, plotY = railY + 0.03, plotZ = railZ - 0.1;
  structure.add(new THREE.CylinderGeometry(0.1, 0.2, 0.98, 12), { y: dais + 0.49, z: plotZ }, dark);
  structure.add(new THREE.CylinderGeometry(plotR * 0.5, plotR * 0.42, 0.06, 20), { y: railY - 0.02, z: plotZ }, fit);
  trims.add(new THREE.TorusGeometry(plotR * 0.5, 0.012, 6, 28), { y: railY + 0.012, z: plotZ, rx: Math.PI / 2 }, plotInk);
  holograms.add(screen('plot', plotR * 2, plotR * 2), { y: plotY + 0.06, z: plotZ, rx: -Math.PI / 2 + 0.34 });
  instruments.plot = new THREE.Vector3(0, plotY + 0.06, plotZ);

  // --- Deck lights: the edges of the commanding officer's deck and its step.
  for (const s of [-1, 1]) trims.add(box(0.03, 0.02, A - daisFront - 0.2), { x: s * (D - 0.02), y: dais + 0.012, z: (A + daisFront) / 2 }, scale(lamp, 0.55));
  trims.add(box(2 * D, 0.03, 0.03), { y: dais - 0.02, z: daisFront - 0.012 }, scale(lamp, 0.55));
  for (const s of [-1, 1]) trims.add(box(0.03, 0.015, F - S - 0.6), { x: s * 0.28 * k, y: deck + 0.012, z: -(F + S) / 2 }, scale(haptic, 0.5));

  const group = new THREE.Group();
  group.name = `bridge:${spec.tier}:${spec.faction}`;
  const add = (mesh: THREE.Mesh | undefined, order: number): void => { if (mesh) { mesh.renderOrder = order; group.add(mesh); } };
  add(structure.mesh(materials.structure, 'structure'), 0);
  add(lights.mesh(materials.lights, 'lights'), 1);
  add(trims.mesh(materials.trims, 'trims'), 1);
  add(screens.mesh(materials.screens, 'screens'), 2);
  add(glass.mesh(materials.glass, 'glass'), 3);
  add(holograms.mesh(materials.holograms, 'holograms'), 4);
  return {
    group, spec, instruments, panes,
    lamps: { room: new THREE.Vector3(0, top - 0.5, -0.2), helm: new THREE.Vector3(0, sill - 0.1, -F + 1.1), plot: new THREE.Vector3(0, plotY + 0.35, plotZ), windows: new THREE.Vector3(0, 0.3, -F + 0.5) },
  };
}
