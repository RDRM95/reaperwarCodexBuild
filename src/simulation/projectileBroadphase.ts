import type { Vec3 } from '@/core/vec3';
import type { ShipState, Side } from './types';

interface IndexedShip {
  ship: ShipState;
  index: number;
}

type Columns = Map<number, Map<number, IndexedShip[]>>;

/**
 * Conservative projectile collision broad phase. Ships occupy one X/Z cell
 * each; query bounds expand by the largest enemy hit radius, including the
 * fighter's 2.5x collision allowance. Y is checked by the narrow-phase
 * segment/sphere test. It cannot exclude a genuine collision.
 *
 * Indexed once AFTER movement per simulation tick. Candidate ordering does
 * not affect deterministic results: callers resolve equal hit times using
 * the original ship index.
 */
export class ProjectileBroadphase {
  private readonly columns: Record<Side, Columns> = { A: new Map(), B: new Map() };
  private readonly active: Record<Side, IndexedShip[]> = { A: [], B: [] };
  private readonly maximumRadius: Record<Side, number> = { A: 0, B: 0 };
  private readonly cellSize: number;
  /** Number of narrow-phase ship tests requested by callers. */
  candidateChecks = 0;

  constructor(ships: readonly ShipState[]) {
    let maxRadius = 0;
    for (const ship of ships) {
      if (!ship.alive || ship.escaped) continue;
      maxRadius = Math.max(maxRadius, ship.radiusKm * (ship.role === 'fighter' ? 2.5 : 1));
    }
    this.cellSize = Math.max(2, maxRadius * 2.5);
    ships.forEach((ship, index) => {
      if (!ship.alive || ship.escaped) return;
      const entry = { ship, index };
      const side = ship.side;
      this.active[side].push(entry);
      this.maximumRadius[side] = Math.max(
        this.maximumRadius[side], ship.radiusKm * (ship.role === 'fighter' ? 2.5 : 1),
      );
      const x = Math.floor(ship.pos.x / this.cellSize);
      const z = Math.floor(ship.pos.z / this.cellSize);
      let column = this.columns[side].get(x);
      if (!column) { column = new Map(); this.columns[side].set(x, column); }
      let cell = column.get(z);
      if (!cell) { cell = []; column.set(z, cell); }
      cell.push(entry);
    });
  }

  /**
   * Visit only possible enemy hits for a swept segment. Long shots crossing
   * an excessive number of empty grid cells fall back to the complete list;
   * this bounds lookup overhead without ever losing a collision.
   */
  forSegment(side: Side, from: Vec3, to: Vec3, visit: (ship: ShipState, index: number) => void): void {
    const enemy: Side = side === 'A' ? 'B' : 'A';
    const radius = this.maximumRadius[enemy];
    if (!this.active[enemy].length) return;
    const x0 = Math.floor((Math.min(from.x, to.x) - radius) / this.cellSize);
    const x1 = Math.floor((Math.max(from.x, to.x) + radius) / this.cellSize);
    const z0 = Math.floor((Math.min(from.z, to.z) - radius) / this.cellSize);
    const z1 = Math.floor((Math.max(from.z, to.z) + radius) / this.cellSize);
    const cells = (x1 - x0 + 1) * (z1 - z0 + 1);

    if (!Number.isFinite(cells) || cells > 1024) {
      for (const candidate of this.active[enemy]) {
        this.candidateChecks++;
        visit(candidate.ship, candidate.index);
      }
      return;
    }

    const columns = this.columns[enemy];
    for (let x = x0; x <= x1; x++) {
      const column = columns.get(x);
      if (!column) continue;
      for (let z = z0; z <= z1; z++) {
        const cell = column.get(z);
        if (!cell) continue;
        for (const candidate of cell) {
          this.candidateChecks++;
          visit(candidate.ship, candidate.index);
        }
      }
    }
  }
}
