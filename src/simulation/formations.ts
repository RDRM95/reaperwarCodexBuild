import { v3, type Vec3 } from '@/core/vec3';
import type { ShipRole } from '@/data/types';
import type { FormationType } from './types';
import { BATTLESPACE_SCALE } from './constants';

/**
 * Formation slot assignment. Slots are expressed in fleet-local space: +z is
 * the fleet's facing, +x to the right, +y up. Distances in km. Capital ships
 * are spaced so that a two-kilometre Reaper or a kilometre-long dreadnought
 * does not overlap its neighbours.
 */

export interface SlotShip {
  id: string;
  role: ShipRole;
  lengthKm: number;
}

const tier = (role: ShipRole): number => {
  switch (role) {
    case 'reaper_capital':
    case 'dreadnought':
    case 'carrier':
      return 0;
    case 'cruiser':
    case 'reaper_destroyer':
      return 1;
    case 'frigate':
      return 2;
    case 'fighter':
      return 3;
  }
};

/** Symmetric spread of n items along an axis with spacing s: 0, +s, -s, +2s, ... */
function spreadIndex(i: number): number {
  if (i === 0) return 0;
  const k = Math.ceil(i / 2);
  return i % 2 === 1 ? k : -k;
}

const CHUNK_LIMITS = [8, 12, 16, 24];
const SLOT_SCALE = Math.max(BATTLESPACE_SCALE, 0.55);

export function assignSlots(ships: SlotShip[], formation: FormationType): Map<string, Vec3> {
  const raw = assignSlotsNominal(ships, formation);
  // Spacing between ships compresses with the battlespace, but never below
  // what keeps hulls from overlapping.
  const slots = new Map<string, Vec3>();
  for (const [id, v] of raw) slots.set(id, v3(v.x * SLOT_SCALE, v.y * SLOT_SCALE, v.z * SLOT_SCALE));
  const counts = [0, 0, 0, 0];
  for (const ship of ships) counts[tier(ship.role)]++;
  if (counts.some((count, i) => count > CHUNK_LIMITS[i])) separateLargeFormation(ships, slots);
  return slots;
}

/** Keep mixed tiers clear without moving established small-fleet layouts. */
function separateLargeFormation(ships: SlotShip[], slots: Map<string, Vec3>): void {
  const cellSize = Math.max(0.1, ...ships.map((ship) => ship.lengthKm * 1.1));
  const cells = new Map<string, { pos: Vec3; radius: number }[]>();
  const key = (x: number, y: number, z: number) => `${x},${y},${z}`;
  // Place the largest tiers first so escort clearance cannot displace a capital.
  const ordered = ships.map((ship, index) => ({ ship, index })).sort((a, b) => tier(a.ship.role) - tier(b.ship.role) || a.index - b.index);
  for (const { ship } of ordered) {
    const pos = slots.get(ship.id)!;
    const originalY = pos.y;
    const radius = Math.max(0.01, ship.lengthKm * 0.55);
    const step = Math.max(0.08, ship.lengthKm * 1.1);
    let attempt = 0;
    for (;;) {
      const cx = Math.floor(pos.x / cellSize), cy = Math.floor(pos.y / cellSize), cz = Math.floor(pos.z / cellSize);
      let overlaps = false;
      for (let x = cx - 1; x <= cx + 1 && !overlaps; x++) {
        for (let y = cy - 1; y <= cy + 1 && !overlaps; y++) {
          for (let z = cz - 1; z <= cz + 1 && !overlaps; z++) {
            for (const other of cells.get(key(x, y, z)) ?? []) {
              if (Math.hypot(pos.x - other.pos.x, pos.y - other.pos.y, pos.z - other.pos.z) < radius + other.radius) {
                overlaps = true;
                break;
              }
            }
          }
        }
      }
      if (!overlaps) {
        const k = key(cx, cy, cz);
        const cell = cells.get(k) ?? [];
        cell.push({ pos, radius });
        cells.set(k, cell);
        break;
      }
      pos.y = originalY + spreadIndex(++attempt) * step;
    }
  }
}

/** Repeat compact nominal patterns in ranks/layers instead of extending a line indefinitely. */
function assignChunkedTier(ships: SlotShip[], formation: FormationType, limit: number): Map<string, Vec3> {
  const axes = ['y', 'z', 'x'] as const;
  const chunks: { slots: Map<string, Vec3>; centre: Vec3; size: Vec3 }[] = [];
  const maxSize = v3();
  for (let i = 0; i < ships.length; i += limit) {
    const slots = assignSlotsNominal(ships.slice(i, i + limit), formation);
    const positions = [...slots.values()];
    const centre = v3(), size = v3();
    for (const axis of axes) {
      const low = Math.min(...positions.map((p) => p[axis]));
      const high = Math.max(...positions.map((p) => p[axis]));
      centre[axis] = (low + high) / 2;
      size[axis] = high - low;
      maxSize[axis] = Math.max(maxSize[axis], size[axis]);
    }
    chunks.push({ slots, centre, size });
  }
  const [layerAxis, rankAxis] = [...axes].sort((a, b) => maxSize[a] - maxSize[b]);
  const clearance = Math.max(0.5, ...ships.map((ship) => ship.lengthKm * 1.7)) / SLOT_SCALE;
  const layerStride = maxSize[layerAxis] + clearance;
  const rankStride = maxSize[rankAxis] + clearance;
  // Balance physical footprint rather than simply choosing a square number of chunks.
  const layers = Math.min(chunks.length, Math.ceil(Math.sqrt(chunks.length * rankStride / layerStride)));
  const ranks = Math.ceil(chunks.length / layers);
  const origin = chunks[0].centre;
  const result = new Map<string, Vec3>();
  chunks.forEach((chunk, i) => {
    const offset = v3();
    offset[layerAxis] = ((i % layers) - (layers - 1) / 2) * layerStride;
    offset[rankAxis] = (Math.floor(i / layers) - (ranks - 1) / 2) * rankStride;
    for (const [id, p] of chunk.slots) result.set(id, v3(
      p.x - chunk.centre.x + origin.x + offset.x,
      p.y - chunk.centre.y + origin.y + offset.y,
      p.z - chunk.centre.z + origin.z + offset.z,
    ));
  });
  return result;
}

function assignSlotsNominal(ships: SlotShip[], formation: FormationType): Map<string, Vec3> {
  const slots = new Map<string, Vec3>();
  const byTier: SlotShip[][] = [[], [], [], []];
  for (const s of ships) byTier[tier(s.role)].push(s);
  if (byTier.some((members, i) => members.length > CHUNK_LIMITS[i])) {
    for (let i = 0; i < byTier.length; i++) {
      if (byTier[i].length === 0) continue;
      const tierSlots = byTier[i].length > CHUNK_LIMITS[i]
        ? assignChunkedTier(byTier[i], formation, CHUNK_LIMITS[i])
        : assignSlotsNominal(byTier[i], formation);
      for (const [id, slot] of tierSlots) slots.set(id, slot);
    }
    return slots;
  }
  const [caps, cruisers, frigates, fighters] = byTier;

  const capSpacing = Math.max(3.2, ...caps.map((c) => (c.lengthKm * 1.7) / Math.max(BATTLESPACE_SCALE, 0.55)));
  const cruSpacing = 2.2;
  const friSpacing = 1.6;

  switch (formation) {
    case 'line_abreast': {
      caps.forEach((s, i) => slots.set(s.id, v3(spreadIndex(i) * capSpacing, 0, 0)));
      cruisers.forEach((s, i) => slots.set(s.id, v3(spreadIndex(i) * cruSpacing * 1.3, (i % 2 ? 1 : -1) * 1.2, 4)));
      frigates.forEach((s, i) => slots.set(s.id, v3(spreadIndex(i) * friSpacing * 1.6, (i % 3) * 1.0 - 1, 9)));
      fighters.forEach((s, i) => slots.set(s.id, v3(spreadIndex(i) * 0.6, 2 + (i % 4) * 0.5, 13)));
      break;
    }
    case 'defensive_screen': {
      caps.forEach((s, i) => slots.set(s.id, v3(spreadIndex(i) * capSpacing * 0.9, 0, -4)));
      cruisers.forEach((s, i) => {
        const a = (i / Math.max(1, cruisers.length - 1) - 0.5) * Math.PI * 0.8;
        slots.set(s.id, v3(Math.sin(a) * 9, (i % 2 ? 1 : -1) * 1.5, 3 + Math.cos(a) * 4));
      });
      frigates.forEach((s, i) => {
        const a = (i / Math.max(1, frigates.length - 1) - 0.5) * Math.PI * 1.1;
        slots.set(s.id, v3(Math.sin(a) * 14, ((i % 3) - 1) * 2.0, 7 + Math.cos(a) * 6));
      });
      fighters.forEach((s, i) => slots.set(s.id, v3(spreadIndex(i) * 0.8, 3 + (i % 3) * 0.6, 12)));
      break;
    }
    case 'strike_wedge': {
      caps.forEach((s, i) => {
        const k = Math.ceil(i / 2);
        slots.set(s.id, v3(spreadIndex(i) * capSpacing * 0.8, 0, -k * capSpacing * 0.7));
      });
      cruisers.forEach((s, i) => {
        const k = Math.ceil(i / 2);
        slots.set(s.id, v3(spreadIndex(i) * cruSpacing * 1.4 + (i % 2 ? 2 : -2), (i % 2 ? 1 : -1) * 1.8, -2 - k * 1.2));
      });
      frigates.forEach((s, i) => {
        const k = Math.ceil(i / 2);
        slots.set(s.id, v3(spreadIndex(i) * friSpacing * 2.2, ((i % 3) - 1) * 1.5, 3 - k * 0.8));
      });
      fighters.forEach((s, i) => slots.set(s.id, v3(spreadIndex(i) * 0.6, 2.5 + (i % 3) * 0.5, 6)));
      break;
    }
    case 'capital_column': {
      caps.forEach((s, i) => slots.set(s.id, v3(0, 0, -i * capSpacing)));
      cruisers.forEach((s, i) =>
        slots.set(s.id, v3((i % 2 ? 1 : -1) * (cruSpacing * 2.2), (i % 4 < 2 ? 1 : -1) * 1.5, -Math.floor(i / 2) * 2.5 + 2)),
      );
      frigates.forEach((s, i) =>
        slots.set(s.id, v3((i % 2 ? 1 : -1) * (6 + (i % 4) * 1.2), ((i % 3) - 1) * 2.5, -Math.floor(i / 2) * 1.8 + 4)),
      );
      fighters.forEach((s, i) => slots.set(s.id, v3(spreadIndex(i) * 0.6, 3 + (i % 3) * 0.5, 8)));
      break;
    }
    case 'fighter_screen': {
      caps.forEach((s, i) => slots.set(s.id, v3(spreadIndex(i) * capSpacing, 0, -6)));
      cruisers.forEach((s, i) => slots.set(s.id, v3(spreadIndex(i) * cruSpacing * 1.4, (i % 2 ? 1 : -1) * 1.5, -2)));
      frigates.forEach((s, i) => slots.set(s.id, v3(spreadIndex(i) * friSpacing * 1.6, ((i % 3) - 1) * 1.5, 3)));
      fighters.forEach((s, i) => {
        const a = (i / Math.max(1, fighters.length - 1) - 0.5) * Math.PI;
        slots.set(s.id, v3(Math.sin(a) * 12, ((i % 5) - 2) * 1.2, 10 + Math.cos(a) * 5));
      });
      break;
    }
    case 'dispersed': {
      // Deterministic pseudo-scatter from index.
      const scatter = (i: number, scaleX: number, scaleZ: number): Vec3 => {
        const g = (i * 0.618034) % 1;
        const h = (i * 0.754877) % 1;
        return v3((g - 0.5) * scaleX, ((i * 0.382) % 1 - 0.5) * 6, (h - 0.5) * scaleZ);
      };
      caps.forEach((s, i) => slots.set(s.id, scatter(i + 1, caps.length * capSpacing * 1.4, 14)));
      cruisers.forEach((s, i) => slots.set(s.id, scatter(i + 7, 30, 18)));
      frigates.forEach((s, i) => slots.set(s.id, scatter(i + 19, 40, 22)));
      fighters.forEach((s, i) => slots.set(s.id, scatter(i + 41, 24, 10)));
      break;
    }
  }
  return slots;
}

/** Convert a fleet-local slot to world space given anchor position and heading (unit, y≈0). */
export function slotToWorld(anchor: Vec3, heading: Vec3, slot: Vec3): Vec3 {
  // right = heading × up
  const rx = heading.z;
  const rz = -heading.x;
  return v3(
    anchor.x + rx * slot.x + heading.x * slot.z,
    anchor.y + slot.y,
    anchor.z + rz * slot.x + heading.z * slot.z,
  );
}
