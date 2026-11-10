import type { Vec3 } from '@/core/vec3';
import type { ShipState, Side } from './types';

interface Indexed {
  ship: ShipState;
  index: number;
}

type Rows = Map<number, Map<number, Indexed[]>>;

/** A candidate list built around one origin and reusable by any query of the same side and range within `SLACK`
 * of it: the mounts of one hull ask the same question a few metres apart. */
interface Neighbourhood {
  side: Side;
  range: number;
  x: number; y: number; z: number;
  list: Indexed[];
}

/** How far (km) a query origin may sit from a cached neighbourhood's origin and still reuse it. */
const SLACK = 1.5;
const SLOTS = 8;

/**
 * Broad-phase for weapon target searches. The index is a snapshot from the
 * start of a simulation tick, before individual hulls move and fire.
 *
 * The query expands by the maximum possible displacement of an enemy during
 * this tick, so a target moving into range cannot be missed. Narrow-phase
 * checks still use the ship's CURRENT position and original weapon arc.
 *
 * New fighters launched halfway through the tick are explicitly visited,
 * preserving targetability without rebuilding the whole index per hull.
 *
 * Most searches find nothing (a point-defence mount with a 2.4 km reach and the enemy 40 km away asks every tick),
 * so two exact shortcuts come first. If the enemy's bounding box at the snapshot is further away than the weapon
 * can reach, there is nothing to visit. Otherwise the candidates are collected once around the first mount that
 * asks and reused by the hull's other mounts of the same range. Both visit a superset of every enemy within range,
 * and callers pick by score and ship index, never by visiting order, so results are unchanged.
 */
export class WeaponTargetField {
  private readonly cells: Record<Side, Rows> = { A: new Map(), B: new Map() };
  private readonly indexed: Record<Side, Indexed[]> = { A: [], B: [] };
  private readonly maxTravel: Record<Side, number> = { A: 0, B: 0 };
  private readonly initialLength: number;
  private readonly cellSize = 4;
  /** Snapshot positions by ship index, and each side's bounding box at the snapshot. */
  private readonly snapX: Float64Array;
  private readonly snapY: Float64Array;
  private readonly snapZ: Float64Array;
  private readonly box: Record<Side, { minX: number; minY: number; minZ: number; maxX: number; maxY: number; maxZ: number }> = {
    A: { minX: Infinity, minY: Infinity, minZ: Infinity, maxX: -Infinity, maxY: -Infinity, maxZ: -Infinity },
    B: { minX: Infinity, minY: Infinity, minZ: Infinity, maxX: -Infinity, maxY: -Infinity, maxZ: -Infinity },
  };
  private readonly slots: Neighbourhood[] = [];
  private nextSlot = 0;
  candidateChecks = 0;

  constructor(private readonly ships: readonly ShipState[], dt: number) {
    this.initialLength = ships.length;
    this.snapX = new Float64Array(ships.length);
    this.snapY = new Float64Array(ships.length);
    this.snapZ = new Float64Array(ships.length);
    ships.forEach((ship, index) => {
      if (!ship.alive || ship.escaped) return;
      const side = ship.side;
      this.snapX[index] = ship.pos.x; this.snapY[index] = ship.pos.y; this.snapZ[index] = ship.pos.z;
      const box = this.box[side];
      if (ship.pos.x < box.minX) box.minX = ship.pos.x;
      if (ship.pos.x > box.maxX) box.maxX = ship.pos.x;
      if (ship.pos.y < box.minY) box.minY = ship.pos.y;
      if (ship.pos.y > box.maxY) box.maxY = ship.pos.y;
      if (ship.pos.z < box.minZ) box.minZ = ship.pos.z;
      if (ship.pos.z > box.maxZ) box.maxZ = ship.pos.z;
      const entry = { ship, index };
      this.indexed[side].push(entry);
      this.maxTravel[side] = Math.max(this.maxTravel[side], ship.maxSpeed * dt);
      const cx = Math.floor(ship.pos.x / this.cellSize);
      const cz = Math.floor(ship.pos.z / this.cellSize);
      let row = this.cells[side].get(cx);
      if (!row) { row = new Map(); this.cells[side].set(cx, row); }
      let cell = row.get(cz);
      if (!cell) { cell = []; row.set(cz, cell); }
      cell.push(entry);
    });
  }

  /**
   * Visit a conservative set of enemies potentially within weapon range.
   * Caller still tests distance, arc, fighter exclusions and scoring.
   * Indices allow exact ship-order tie-breaking regardless of cell ordering.
   */
  forRange(side: Side, origin: Vec3, range: number, visit: (ship: ShipState, index: number) => void): void {
    const enemy: Side = side === 'A' ? 'B' : 'A';
    const list = this.candidates(side, enemy, origin, range);
    if (list) {
      for (let i = 0; i < list.length; i++) {
        this.candidateChecks++;
        visit(list[i].ship, list[i].index);
      }
    }
    // Carriers may launch fighters after the index was constructed.
    for (let i = this.initialLength; i < this.ships.length; i++) {
      const ship = this.ships[i];
      if (ship.side === enemy && ship.alive && !ship.escaped) {
        this.candidateChecks++;
        visit(ship, i);
      }
    }
  }

  /** Whether a search from here could visit anything at all (an enemy within reach, or one launched this tick). */
  hasCandidates(side: Side, origin: Vec3, range: number): boolean {
    const enemy: Side = side === 'A' ? 'B' : 'A';
    const list = this.candidates(side, enemy, origin, range);
    if (list && list.length > 0) return true;
    for (let i = this.initialLength; i < this.ships.length; i++) {
      const ship = this.ships[i];
      if (ship.side === enemy && ship.alive && !ship.escaped) return true;
    }
    return false;
  }

  /** Every enemy that could be within `range` of `origin` now, from the snapshot; undefined when none can be. */
  private candidates(side: Side, enemy: Side, origin: Vec3, range: number): Indexed[] | undefined {
    const reach = range + this.maxTravel[enemy] + 1e-6;
    // Nothing on the enemy side was within reach of this point at the snapshot.
    const box = this.box[enemy];
    const bx = origin.x < box.minX ? box.minX - origin.x : origin.x > box.maxX ? origin.x - box.maxX : 0;
    const by = origin.y < box.minY ? box.minY - origin.y : origin.y > box.maxY ? origin.y - box.maxY : 0;
    const bz = origin.z < box.minZ ? box.minZ - origin.z : origin.z > box.maxZ ? origin.z - box.maxZ : 0;
    if (!(bx * bx + by * by + bz * bz <= reach * reach)) return undefined;
    for (let i = 0; i < this.slots.length; i++) {
      const slot = this.slots[i];
      if (slot.side !== side || slot.range !== range) continue;
      const dx = origin.x - slot.x, dy = origin.y - slot.y, dz = origin.z - slot.z;
      if (dx * dx + dy * dy + dz * dz <= SLACK * SLACK) return slot.list;
    }
    // Collect around this origin with room for the hull's other mounts. An enemy within `range` of a later origin
    // was, at the snapshot, within range + its own travel + SLACK of this one.
    const wide = reach + SLACK;
    const wideSq = wide * wide;
    const list: Indexed[] = [];
    const x0 = Math.floor((origin.x - wide) / this.cellSize);
    const x1 = Math.floor((origin.x + wide) / this.cellSize);
    const z0 = Math.floor((origin.z - wide) / this.cellSize);
    const z1 = Math.floor((origin.z + wide) / this.cellSize);
    const count = (x1 - x0 + 1) * (z1 - z0 + 1);
    const keep = (candidate: Indexed): void => {
      const dx = this.snapX[candidate.index] - origin.x, dy = this.snapY[candidate.index] - origin.y, dz = this.snapZ[candidate.index] - origin.z;
      if (dx * dx + dy * dy + dz * dz <= wideSq) list.push(candidate);
    };
    if (!Number.isFinite(count) || count > 2048) {
      const all = this.indexed[enemy];
      for (let i = 0; i < all.length; i++) keep(all[i]);
    } else {
      const rows = this.cells[enemy];
      for (let x = x0; x <= x1; x++) {
        const row = rows.get(x);
        if (!row) continue;
        for (let z = z0; z <= z1; z++) {
          const cell = row.get(z);
          if (!cell) continue;
          for (let i = 0; i < cell.length; i++) keep(cell[i]);
        }
      }
    }
    const slot: Neighbourhood = { side, range, x: origin.x, y: origin.y, z: origin.z, list };
    if (this.slots.length < SLOTS) this.slots.push(slot);
    else { this.slots[this.nextSlot] = slot; this.nextSlot = (this.nextSlot + 1) % SLOTS; }
    return list;
  }
}
