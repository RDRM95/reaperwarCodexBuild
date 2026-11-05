import type { Vec3 } from '@/core/vec3';
import type { ShipState, Side } from './types';

interface Indexed {
  ship: ShipState;
  index: number;
}

type Rows = Map<number, Map<number, Indexed[]>>;

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
 */
export class WeaponTargetField {
  private readonly cells: Record<Side, Rows> = { A: new Map(), B: new Map() };
  private readonly indexed: Record<Side, Indexed[]> = { A: [], B: [] };
  private readonly maxTravel: Record<Side, number> = { A: 0, B: 0 };
  private readonly initialLength: number;
  private readonly cellSize = 4;
  candidateChecks = 0;

  constructor(private readonly ships: readonly ShipState[], dt: number) {
    this.initialLength = ships.length;
    ships.forEach((ship, index) => {
      if (!ship.alive || ship.escaped) return;
      const side = ship.side;
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
    const reach = range + this.maxTravel[enemy] + 1e-6;
    const x0 = Math.floor((origin.x - reach) / this.cellSize);
    const x1 = Math.floor((origin.x + reach) / this.cellSize);
    const z0 = Math.floor((origin.z - reach) / this.cellSize);
    const z1 = Math.floor((origin.z + reach) / this.cellSize);
    const count = (x1 - x0 + 1) * (z1 - z0 + 1);
    if (!Number.isFinite(count) || count > 2048) {
      for (const candidate of this.indexed[enemy]) {
        this.candidateChecks++;
        visit(candidate.ship, candidate.index);
      }
    } else {
      for (let x = x0; x <= x1; x++) {
        const row = this.cells[enemy].get(x);
        if (!row) continue;
        for (let z = z0; z <= z1; z++) {
          const cell = row.get(z);
          if (!cell) continue;
          for (const candidate of cell) {
            this.candidateChecks++;
            visit(candidate.ship, candidate.index);
          }
        }
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
}
