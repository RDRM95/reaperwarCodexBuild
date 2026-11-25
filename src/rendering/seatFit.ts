import * as THREE from 'three';
import type { Seat } from './cockpit';

/**
 * Where a warship's bridge stands, measured on the hull itself.
 *
 * The seat table (cockpit.ts) puts every warship's bridge a fifth of its length ahead of centre and 8.5 % of its
 * length above its centre line. That is a place in the air over a flat hull (85 m above the centre line of a
 * dreadnought whose back is 30 m above it) and inside the superstructure of a tall one. The bridge is a deckhouse:
 * it stands on the hull's back, with its windows clear of whatever the hull carries ahead of them.
 *
 * `fitBridgeSeat` reads the hull's back along its centre line from the model, puts the eye a little above the
 * highest thing ahead of it, and, where something tall stands ahead (a tower, a fin), moves the bridge forward of
 * it instead of lifting it over.
 *
 * All of it is in the model's own frame: z along the hull (the bow at +z), y up, the origin at the hull's centre.
 */
/** The eye stands this far above what it looks over, as a share of the hull's length, and never less than `CLEAR_UNITS`. */
export const BRIDGE_CLEARANCE = 0.014;
const CLEAR_UNITS = 0.03;
/** A bridge may be moved forward to this share of the hull's length ahead of centre, and no further. */
export const BRIDGE_FORWARD_LIMIT = 0.4;
/** The hull's back is read at these places across the centre line (shares of its length): the bridge has width. */
const ACROSS = [0, -0.035, 0.035, -0.07, 0.07];
const STATIONS = 14;

export interface HullReading {
  /** Height of the hull's back at this place across (x) and along (z) the hull; −Infinity where there is no hull. */
  top(x: number, z: number): number;
  /** Whether the hull stands in the way of a look from `eye` along `direction` (of length one). */
  blocked(eye: THREE.Vector3, direction: THREE.Vector3): boolean;
}

/** Read the hull from its meshes. Sprites (engine glows) are not hull. */
export function readHull(group: THREE.Object3D, length: number): HullReading {
  group.updateMatrixWorld(true);
  const meshes: THREE.Mesh[] = [];
  group.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (mesh.isMesh && !(mesh as unknown as THREE.InstancedMesh).isInstancedMesh && mesh.geometry?.getAttribute('position')) meshes.push(mesh);
  });
  const ray = new THREE.Raycaster();
  const origin = new THREE.Vector3(), way = new THREE.Vector3(), local = new THREE.Vector3();
  const hits: THREE.Intersection[] = [];
  const inverse = new THREE.Matrix4().copy(group.matrixWorld).invert();
  // Hidden parts are still hull: level of detail hides a hull's small parts at a distance, and they come back.
  const cast = (x: number, y: number, z: number, dx: number, dy: number, dz: number): THREE.Intersection[] => {
    ray.set(origin.set(x, y, z).applyMatrix4(group.matrixWorld), way.set(dx, dy, dz).transformDirection(group.matrixWorld));
    hits.length = 0;
    for (const mesh of meshes) mesh.raycast(ray, hits);
    return hits;
  };
  return {
    top(x, z) {
      let top = -Infinity;
      for (const hit of cast(x, length * 2, z, 0, -1, 0)) top = Math.max(top, local.copy(hit.point).applyMatrix4(inverse).y);
      return top;
    },
    blocked: (eye, direction) => cast(eye.x, eye.y, eye.z, direction.x, direction.y, direction.z).length > 0,
  };
}

/** The looks a bridge must have clear: straight ahead, to either bow, and a little up. In the hull's frame. */
const LOOKS = [[0, 0], [-16, 0], [16, 0], [-32, 0], [32, 0], [0, 8], [-20, 8], [20, 8]].map(([yaw, pitch]) => {
  const y = THREE.MathUtils.degToRad(yaw), p = THREE.MathUtils.degToRad(pitch);
  return new THREE.Vector3(Math.sin(y) * Math.cos(p), Math.sin(p), Math.cos(y) * Math.cos(p));
});

/**
 * The bridge's seat on this hull. `seat` is the table's (used where the model has no back to stand on at its
 * centre line: a ring, a pair of hulls). Returns a seat in the same measure: shares of `length`.
 */
export function fitBridgeSeat(hull: HullReading, length: number, seat: Seat): Seat {
  const clearance = Math.max(BRIDGE_CLEARANCE * length, CLEAR_UNITS);
  const from = seat.forward * length, bow = 0.5 * length;
  // The hull's back from the table's station to the bow: the highest of the lines across.
  const zs: number[] = [], back: number[] = [];
  for (let i = 0; i <= STATIONS * 2; i++) {
    const z = from + (bow - from) * (i / (STATIONS * 2));
    let y = -Infinity;
    for (const across of ACROSS) y = Math.max(y, hull.top(across * length, z));
    zs.push(z); back.push(y);
  }
  // For each station the bridge could stand at: the eye must clear everything ahead of it.
  let best: Seat | undefined, bestRise = Infinity;
  const stations = zs.filter((z) => z <= BRIDGE_FORWARD_LIMIT * length + 1e-9).length;
  for (let i = 0; i < stations; i++) {
    if (!Number.isFinite(back[i])) continue; // nothing to stand on here
    let ahead = back[i];
    for (let j = i + 1; j < back.length; j++) if (back[j] > ahead) ahead = back[j];
    // How far the eye would stand above the deck under it. A bridge on its deck beats one on stilts; of two as
    // good, the one further aft keeps more of the bow in its windows.
    const rise = ahead - back[i];
    if (rise < bestRise - 0.004 * length) { bestRise = rise; best = { forward: zs[i] / length, up: (ahead + clearance) / length }; }
  }
  if (!best) return seat;
  // The lines read are a narrow band down the middle. Whatever stands beside it (a sponson, a fin, the wall of a
  // trench the band runs along) must not stand in the windows: lift the bridge until its looks are clear.
  const eye = new THREE.Vector3(0, best.up * length, best.forward * length);
  for (let lift = 0; lift < 40 && LOOKS.some((look) => hull.blocked(eye, look)); lift++) eye.y += clearance;
  return { forward: best.forward, up: eye.y / length };
}
