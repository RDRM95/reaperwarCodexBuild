import { v3, type Vec3 } from '@/core/vec3';
import type { ShipState } from './types';

/** One immutable broad-phase snapshot per tick. Local clearance is a thrust
 * request, never a positional correction or an extra source of velocity.
 *
 * Members are stored as parallel typed arrays (position, velocity, radius and so on by member index) and the grid
 * cells hold member indices, so the pair loop reads packed numbers instead of chasing an object per neighbour. The
 * arithmetic is the vector code it replaced, operation for operation, and neighbours are visited in the same order:
 * results are bit-identical. */
export class SeparationField {
  private cells = new Map<number, number[]>();
  /** Occupied x slabs and (x, y) columns of the grid: a query skips the empty ones without a cell lookup. */
  private slabs = new Set<number>();
  private columns = new Set<number>();
  private index = new Map<string, number>();
  private ids: string[] = [];
  private posX: Float64Array; private posY: Float64Array; private posZ: Float64Array;
  private velX: Float64Array; private velY: Float64Array; private velZ: Float64Array;
  private radius: Float64Array;
  private thrust: Float64Array;
  private responseTime: Float64Array;
  private reaper: Uint8Array;
  /** Unit vector to the hull's enemy target; `aimed` is 0 where there is none. */
  private aimed: Uint8Array;
  private aimX: Float64Array; private aimY: Float64Array; private aimZ: Float64Array;
  private cellSize: number;
  private maxRadius = 0;
  private maxStoppingDistance = 0;
  /** Diagnostic count for bounded-neighbour performance tests. */
  pairChecks = 0;

  constructor(ships: readonly ShipState[]) {
    const n = ships.length;
    this.posX = new Float64Array(n); this.posY = new Float64Array(n); this.posZ = new Float64Array(n);
    this.velX = new Float64Array(n); this.velY = new Float64Array(n); this.velZ = new Float64Array(n);
    this.radius = new Float64Array(n); this.thrust = new Float64Array(n); this.responseTime = new Float64Array(n);
    this.reaper = new Uint8Array(n); this.aimed = new Uint8Array(n);
    this.aimX = new Float64Array(n); this.aimY = new Float64Array(n); this.aimZ = new Float64Array(n);
    const byId = new Map<string, ShipState>();
    for (const ship of ships) byId.set(ship.id, ship);
    let count = 0;
    for (const ship of ships) {
      if (!ship.alive || ship.escaped) continue;
      const i = count++;
      const engine = 0.25 + 0.75 * ship.subsystems.engines;
      const acceleration = Math.max(0.001, ship.acceleration * engine);
      const target = ship.targetId ? byId.get(ship.targetId) : undefined;
      this.ids.push(ship.id);
      this.index.set(ship.id, i);
      this.posX[i] = ship.pos.x; this.posY[i] = ship.pos.y; this.posZ[i] = ship.pos.z;
      const vx = ship.vel.x, vy = ship.vel.y, vz = ship.vel.z;
      this.velX[i] = vx; this.velY[i] = vy; this.velZ[i] = vz;
      const radius = Math.max(0.02, ship.radiusKm);
      this.radius[i] = radius;
      this.thrust[i] = acceleration;
      const speedSq = vx * vx + vy * vy + vz * vz;
      this.responseTime[i] = Math.sqrt(speedSq) / acceleration;
      this.reaper[i] = ship.faction === 'reaper' ? 1 : 0;
      if (target?.alive && !target.escaped && target.side !== ship.side) {
        // normalize(sub(target.pos, ship.pos)), operation for operation.
        const dx = target.pos.x - ship.pos.x, dy = target.pos.y - ship.pos.y, dz = target.pos.z - ship.pos.z;
        const l = Math.sqrt(dx * dx + dy * dy + dz * dz);
        this.aimed[i] = 1;
        if (l > 1e-9) { const inverse = 1 / l; this.aimX[i] = dx * inverse; this.aimY[i] = dy * inverse; this.aimZ[i] = dz * inverse; }
        else { this.aimX[i] = 0; this.aimY[i] = 0; this.aimZ[i] = 1; }
      }
      this.maxRadius = Math.max(this.maxRadius, radius);
      this.maxStoppingDistance = Math.max(this.maxStoppingDistance, speedSq / (2 * acceleration));
    }
    this.cellSize = Math.max(1.5, this.maxRadius * 2.5);
    for (let i = 0; i < count; i++) {
      const cx = Math.floor(this.posX[i] / this.cellSize), cy = Math.floor(this.posY[i] / this.cellSize), cz = Math.floor(this.posZ[i] / this.cellSize);
      const key = this.key(cx, cy, cz);
      const cell = this.cells.get(key);
      if (cell) cell.push(i); else this.cells.set(key, [i]);
      this.slabs.add(cx & 65535);
      this.columns.add((cx & 65535) * 65536 + (cy & 65535));
    }
  }

  private key(x: number, y: number, z: number): number {
    // Exact 48-bit numeric key avoids allocating hundreds of strings per hull
    // per tick. Wrapped distant cells remain safe: the distance test rejects
    // them, and a local query never spans an entire 65,536-cell period.
    return ((x & 65535) * 65536 + (y & 65535)) * 65536 + (z & 65535);
  }

  // Scratch for the passing direction (no vector is allocated per pair).
  private px = 0;
  private py = 0;
  private pz = 0;

  /** Stable passing side. Collinear arrival paths have no geometric normal;
   * choosing opposite vertical lanes breaks that symmetry without random noise. */
  private passingDirection(a: number, b: number, dx: number, dy: number, dz: number): void {
    const aimed = this.reaper[a] === 1 && this.aimed[a] === 1;
    const tx = this.aimX[a], ty = this.aimY[a], tz = this.aimZ[a];
    if (aimed) {
      const along = dx * tx + dy * ty + dz * tz;
      if (along < 0) { dx = dx - tx * along; dy = dy - ty * along; dz = dz - tz * along; }
    }
    if (dx * dx + dy * dy + dz * dz < 1e-8) {
      const sign = this.ids[a] < this.ids[b] ? 1 : -1;
      dx = 0; dy = sign; dz = 0;
      if (aimed) {
        const along = dx * tx + dy * ty + dz * tz;
        dx = dx - tx * along; dy = dy - ty * along; dz = dz - tz * along;
      }
      if (dx * dx + dy * dy + dz * dz < 1e-8) { dx = sign; dy = 0; dz = 0; }
    }
    const l = Math.sqrt(dx * dx + dy * dy + dz * dz);
    if (l > 1e-9) { const inverse = 1 / l; this.px = dx * inverse; this.py = dy * inverse; this.pz = dz * inverse; }
    else { this.px = 0; this.py = 0; this.pz = 1; }
  }

  acceleration(ship: ShipState): Vec3 {
    const self = this.index.get(ship.id);
    if (self === undefined) return v3();
    const posX = this.posX, posY = this.posY, posZ = this.posZ, velX = this.velX, velY = this.velY, velZ = this.velZ;
    const radii = this.radius, response = this.responseTime;
    const sx = posX[self], sy = posY[self], sz = posZ[self];
    const svx = velX[self], svy = velY[self], svz = velZ[self];
    const selfRadius = radii[self], selfThrust = this.thrust[self], selfResponse = response[self];
    const stop = (svx * svx + svy * svy + svz * svz) / (2 * selfThrust);
    const reach = (selfRadius + this.maxRadius) * 1.6 + Math.min(6, (stop + this.maxStoppingDistance) * 1.5);
    const radius = Math.ceil(reach / this.cellSize);
    const cx = Math.floor(sx / this.cellSize), cy = Math.floor(sy / this.cellSize), cz = Math.floor(sz / this.cellSize);
    let fx = 0, fy = 0, fz = 0;
    const reachSq = reach * reach;
    let checks = 0;
    // Cells are visited in x, y, z order, so forces add up in a fixed order; empty slabs and columns (most of the
    // block around a hull) are skipped without touching the cell map.
    for (let gx = cx - radius; gx <= cx + radius; gx++) {
      if (!this.slabs.has(gx & 65535)) continue;
      const slab = (gx & 65535) * 65536;
      for (let gy = cy - radius; gy <= cy + radius; gy++) {
        const column = slab + (gy & 65535);
        if (!this.columns.has(column)) continue;
        for (let gz = cz - radius; gz <= cz + radius; gz++) {
          const cell = this.cells.get(column * 65536 + (gz & 65535));
          if (!cell) continue;
          for (let c = 0; c < cell.length; c++) {
            const other = cell[c];
            if (other === self) continue;
            checks++;
            // The broad phase includes many nearby grid cells that are still outside
            // reaction distance. Reject them without a sqrt.
            const dx = sx - posX[other];
            const dy = sy - posY[other];
            const dz = sz - posZ[other];
            const distSq = dx * dx + dy * dy + dz * dz;
            if (distSq > reachSq) continue;
            const dist = Math.sqrt(distSq);
            const clearance = (selfRadius + radii[other]) * 1.08;
            const influence = clearance + Math.max(0.08, clearance * 0.55);
            const rx = svx - velX[other], ry = svy - velY[other], rz = svz - velZ[other];
            const relativeSpeedSq = rx * rx + ry * ry + rz * rz;
            const horizon = Math.min(6, Math.max(1.5, (selfResponse + response[other]) * 0.5));
            const closestAt = relativeSpeedSq > 1e-8 ? Math.max(0, Math.min(horizon, -(dx * rx + dy * ry + dz * rz) / relativeSpeedSq)) : 0;
            const qx = dx + rx * closestAt, qy = dy + ry * closestAt, qz = dz + rz * closestAt;
            const closestDistance = Math.sqrt(qx * qx + qy * qy + qz * qz);
            const pressure = dist < influence ? (influence - dist) / Math.max(clearance * 0.08, dist - clearance) : 0;
            const anticipation = closestAt > 0 && closestDistance < clearance
              ? (1 - closestDistance / clearance) * (horizon - closestAt) / Math.max(0.5, horizon * 0.3) : 0;
            const strength = Math.max(pressure, anticipation);
            if (strength <= 0) continue;
            if (pressure >= anticipation) this.passingDirection(self, other, dx, dy, dz);
            else this.passingDirection(self, other, qx, qy, qz);
            const push = selfThrust * Math.min(20, strength);
            fx = fx + this.px * push; fy = fy + this.py * push; fz = fz + this.pz * push;
          }
        }
      }
    }
    this.pairChecks += checks;
    // Several neighbours may cancel one another into an away component. Keep
    // Reaper avoidance tactical and lateral even in a crowded capital line.
    if (this.reaper[self] === 1 && this.aimed[self] === 1) {
      const tx = this.aimX[self], ty = this.aimY[self], tz = this.aimZ[self];
      const away = fx * tx + fy * ty + fz * tz;
      if (away < 0) { fx = fx - tx * away; fy = fy - ty * away; fz = fz - tz * away; }
    }
    return v3(fx, fy, fz);
  }
}
