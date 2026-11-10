import { v3, type Vec3 } from '@/core/vec3';
import { FACTIONS } from '@/data/factions';
import type { FactionId, ShipRole } from '@/data/types';
import type { EchelonName, FormationType } from './types';
import { BATTLESPACE_SCALE } from './constants';

/**
 * Formation slot assignment. Slots are expressed in fleet-local space: +z is
 * the fleet's facing, +x to the right, +y up. Distances in km. Capital ships
 * are spaced so that a two-kilometre Reaper or a kilometre-long dreadnought
 * does not overlap its neighbours.
 *
 * Large fleets are composed as an order of battle (version 2, the default):
 * seeded battlegroups with parametrised templates are assigned to echelons
 * (main body, flank concentrations, vanguard, picket screen, reserve, detached
 * salient) whose depth is bounded by the fleet's engagement range. Version 1
 * is the earlier constant-pitch lattice, kept so saved configurations replay
 * with the generator they were made with (see FLEET_LAYOUT_VERSION_KEY).
 */

export interface SlotShip {
  id: string;
  role: ShipRole;
  lengthKm: number;
}

export type { EchelonName } from './types';

export type FleetLayoutVersion = 1 | 2;
/** World-state key carrying the layout generator version of a saved configuration. */
export const FLEET_LAYOUT_VERSION_KEY = 'fleet_layout';
export const CURRENT_FLEET_LAYOUT_VERSION: FleetLayoutVersion = 2;

export function parseFleetLayoutVersion(value: string | undefined): FleetLayoutVersion {
  return value === '1' ? 1 : CURRENT_FLEET_LAYOUT_VERSION;
}

export interface LayoutOptions {
  /** Value-weighted engagement range of the fleet's battle line, simulation km. Bounds committed depth. */
  engagementRangeKm?: number;
  /** Faction whose doctrine weights the template families. */
  faction?: FactionId;
  /** Generator version; saved configurations keep the version they were deployed with. */
  layoutVersion?: FleetLayoutVersion;
}

export interface FleetLayout {
  slots: Map<string, Vec3>;
  /** Seeded per-hull yaw trim (radians, positive to starboard) for the deployment heading and idle facing. */
  headingTrims: Map<string, number>;
  /** Battlegroup index of each hull (0 for small nominal layouts). */
  battlegroups: Map<string, number>;
  echelons: Map<string, EchelonName>;
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
// Original catalogue bounds for the four nominal layout tiers. Keeping this
// guard preserves established small ME layouts while bigger crossover/future
// hulls receive the same physical clearance used by large formations.
const NOMINAL_TIER_MAX_KM = [2.4, 0.56, 0.216, 0.018];

/** Stable per-fleet layout identity. Do not consume combat RNG or hash user
 * account data: only the battle seed and authored anonymous fleet ID. */
export function fleetSlotSeed(seed: number, fleetId: string): number {
  let h = (seed | 0) ^ 0x811c9dc5;
  for (let i = 0; i < fleetId.length; i++)
    h = Math.imul(h ^ fleetId.charCodeAt(i), 16777619);
  return h | 0;
}

export function assignSlots(ships: SlotShip[], formation: FormationType, seed = 0, options?: LayoutOptions): Map<string, Vec3> {
  return composeFleetLayout(ships, formation, seed, options).slots;
}

/** Full deployment geometry: slots plus per-hull heading trims and battlegroup/echelon tags. */
export function composeFleetLayout(ships: SlotShip[], formation: FormationType, seed = 0, options: LayoutOptions = {}): FleetLayout {
  const version = options.layoutVersion ?? CURRENT_FLEET_LAYOUT_VERSION;
  const counts = [0, 0, 0, 0];
  for (const ship of ships) counts[tier(ship.role)]++;
  const large = counts.some((count, i) => count > CHUNK_LIMITS[i]);
  const reapers = reaperOnly(ships);
  const headingTrims = new Map<string, number>();
  const battlegroups = new Map<string, number>();
  const echelons = new Map<string, EchelonName>();
  let raw: Map<string, Vec3>;
  if (large && version === 1) {
    raw = assignBattleGroupsLegacy(ships, formation, seed, battlegroups);
    for (const ship of ships) { headingTrims.set(ship.id, 0); echelons.set(ship.id, 'main'); }
  } else if (large) {
    raw = composeBattleGroups(ships, formation, seed, options, headingTrims, battlegroups, echelons);
  } else {
    raw = assignSlotsNominal(ships, formation);
    // Even a small formation does not parade with every hull exactly parallel:
    // a bounded seeded trim gives each hull its own facing within the line.
    ships.forEach((ship, i) => {
      const bound = version === 1 ? 0 : HULL_TRIM_RAD.nominal * (tier(ship.role) === 0
        ? (reapers ? HULL_TRIM_RAD.reaperCapital : HULL_TRIM_RAD.capital)
        : (reapers ? HULL_TRIM_RAD.reaperDestroyer : HULL_TRIM_RAD.escort));
      headingTrims.set(ship.id, bound ? (layoutNoise(seed, i, 41) - 0.5) * 2 * bound : 0);
      battlegroups.set(ship.id, 0);
      echelons.set(ship.id, 'main');
    });
  }
  // Spacing between ships compresses with the battlespace, but never below
  // what keeps hulls from overlapping.
  const slots = new Map<string, Vec3>();
  for (const [id, v] of raw) slots.set(id, v3(v.x * SLOT_SCALE, v.y * SLOT_SCALE, v.z * SLOT_SCALE));
  const oversized = ships.some(ship => ship.lengthKm > NOMINAL_TIER_MAX_KM[tier(ship.role)]);
  if (large || oversized) separateFormationHulls(ships, slots);
  return { slots, headingTrims, battlegroups, echelons };
}

/** Keep mixed tiers clear without moving established small-fleet layouts. */
function separateFormationHulls(ships: SlotShip[], slots: Map<string, Vec3>): void {
  const cellSize = Math.max(0.1, ...ships.map((ship) => ship.lengthKm * 1.1));
  const cells = new Map<string, { pos: Vec3; radius: number }[]>();
  const key = (x: number, y: number, z: number) => `${x},${y},${z}`;
  // Place the largest tiers first so escort clearance cannot displace a capital.
  const ordered = ships.map((ship, index) => ({ ship, index })).sort((a, b) => tier(a.ship.role) - tier(b.ship.role) || a.index - b.index);
  for (const { ship } of ordered) {
    const pos = slots.get(ship.id)!;
    const origin = { ...pos };
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
      // Search nearby lateral stations instead of stacking displaced escorts
      // into a vertical tower. This runs only on assignment, never per frame.
      const angle = ++attempt * 2.399963229728653;
      const searchRadius = Math.sqrt(attempt) * step;
      pos.x = origin.x + Math.cos(angle) * searchRadius;
      pos.z = origin.z + Math.sin(angle) * searchRadius;
      pos.y = origin.y + Math.sin(attempt * 1.7) * step * 0.35;
    }
  }
}

/** Stable, independent layout noise. Never use the combat RNG: layouts must be
 * reproducible without changing weapon rolls, AI decisions or replay events. */
export function layoutNoise(seed: number, index: number, salt: number): number {
  let x = (seed ^ Math.imul(index + 1, 0x9e3779b9) ^ Math.imul(salt + 1, 0x85ebca6b)) | 0;
  x ^= x >>> 16;
  x = Math.imul(x, 0x7feb352d);
  x ^= x >>> 15;
  x = Math.imul(x, 0x846ca68b);
  x ^= x >>> 16;
  return (x >>> 0) / 4294967296;
}

/** Reaper-only fleets (capitals and destroyers, no frigate tier) keep their
 * ordered pressure-wave geometry: exact templates, no per-hull station trims. */
const reaperOnly = (ships: SlotShip[]): boolean => {
  const members: SlotShip[][] = [[], [], [], []];
  for (const ship of ships) members[tier(ship.role)].push(ship);
  return members[0].every(s => s.role === 'reaper_capital')
    && members[1].every(s => s.role === 'reaper_destroyer')
    && members[2].length === 0 && members[0].length + members[1].length > 0;
};

// ------------------------------------------------------------------ version 1

/** Different groups may use a local tactical screen or assault wedge, while
 * the overall fleet still respects its ordered line, column or broad wedge.
 * Chosen at deployment only; no artificial random movement during combat. */
function localFormation(formation: FormationType, seed: number, index: number): FormationType {
  const roll = layoutNoise(seed, index, 17);
  switch (formation) {
    case 'line_abreast': return roll < 0.43 ? 'line_abreast' : roll < 0.68 ? 'defensive_screen' : roll < 0.87 ? 'strike_wedge' : 'fighter_screen';
    case 'strike_wedge': return roll < 0.55 ? 'strike_wedge' : roll < 0.78 ? 'line_abreast' : 'defensive_screen';
    case 'defensive_screen': return roll < 0.61 ? 'defensive_screen' : roll < 0.85 ? 'line_abreast' : 'fighter_screen';
    case 'fighter_screen': return roll < 0.60 ? 'fighter_screen' : roll < 0.85 ? 'defensive_screen' : 'line_abreast';
    case 'capital_column': return roll < 0.82 ? 'capital_column' : 'line_abreast';
    case 'dispersed': return roll < 0.6 ? 'dispersed' : roll < 0.85 ? 'defensive_screen' : 'line_abreast';
  }
}

/** Deal hulls into battlegroups: Reaper-only fleets round-robin (exact waves),
 * organics with independently seeded per-tier quotas so adjacent groups are
 * not identical 4/6/8/12 templates. */
function dealBattleGroups(ships: SlotShip[], seed: number, reapers: boolean, reaperSpread: number): SlotShip[][] {
  const members: SlotShip[][] = [[], [], [], []];
  for (const ship of ships) members[tier(ship.role)].push(ship);
  const limits = [4, 6, 8, 12];
  const count = Math.max(...members.map((group, i) => Math.ceil(group.length / limits[i])));
  const groups: SlotShip[][] = Array.from({ length: count }, () => []);
  members.forEach((roleShips, role) => {
    if (reapers && reaperSpread === 0) {
      roleShips.forEach((ship, i) => groups[i % count].push(ship));
      return;
    }
    const weights = groups.map((_, i) => reapers
      ? 1 - reaperSpread + layoutNoise(seed, i, 30 + role) * 2 * reaperSpread
      : 0.60 + layoutNoise(seed, i, 30 + role) * 1.20);
    const sum = weights.reduce((a, b) => a + b, 0);
    const expected = weights.map(w => roleShips.length * w / sum);
    const quotas = expected.map(Math.floor);
    const remaining = roleShips.length - quotas.reduce((a, b) => a + b, 0);
    const fractions = expected.map((n, i) => ({ i, fraction: n - quotas[i] }))
      .sort((a, b) => b.fraction - a.fraction || a.i - b.i);
    for (let i = 0; i < remaining; i++) quotas[fractions[i].i]++;
    let cursor = 0;
    for (let i = 0; i < count; i++)
      for (let k = 0; k < quotas[i]; k++) groups[i].push(roleShips[cursor++]);
  });
  return groups;
}

/** Version 1 (constant-pitch lattice). Byte-for-byte the geometry of the
 * generator released with seeded asymmetric task groups; retained for replays
 * of configurations saved before the order-of-battle composer. */
function assignBattleGroupsLegacy(ships: SlotShip[], formation: FormationType, seed: number, battlegroups: Map<string, number>): Map<string, Vec3> {
  const reapers = reaperOnly(ships);
  const groups = dealBattleGroups(ships, seed, reapers, 0);
  const count = groups.length;
  groups.forEach((group, index) => { for (const ship of group) battlegroups.set(ship.id, index); });

  const layouts = groups.map((group, i) =>
    assignSlotsNominal(group, reapers ? formation : localFormation(formation, seed, i)));
  let width = 0, depth = 0;
  for (const layout of layouts) {
    const positions = [...layout.values()];
    if (!positions.length) continue;
    width = Math.max(width, Math.max(...positions.map(p => p.x)) - Math.min(...positions.map(p => p.x)));
    depth = Math.max(depth, Math.max(...positions.map(p => p.z)) - Math.min(...positions.map(p => p.z)));
  }
  const clearance = Math.max(1.8, ...ships.map(ship => ship.lengthKm * 2.5)) / SLOT_SCALE;
  const lateralStride = width + clearance;
  const rearStride = Math.max(depth + clearance, lateralStride * 0.42);
  const wings = Math.max(1, Math.ceil(Math.sqrt(count * 1.6)));
  const slots = new Map<string, Vec3>();

  layouts.forEach((layout, index) => {
    const wave = Math.floor(index / wings);
    const waveCount = Math.min(wings, count - wave * wings);
    const column = index % wings;
    const mean = Array.from({ length: waveCount }, (_, i) => spreadIndex(i))
      .reduce((a, b) => a + b, 0) / waveCount;
    const wing = spreadIndex(column) - mean;
    const phase = index * 2.399963229728653;
    let x = wing * lateralStride;
    let z = -wave * rearStride;
    let y = Math.sin(wing * 0.7) * clearance * 0.18;
    switch (formation) {
      case 'strike_wedge': z -= Math.abs(x) * 0.32; break;
      case 'defensive_screen': z -= wing * wing * lateralStride * 0.09; break;
      case 'fighter_screen': z -= Math.abs(x) * 0.12; break;
      case 'line_abreast': z -= wing * wing * lateralStride * 0.035; break;
      case 'capital_column': {
        const columns = Math.min(3, Math.ceil(Math.sqrt(count)));
        x = spreadIndex(index % columns) * lateralStride * 0.8;
        z = -Math.floor(index / columns) * rearStride;
        break;
      }
      case 'dispersed': {
        const radius = Math.sqrt(index) * lateralStride * 0.74;
        x = Math.cos(phase) * radius * 1.25;
        z = Math.sin(phase) * radius * 0.65;
        break;
      }
    }
    if (reapers) {
      x += (wave % 2) * lateralStride * 0.2;
      y += (wave % 2) * clearance * 0.22;
    } else {
      const isColumn = formation === 'capital_column';
      const flank = layoutNoise(seed, index, 1) - 0.5;
      const advance = layoutNoise(seed, index, 2) - 0.5;
      x += flank * lateralStride * (isColumn ? 0.14 : 0.74);
      z += advance * rearStride * (isColumn ? 0.30 : 0.88);
      const commitment = layoutNoise(seed, index, 3);
      if (commitment < 0.19) z -= rearStride * 0.28;
      else if (commitment > 0.84) z += rearStride * 0.28;
      y += (layoutNoise(seed, index, 4) - 0.5) * clearance * 0.28;
    }

    const local = [...layout.values()];
    if (!local.length) return;
    const centreX = (Math.min(...local.map(p => p.x)) + Math.max(...local.map(p => p.x))) / 2;
    const centreZ = (Math.min(...local.map(p => p.z)) + Math.max(...local.map(p => p.z))) / 2;
    const yaw = reapers ? 0 : (layoutNoise(seed, index, 5) - 0.5) * 0.34;
    const cos = Math.cos(yaw), sin = Math.sin(yaw);
    const scaleX = reapers ? 1 : 0.84 + layoutNoise(seed, index, 6) * 0.32;
    const scaleZ = reapers ? 1 : 0.84 + layoutNoise(seed, index, 7) * 0.36;
    [...layout].forEach(([id, p], localIndex) => {
      const localX = (p.x - centreX) * scaleX;
      const localZ = (p.z - centreZ) * scaleZ;
      const dx = localX * cos - localZ * sin;
      const dz = localX * sin + localZ * cos;
      const trim = reapers ? 0 : layoutNoise(seed ^ Math.imul(index + 1, 0x71e2a9b7), localIndex, 8) - 0.5;
      const trimZ = reapers ? 0 : layoutNoise(seed ^ Math.imul(index + 1, 0x4cf5ad43), localIndex, 9) - 0.5;
      const boundedX = (x + dx + trim * clearance * 0.24) * (reapers ? 1 : 0.72);
      slots.set(id, v3(
        boundedX,
        y + p.y + trimZ * clearance * 0.11,
        z + centreZ + dz - Math.abs(dx) * 0.06 + trimZ * clearance * 0.26,
      ));
    });
  });
  return slots;
}

// ------------------------------------------------------------------ version 2

/*
 * Layout constants below are SIMULATION_ESTIMATE values: deployment geometry
 * has no canon figure, so each is chosen for a stated reason and measured by
 * scripts/silhouette-metrics.ts and tests/fleet-composer.test.ts.
 */
/** Rank (wave) stride never exceeds this fraction of the engagement range, so a
 * committed rear rank can still reach the enemy from the fleet's hold point
 * (the per-hull forward leash is about half a range). Columns are exempt: a
 * column is a deliberately deep order and its rear groups are tagged reserve. */
const RANK_STRIDE_RANGE_FRACTION = 0.3;
/** Depth of the committed body as a fraction of range: organics hold at 0.84
 * of range with a 0.55 leash, so two ranks fit; Reapers hold at 0.68 with
 * longer beams, never hold back and close the gap themselves, so their waves
 * may stand a full group depth plus clearance apart. */
const COMMITTED_DEPTH_RANGE_FRACTION = { organic: 0.6, reaper: 1.15 };
/** Ranks a line, screen or wedge order commits before the remaining groups
 * become reserve ranks: organic lines are two ranks deep, Reaper pressure
 * fronts three waves. */
const COMMITTED_RANKS_CAP = { organic: 2, reaper: 3 };
/** Frontage in groups abreast: a floor for small fleets and growth with the
 * square root of the group count (the legacy lattice's wing rule), so a bigger
 * fleet widens before it deepens. */
const WINGS_FLOOR = { organic: 8, reaper: 7 };
const WINGS_GROWTH = { organic: 1.6, reaper: 1.2 };
/** Altitude layers the committed body stacks into once the frontage is full,
 * with the layer pitch bounded by range so the top and bottom layers still
 * reach the enemy from the hold point (the fourth layer, two pitches up at
 * 0.4 range, adds about 7 % to the engagement distance). Reaper waves keep a
 * tighter two-layer stack. */
const LAYERS_CAP = { organic: 4, reaper: 2 };
const LAYER_PITCH_RANGE_FRACTION = { organic: 0.2, reaper: 0.14 };
/** A Reaper layer never stands closer than one capital spacing above the next,
 * so stacked waves keep the exact nearest-neighbour pitch of a single wave. */
const REAPER_LAYER_PITCH_SPACING = 1.1;
/** Per-hull heading trims (radians): capitals hold a disciplined gun line
 * within the spinal half-arc of their group's yaw, escorts keep their own
 * bearing; Reaper hulls turn in near unison. Small nominal layouts use the
 * `nominal` fraction of each bound so established small-fleet fire sectors
 * are unchanged. */
const HULL_TRIM_RAD = {
  capital: 8 * Math.PI / 180, escort: 20 * Math.PI / 180,
  reaperCapital: 5 * Math.PI / 180, reaperDestroyer: 10 * Math.PI / 180,
  nominal: 0.4,
};
/** Seeded yaw of an echelon's own front (radians), the basis of its groups' trims. */
const ECHELON_YAW_RAD = { organic: 14 * Math.PI / 180, reaper: 6 * Math.PI / 180 };
/** Per-group altitude jitter and the picket screen's altitude offset, as
 * fractions of range and layer pitch: enough to break the sheet, small enough
 * that a 90-hull line stays shallow (tests/battlegroup-layout.test.ts). */
const GROUP_ALTITUDE_RANGE_FRACTION = { organic: 0.03, reaper: 0.008 };
const SCREEN_ALTITUDE_LAYER_FRACTION = 0.3;
/** Fallback battle-line ranges (simulation km) when the caller gives none: the
 * catalogue's main batteries at BATTLESPACE_SCALE (DN 50, Reaper 54, cruiser
 * 36, frigate 24 nominal). */
const FALLBACK_RANGE_KM = { reaperCapital: 54 * BATTLESPACE_SCALE, capital: 50 * BATTLESPACE_SCALE, cruiser: 36 * BATTLESPACE_SCALE, frigate: 24 * BATTLESPACE_SCALE, fighter: 18 * BATTLESPACE_SCALE };

type TemplateFamily = 'line' | 'screen' | 'wedge' | 'column' | 'echelon' | 'diamond' | 'stagger_column' | 'fighter_screen' | 'dispersed';

interface GroupTemplate {
  family: TemplateFamily;
  /** Capital ranks (1-3). */
  rows: number;
  /** Lateral offset between capital ranks, fraction of capital spacing. */
  stagger: number;
  /** Arc radius multiplier for screens. */
  arcRadius: number;
  /** Arc sweep / wedge slope multiplier. */
  sweep: number;
  /** Cruisers deploy as leading flank columns instead of a row ahead. */
  cruiserColumn: boolean;
  /** Per-tier spacing multipliers (capitals, cruisers, frigates, fighters). */
  spacing: [number, number, number, number];
  /** Open (>1) or closed (<1) order. */
  open: number;
  /** Handedness of echelons and asymmetric wedges. */
  side: 1 | -1;
}

interface Doctrine { cohesion: number; aggression: number }

const FAMILY_WEIGHTS: Record<FormationType, Partial<Record<TemplateFamily, number>>> = {
  line_abreast: { line: 0.34, echelon: 0.18, screen: 0.16, diamond: 0.10, stagger_column: 0.08, wedge: 0.08, fighter_screen: 0.06 },
  defensive_screen: { screen: 0.40, line: 0.18, diamond: 0.14, echelon: 0.12, fighter_screen: 0.10, wedge: 0.06 },
  strike_wedge: { wedge: 0.40, echelon: 0.20, line: 0.14, diamond: 0.12, stagger_column: 0.08, screen: 0.06 },
  capital_column: { column: 0.50, stagger_column: 0.25, echelon: 0.13, line: 0.12 },
  fighter_screen: { fighter_screen: 0.45, screen: 0.22, line: 0.15, echelon: 0.10, diamond: 0.08 },
  dispersed: { dispersed: 0.55, screen: 0.15, diamond: 0.12, echelon: 0.10, line: 0.08 },
};
/** Reaper wings use only ordered families, chosen so a line order stays a
 * shallow line (one-row lines and shallow echelons), a wedge order reads as
 * wedges and a column order as columns; their geometry stays exact. */
const REAPER_FAMILY_WEIGHTS: Record<FormationType, Partial<Record<TemplateFamily, number>>> = {
  line_abreast: { line: 0.62, echelon: 0.38 },
  defensive_screen: { line: 0.45, echelon: 0.30, wedge: 0.25 },
  strike_wedge: { wedge: 0.55, echelon: 0.25, line: 0.20 },
  capital_column: { column: 0.60, stagger_column: 0.40 },
  fighter_screen: { line: 0.50, wedge: 0.30, echelon: 0.20 },
  dispersed: { wedge: 0.40, echelon: 0.30, line: 0.30 },
};

function chooseTemplate(formation: FormationType, doctrine: Doctrine, reapers: boolean, seed: number, index: number): GroupTemplate {
  const noise = (salt: number): number => layoutNoise(seed, index, 100 + salt);
  const weights: [TemplateFamily, number][] = [];
  const table = reapers ? REAPER_FAMILY_WEIGHTS[formation] : FAMILY_WEIGHTS[formation];
  for (const [family, base] of Object.entries(table) as [TemplateFamily, number][]) {
    let w = base;
    // Faction doctrine: cohesive navies keep ordered lines and columns, aggressive
    // ones favour wedges and echelons, loose doctrines open into diamonds and scatter.
    if (family === 'line' || family === 'column' || family === 'stagger_column') w *= 0.6 + 0.8 * doctrine.cohesion;
    if (family === 'wedge' || family === 'echelon') w *= 0.6 + 0.8 * doctrine.aggression;
    if (family === 'diamond' || family === 'dispersed') w *= 1.6 - doctrine.cohesion;
    weights.push([family, w]);
  }
  const total = weights.reduce((sum, [, w]) => sum + w, 0);
  let roll = noise(0) * total;
  let family: TemplateFamily = weights[0][0];
  for (const [candidate, w] of weights) { family = candidate; roll -= w; if (roll <= 0) break; }
  const rowsRoll = noise(1);
  if (reapers) {
    // Discrete parameters only: every Reaper wing stays a crisp, exact pattern.
    // A line order keeps one-row wings so the front stays shallow.
    const rows = formation === 'line_abreast' || rowsRoll < 0.55 ? 1 : 2;
    return {
      family, rows, stagger: rows === 1 ? 0 : 0.5,
      arcRadius: 1, sweep: [0.7, 0.9, 1.1][Math.floor(noise(2) * 3)], cruiserColumn: false,
      spacing: [1, 1, 1, 1], open: 1, side: noise(3) < 0.5 ? 1 : -1,
    };
  }
  return {
    family,
    rows: rowsRoll < 0.5 ? 1 : rowsRoll < 0.85 ? 2 : 3,
    stagger: noise(4) * 0.5,
    arcRadius: 0.8 + noise(5) * 0.5,
    sweep: 0.6 + noise(6) * 0.6,
    cruiserColumn: noise(7) < 0.35,
    spacing: [0.75 + noise(8) * 0.5, 0.75 + noise(9) * 0.5, 0.75 + noise(10) * 0.5, 0.75 + noise(11) * 0.5],
    open: noise(12) < 0.3 ? 0.85 : noise(12) > 0.72 ? 1.3 : 1,
    side: noise(13) < 0.5 ? 1 : -1,
  };
}

/** Lay one battlegroup out in local units from its template. Capital ranks
 * keep the gun line; escorts deploy ahead of it (cruisers nearer, frigates
 * further, fighters furthest) in every family so the layered line keeps its
 * meaning. Reaper steps between neighbouring hulls equal the capital spacing
 * exactly, which is what keeps their nearest-neighbour spacing uniform. */
function layoutGroupTemplate(ships: SlotShip[], t: GroupTemplate, reapers: boolean): Map<string, Vec3> {
  const slots = new Map<string, Vec3>();
  const byTier: SlotShip[][] = [[], [], [], []];
  for (const s of ships) byTier[tier(s.role)].push(s);
  const [caps, cruisers, frigates, fighters] = byTier;
  const capSpacing = Math.max(3.2, ...caps.map((c) => (c.lengthKm * 1.7) / SLOT_SCALE)) * t.spacing[0] * t.open;
  const cruSpacing = 2.2 * t.spacing[1] * t.open;
  const friSpacing = 1.6 * t.spacing[2] * t.open;
  const figSpacing = 0.6 * t.spacing[3] * t.open;
  const capHalfWidth = (): number => caps.length ? Math.max(...caps.map(c => Math.abs(slots.get(c.id)!.x))) : 0;
  const capFront = (): number => caps.length ? Math.max(...caps.map(c => slots.get(c.id)!.z)) : 0;
  // Reaper destroyers lead their capitals as an aggressive screen; organic
  // cruisers stand between the gun line and the frigate screen.
  const lead = reapers ? 3.0 : 3.2;
  const put = (s: SlotShip, x: number, y: number, z: number): void => { slots.set(s.id, v3(x, y, z)); };
  const rowsOf = (list: SlotShip[], rows: number, spacing: number, rankDepth: number, stagger: number, z0: number, yAlt: number): void => {
    const perRow = Math.ceil(list.length / Math.max(1, rows));
    list.forEach((s, i) => {
      const row = Math.floor(i / perRow), j = i - row * perRow;
      put(s, spreadIndex(j) * spacing + row * stagger * spacing, yAlt ? ((i % 2 ? 1 : -1) * yAlt) : 0, z0 - row * rankDepth);
    });
  };
  /** Arc ahead of zCentre; the half-angle stays below 81 degrees so the ends never fall behind the centre line. */
  const arcOf = (list: SlotShip[], radius: number, sweep: number, zCentre: number, yStep: number): void => {
    const half = Math.min(sweep / 2, Math.PI * 0.45);
    list.forEach((s, i) => {
      const a = (i / Math.max(1, list.length - 1) - 0.5) * 2 * half;
      put(s, Math.sin(a) * radius, ((i % 3) - 1) * yStep, zCentre + Math.cos(a) * radius);
    });
  };
  const chevronOf = (list: SlotShip[], spacing: number, slope: number, z0: number, yStep: number): void => {
    list.forEach((s, i) => put(s, spreadIndex(i) * spacing, ((i % 3) - 1) * yStep, z0 - Math.abs(spreadIndex(i)) * spacing * slope));
  };
  const columnsOf = (list: SlotShip[], halfGap: number, pitch: number, z0: number, yAlt: number): void => {
    list.forEach((s, i) => put(s, (i % 2 ? 1 : -1) * halfGap, (i % 4 < 2 ? 1 : -1) * yAlt, z0 - Math.floor(i / 2) * pitch));
  };
  // Staggered capital ranks sit 0.9 spacings apart so the diagonal neighbour is never closer than the rank neighbour.
  const rankDepth = capSpacing * (reapers ? 0.9 : 0.6 + 0.3 * t.stagger);

  switch (t.family) {
    case 'line': {
      rowsOf(caps, t.rows, capSpacing, rankDepth, t.stagger, 0, 0);
      const front = capFront();
      if (t.cruiserColumn) columnsOf(cruisers, capHalfWidth() + cruSpacing * 1.3, cruSpacing * 0.7, front + lead + 2.0, 1.0);
      else rowsOf(cruisers, cruisers.length > 4 ? 2 : 1, cruSpacing * 1.3, cruSpacing * 0.9, 0.5, front + lead + 0.8, 1.1);
      rowsOf(frigates, frigates.length > 5 ? 2 : 1, friSpacing * 1.6, friSpacing * 1.1, 0.5, front + lead + 4.6, 0.9);
      rowsOf(fighters, 1, figSpacing, 0, 0, front + lead + 7.5, 0.5);
      break;
    }
    case 'screen': {
      caps.forEach((s, i) => put(s, spreadIndex(i) * capSpacing * 0.9, 0, -Math.abs(spreadIndex(i)) * capSpacing * 0.15 * t.sweep));
      const front = capFront();
      arcOf(cruisers, 5 * t.arcRadius, Math.PI * 0.75 * t.sweep, front + 0.8, 1.2);
      arcOf(frigates, 8.5 * t.arcRadius, Math.PI * 0.95 * t.sweep, front + 2.5, 1.4);
      rowsOf(fighters, 1, figSpacing * 1.3, 0, 0, front + 12, 0.6);
      break;
    }
    case 'wedge': {
      // Arms step exactly one capital spacing so Reaper wings stay crisp.
      // 35 to 60 degrees off the axis; Reaper arms open at 50 degrees or more so a
      // wave of wedges stays shallow enough for the next wave to follow in reach.
      const arm = (reapers ? 0.8 + 0.2 * (t.sweep - 0.6) / 0.6 : 0.55 + 0.35 * (t.sweep - 0.6) / 0.6) * Math.PI / 4 + Math.PI / 8;
      caps.forEach((s, i) => {
        const k = Math.ceil(i / 2), side = i % 2 === 1 ? t.side : -t.side;
        put(s, i === 0 ? 0 : side * k * capSpacing * Math.sin(arm), 0, -k * capSpacing * Math.cos(arm));
      });
      chevronOf(cruisers, cruSpacing * 1.4, reapers ? 0.25 : 0.4, lead + 0.5, 1.2);
      chevronOf(frigates, friSpacing * 2.0, 0.3, lead + 4.0, 1.3);
      rowsOf(fighters, 1, figSpacing, 0, 0, lead + 7.5, 0.5);
      break;
    }
    case 'column': {
      caps.forEach((s, i) => put(s, 0, 0, -i * capSpacing));
      columnsOf(cruisers, cruSpacing * 2.0, 2.2, 2.0, 1.2);
      frigates.forEach((s, i) => put(s, (i % 2 ? 1 : -1) * (5.5 + (i % 4) * 1.1) * friSpacing / 1.6, ((i % 3) - 1) * 1.6, 6.0 - Math.floor(i / 2) * 1.6));
      rowsOf(fighters, 1, figSpacing, 0, 0, 9.0, 0.5);
      break;
    }
    case 'echelon': {
      // Capitals step one spacing along a diagonal 30 to 50 degrees off the lateral axis.
      const angle = (reapers ? 22 : 30 + 20 * (t.sweep - 0.6) / 0.6) * Math.PI / 180;
      caps.forEach((s, i) => put(s, t.side * i * capSpacing * Math.cos(angle), 0, -i * capSpacing * Math.sin(angle)));
      const front = capFront();
      const slope = Math.tan(angle) * 0.4;
      cruisers.forEach((s, i) => put(s, t.side * (i * cruSpacing * 1.3 - 1.5), (i % 2 ? 1 : -1) * 1.1, front + lead + 2.0 - i * cruSpacing * 1.3 * slope));
      frigates.forEach((s, i) => put(s, t.side * (i * friSpacing * 1.6 - 2.5), ((i % 3) - 1) * 1.0, front + lead + 6.5 - i * friSpacing * 1.6 * slope));
      rowsOf(fighters, 1, figSpacing, 0, 0, front + lead + 9, 0.5);
      break;
    }
    case 'diamond': {
      const w = capSpacing * 0.95, d = capSpacing * 0.7 * t.sweep;
      const points = [[0, d], [w, 0], [-w, 0], [0, -d]];
      caps.forEach((s, i) => { const shell = 1 + Math.floor(i / 4) * 0.7; const [x, z] = points[i % 4]; put(s, x * shell + t.side * (shell - 1) * 1.5, 0, z * shell); });
      cruisers.forEach((s, i) => { const a = (i + 0.5) * Math.PI * 2 / Math.max(1, cruisers.length); put(s, Math.sin(a) * (w + cruSpacing), (i % 2 ? 1 : -1) * 1.1, d + lead + Math.cos(a) * (d + cruSpacing) * 0.6); });
      frigates.forEach((s, i) => { const a = (i + 0.25) * Math.PI * 2 / Math.max(1, frigates.length); put(s, Math.sin(a) * (w + friSpacing * 2.4), ((i % 3) - 1) * 1.2, d + lead + 4.0 + Math.cos(a) * (d + friSpacing * 2) * 0.6); });
      rowsOf(fighters, 1, figSpacing, 0, 0, d + lead + 8, 0.5);
      break;
    }
    case 'stagger_column': {
      // Zig-zag: consecutive hulls one spacing apart, same-side hulls 1.2 spacings apart.
      caps.forEach((s, i) => put(s, (i % 2 ? 1 : -1) * capSpacing * 0.4, 0, -i * capSpacing * 0.6));
      columnsOf(cruisers, capSpacing * 0.4 + cruSpacing * 1.6, 1.8, 2.5, 1.2);
      chevronOf(frigates, friSpacing * 1.8, 0.25, lead + 4.5, 1.0);
      rowsOf(fighters, 1, figSpacing, 0, 0, lead + 8, 0.5);
      break;
    }
    case 'fighter_screen': {
      caps.forEach((s, i) => put(s, spreadIndex(i) * capSpacing, 0, -3));
      cruisers.forEach((s, i) => put(s, spreadIndex(i) * cruSpacing * 1.4, (i % 2 ? 1 : -1) * 1.5, -0.4));
      frigates.forEach((s, i) => put(s, spreadIndex(i) * friSpacing * 1.6, ((i % 3) - 1) * 1.5, 2.6));
      arcOf(fighters, 9 * t.arcRadius, Math.PI * t.sweep, 3.5, 1.2);
      break;
    }
    case 'dispersed': {
      const scatter = (i: number, scaleX: number, scaleZ: number, zOffset: number): Vec3 => {
        const g = (i * 0.618034) % 1;
        const h = (i * 0.754877) % 1;
        return v3((g - 0.5) * scaleX, ((i * 0.382) % 1 - 0.5) * 5, zOffset + (h - 0.5) * scaleZ);
      };
      caps.forEach((s, i) => slots.set(s.id, scatter(i + 1, Math.max(1, caps.length) * capSpacing * 1.3, 8 * t.sweep, 0)));
      cruisers.forEach((s, i) => slots.set(s.id, scatter(i + 7, 24 * t.open, 8, lead + 1)));
      frigates.forEach((s, i) => slots.set(s.id, scatter(i + 19, 30 * t.open, 8, lead + 5)));
      fighters.forEach((s, i) => slots.set(s.id, scatter(i + 41, 20, 6, lead + 9)));
      break;
    }
  }
  return slots;
}

interface Echelon {
  name: EchelonName;
  groups: number[];
}

/** Seeded order of battle: which battlegroups form the main body, the flank
 * concentrations, the vanguard, the picket screen, the reserve and a detached
 * salient. The lightest groups go forward as pickets, vanguard and salient,
 * the next lightest form the reserve, the heaviest hold the gun line and the
 * remainder concentrate on the flanks. Concentrations stay compact (at most
 * `blockSize` groups) so they read as concentrations rather than a second line. */
function orderOfBattle(groups: SlotShip[][], seed: number, reapers: boolean, formation: FormationType, blockSize: number): Echelon[] {
  const count = groups.length;
  const weightOf = (group: SlotShip[]): number => group.reduce((sum, s) => sum + [3, 1.4, 0.6, 0.2][tier(s.role)], 0);
  const hasLight = groups.some(g => g.some(s => tier(s.role) >= 1));
  // Heaviest first: the end of this list is the lightest material for the screen.
  const order = groups.map((g, i) => ({ i, w: weightOf(g) })).sort((a, b) => b.w - a.w || a.i - b.i).map(o => o.i);
  const noise = (salt: number): number => layoutNoise(seed, 7, 200 + salt);
  const take = (n: number, fromLight: boolean): number[] => fromLight ? order.splice(order.length - n, n) : order.splice(0, n);
  const echelons: Echelon[] = [];
  const screenCap = Math.max(1, Math.round(count * 0.15));
  if (formation === 'capital_column' || formation === 'dispersed' || count <= 2) {
    // Columns and scatter place every group by index; the screen still leads.
    const screen = hasLight && count >= 4 ? Math.min(screenCap, Math.max(1, Math.round(count * (0.10 + noise(1) * 0.1)))) : 0;
    const screenGroups = take(screen, true);
    echelons.push({ name: 'main', groups: [...order].sort((a, b) => a - b) });
    if (screenGroups.length) echelons.push({ name: 'screen', groups: screenGroups });
    return echelons;
  }
  const share = (lo: number, hi: number, salt: number): number => Math.round(count * (lo + (hi - lo) * noise(salt)));
  let screen = hasLight ? Math.min(Math.max(1, share(0.10, 0.22, 1)), screenCap, Math.floor(count / 2)) : 0;
  // Reapers hold no reserve: they arrive in pressure waves and everything presses.
  let reserve = count >= 4 && !reapers ? Math.max(1, Math.min(share(0.08, 0.2, 2), blockSize)) : 0;
  let flankLeft = count >= 7 ? Math.min(blockSize, Math.max(1, share(0.06, 0.22, 3))) : 0;
  let flankRight = count >= 7 ? Math.min(blockSize, Math.max(1, share(0.06, 0.22, 4))) : 0;
  // Some fleets concentrate on one flank only; small fleets always do.
  if (count >= 7 && (count < 13 || noise(5) < 0.3)) { if (noise(6) < 0.5) flankLeft = 0; else flankRight = 0; }
  let vanguard = count >= 10 && noise(7) < 0.6 ? Math.min(3, Math.max(1, share(0.05, 0.14, 8))) : 0;
  let salient = count >= 10 && noise(9) < 0.35 ? (noise(10) < 0.5 ? 1 : 2) : 0;
  let main = count - screen - reserve - flankLeft - flankRight - vanguard - salient;
  const minimumMain = Math.max(1, Math.ceil(count * 0.35));
  for (const shrink of ['salient', 'vanguard', 'flankRight', 'flankLeft', 'reserve', 'screen'] as const) {
    while (main < minimumMain) {
      if (shrink === 'salient' && salient > 0) { salient--; main++; }
      else if (shrink === 'vanguard' && vanguard > 0) { vanguard--; main++; }
      else if (shrink === 'flankRight' && flankRight > 0) { flankRight--; main++; }
      else if (shrink === 'flankLeft' && flankLeft > 0) { flankLeft--; main++; }
      else if (shrink === 'reserve' && reserve > 0) { reserve--; main++; }
      else if (shrink === 'screen' && screen > 0) { screen--; main++; }
      else break;
    }
  }
  const push = (name: EchelonName, n: number, fromLight: boolean): void => { if (n > 0) echelons.push({ name, groups: take(n, fromLight) }); };
  push('screen', screen, true);
  push('salient', salient, true);
  push('vanguard', vanguard, true);
  push('reserve', reserve, true);
  const body = take(main, false);
  push('flank_left', flankLeft, false);
  push('flank_right', flankRight, false);
  echelons.push({ name: 'main', groups: body });
  return echelons;
}

interface PlacedGroup { x: number; y: number; z: number; yaw: number; echelon: EchelonName; committed: boolean }

/** Reaper wings keep exact spacing, so no two groups of one altitude layer may
 * overlap even by a clearance. Main-body groups stay where the ranks put them;
 * detached groups ahead of the body are taken nearest first and only ever move
 * forward until they clear every group already fixed, groups behind the body
 * only ever move back, so every chain of overlaps cascades outward in one
 * deterministic O(G^2) sweep on assignment and nothing is trapped between the
 * body and a neighbour. Lateral clearance between boxes is 0.7 clearance (the
 * narrowest seeded column gap), depth clearance 0.85. Main-body groups are
 * separated first, front group fixed, so detached groups clear final stations. */
function separateGroups(placed: Map<number, PlacedGroup>, widths: number[], depths: number[], clearance: number): void {
  // Bounding boxes of the yawed groups (per-group yaw jitter stays within 0.05 rad).
  const box = (k: number, yaw: number): [number, number] => {
    const c = Math.abs(Math.cos(yaw)), s = Math.abs(Math.sin(yaw)) + 0.05;
    return [widths[k] * c + depths[k] * s, widths[k] * s + depths[k] * c];
  };
  const entries = [...placed.entries()].sort((a, b) => a[0] - b[0]);
  const conflicts = (i: number, p: PlacedGroup, j: number, q: PlacedGroup): number | undefined => {
    if (Math.abs(p.y - q.y) > clearance * 0.5) return undefined;
    const [wi, di] = box(i, p.yaw), [wj, dj] = box(j, q.yaw);
    if (Math.abs(p.x - q.x) >= (wi + wj) / 2 + clearance * 0.7) return undefined;
    return (di + dj) / 2 + clearance * 0.85;
  };
  // Main-body groups normally clear one another by construction (seeded column
  // gaps, rank strides); a scatter order can stack them, so the front group of
  // a conflicting pair stays and the rear one moves back.
  const mains = entries.filter(([, p]) => p.echelon === 'main').sort((a, b) => b[1].z - a[1].z || a[0] - b[0]);
  for (let a = 0; a < mains.length; a++) {
    const [i, p] = mains[a];
    for (let b = 0; b < a; b++) {
      const [j, q] = mains[b];
      const need = conflicts(i, p, j, q);
      if (need !== undefined && p.z > q.z - need) p.z = q.z - need;
    }
  }
  const bodyZ = mains.length ? mains.reduce((sum, [, p]) => sum + p.z, 0) / mains.length : 0;
  const detached = entries.filter(([, p]) => p.echelon !== 'main');
  const ahead = detached.filter(([, p]) => p.z >= bodyZ).sort((a, b) => a[1].z - b[1].z || a[0] - b[0]);
  const behind = detached.filter(([, p]) => p.z < bodyZ).sort((a, b) => b[1].z - a[1].z || a[0] - b[0]);
  const fixedAhead = [...mains];
  for (const [i, p] of ahead) {
    for (const [j, q] of fixedAhead) {
      const need = conflicts(i, p, j, q);
      if (need !== undefined && p.z < q.z + need) p.z = q.z + need;
    }
    fixedAhead.push([i, p]);
  }
  const fixedBehind = [...mains];
  for (const [i, p] of behind) {
    for (const [j, q] of fixedBehind) {
      const need = conflicts(i, p, j, q);
      if (need !== undefined && p.z > q.z - need) p.z = q.z - need;
    }
    fixedBehind.push([i, p]);
  }
}

function fallbackRangeKm(ships: SlotShip[]): number {
  if (ships.some(s => s.role === 'reaper_capital')) return FALLBACK_RANGE_KM.reaperCapital;
  if (ships.some(s => tier(s.role) === 0)) return FALLBACK_RANGE_KM.capital;
  if (ships.some(s => tier(s.role) === 1)) return FALLBACK_RANGE_KM.cruiser;
  if (ships.some(s => tier(s.role) === 2)) return FALLBACK_RANGE_KM.frigate;
  return FALLBACK_RANGE_KM.fighter;
}

/** Altitude of layer k: 0, +1, -1, +2, -2 ... layer pitches. */
const layerAltitude = (k: number, pitch: number): number => (k === 0 ? 0 : (k % 2 ? 1 : -1) * Math.ceil(k / 2) * pitch);

/** Version 2: the order-of-battle composer. O(groups) placement plus O(N)
 * per-hull transforms; the clearance pass runs afterwards. Nothing here runs
 * per frame and nothing consumes the combat RNG. */
function composeBattleGroups(ships: SlotShip[], formation: FormationType, seed: number, options: LayoutOptions,
  headingTrims: Map<string, number>, battlegroups: Map<string, number>, echelonOf: Map<string, EchelonName>): Map<string, Vec3> {
  const reapers = reaperOnly(ships);
  const kind = reapers ? 'reaper' : 'organic';
  const doctrine: Doctrine = options.faction && FACTIONS[options.faction]
    ? { cohesion: FACTIONS[options.faction].doctrine.cohesion, aggression: FACTIONS[options.faction].doctrine.aggression }
    : reapers ? { cohesion: 0.9, aggression: 0.95 } : { cohesion: 0.8, aggression: 0.55 };
  const groups = dealBattleGroups(ships, seed, reapers, reapers ? 0.3 : 0);
  const count = groups.length;
  const roleOf = new Map<string, ShipRole>();
  groups.forEach((group, index) => { for (const ship of group) { battlegroups.set(ship.id, index); roleOf.set(ship.id, ship.role); } });
  const templates = groups.map((_, i) => chooseTemplate(formation, doctrine, reapers, seed, i));
  const layouts = groups.map((group, i) => layoutGroupTemplate(group, templates[i], reapers));
  // Normalise every group to its bounding-box centre and record its size.
  const widths: number[] = [], depths: number[] = [];
  layouts.forEach(layout => {
    const positions = [...layout.values()];
    const minX = Math.min(...positions.map(p => p.x)), maxX = Math.max(...positions.map(p => p.x));
    const minZ = Math.min(...positions.map(p => p.z)), maxZ = Math.max(...positions.map(p => p.z));
    const cx = (minX + maxX) / 2, cz = (minZ + maxZ) / 2;
    for (const p of positions) { p.x -= cx; p.z -= cz; }
    widths.push(maxX - minX); depths.push(maxZ - minZ);
  });
  const clearance = Math.max(1.8, ...ships.map(ship => ship.lengthKm * 2.5)) / SLOT_SCALE;
  const rangeUnits = (options.engagementRangeKm ?? fallbackRangeKm(ships)) / SLOT_SCALE;
  const deepest = Math.max(...depths);
  const meanDepth = depths.reduce((a, b) => a + b, 0) / count;
  const meanWidth = widths.reduce((a, b) => a + b, 0) / count;
  const isColumn = formation === 'capital_column';
  // Rank stride: a group depth plus clearance between ranks, which organic
  // lines bound by reach (0.3 range) so the second rank still bears from the
  // hold point. Reaper waves and columns never interleave.
  const strideCap = reapers || isColumn ? Infinity : RANK_STRIDE_RANGE_FRACTION * rangeUnits;
  const stride = Math.max(clearance * 1.2, Math.min(meanDepth + clearance, strideCap));
  const depthBudget = COMMITTED_DEPTH_RANGE_FRACTION[kind] * rangeUnits;
  const committedRanks = Math.max(1, Math.min(COMMITTED_RANKS_CAP[kind], Math.floor(depthBudget / stride)));
  const frontCap = Math.max(WINGS_FLOOR[kind], Math.ceil(Math.sqrt(count * WINGS_GROWTH[kind])));
  const layersCap = LAYERS_CAP[kind];
  const capitalSpacing = Math.max(3.2, ...ships.filter(s => tier(s.role) === 0).map(s => (s.lengthKm * 1.7) / SLOT_SCALE));
  const layerPitch = Math.max(LAYER_PITCH_RANGE_FRACTION[kind] * rangeUnits, reapers ? capitalSpacing * REAPER_LAYER_PITCH_SPACING : 0);
  const pitch = meanWidth + clearance;
  const noise = (index: number, salt: number): number => layoutNoise(seed, index, 300 + salt);
  const gapNoise = (index: number, salt: number): number => reapers ? 0.72 + noise(index, salt) * 0.28 : 0.55 + noise(index, salt) * 1.1;

  const placed = new Map<number, PlacedGroup>();
  /** Lay `members` along a front at `z0`: up to `wings` abreast, `ranks` deep and `layers` high,
   * filled front rank first and the centre layer first. Column positions carry seeded per-gap
   * pitch and skipped cells (corridors) and are shared by every layer, so corridors run through
   * the whole block; odd ranks stagger and odd layers sit over the gaps between the columns below
   * (a checkerboard in elevation), so no hull stands directly above or behind another. Rank depth
   * comes from the groups actually in each rank, bounded by reach for organics. Returns the
   * block's half-width and rearmost rank depth. */
  const layBlock = (members: number[], wings: number, ranks: number, layers: number, centreX: number, z0: number, density: number,
    echelon: EchelonName, salt: number, yaw: number, committed = true): { halfWidth: number; rear: number } => {
    const cells = Math.max(1, wings) * Math.max(1, ranks);
    const layerCount = Math.max(1, Math.min(layers, Math.ceil(members.length / cells)));
    // Each block's layers take a seeded pitch (organics 0.85-1.15, Reapers 1.0-1.2
    // of the fleet's) so the strata of neighbouring blocks are not level.
    const blockPitch = layerPitch * (reapers ? 1 + noise(salt, 7) * 0.2 : 0.85 + noise(salt, 7) * 0.3);
    const rows: number[][][] = [];
    for (let k = 0; k < layerCount; k++) {
      rows.push([]);
      for (let r = 0; r < ranks; r++) rows[k].push(members.slice(k * cells + r * wings, k * cells + (r + 1) * wings));
    }
    // Bounding boxes of the groups once the block's yaw (and the per-group yaw jitter) is applied.
    const yawCos = Math.abs(Math.cos(yaw)), yawSin = Math.abs(Math.sin(yaw)) + (reapers ? 0.03 : 0.14);
    const boxWidth = (g: number): number => widths[g] * yawCos + depths[g] * yawSin;
    const boxDepth = (g: number): number => widths[g] * yawSin + depths[g] * yawCos;
    let halfWidth = 0, z = z0, rear = z0, previousDepth = 0;
    for (let r = 0; r < ranks; r++) {
      const columns = Math.max(...rows.map(layer => layer[r].length));
      if (columns <= 0) break;
      const columnWidth = Array.from({ length: columns }, (_, c) => Math.max(0, ...rows.map(layer => layer[r][c] === undefined ? 0 : boxWidth(layer[r][c]))));
      const rankDepth = Math.max(0, ...rows.flatMap(layer => layer[r].map(boxDepth)));
      if (r > 0) z -= Math.min(strideCap, previousDepth / 2 + rankDepth / 2 + clearance * (0.9 + noise(r, salt + 5) * 0.3));
      previousDepth = rankDepth;
      const gaps: number[] = [];
      for (let c = 1; c < columns; c++) {
        let gap = (columnWidth[c - 1] + columnWidth[c]) / 2 + clearance * gapNoise(c, salt + r) * density;
        // One cell in roughly five is skipped: an approach corridor or a gap in the line.
        if (!reapers && columns >= 6 && noise(c, salt + r + 1) < 0.2) gap += pitch * (0.6 + noise(c, salt + r + 2) * 0.8);
        gaps.push(gap);
      }
      const total = gaps.reduce((a, b) => a + b, 0);
      const stagger = (r % 2) * pitch * (reapers ? 0.2 + noise(r, salt + 3) * 0.15 : 0.35 + noise(r, salt + 3) * 0.3) * (noise(r, salt + 4) < 0.5 ? 1 : -1);
      const xs: number[] = [];
      let x = centreX - total / 2 + stagger;
      for (let c = 0; c < columns; c++) { if (c > 0) x += gaps[c - 1]; xs.push(x); }
      rows.forEach((layer, k) => {
        const over = k % 2 === 1;
        const toward = noise(k, salt + 6) < 0.5 ? 1 : -1;
        layer[r].forEach((g, c) => {
          // Odd layers stand over the gap beside their column, half a gap towards the seeded side.
          const neighbour = toward > 0 ? (c + 1 < columns ? xs[c + 1] : xs[c] + (xs[c] - (xs[c - 1] ?? xs[c] - pitch))) : (c > 0 ? xs[c - 1] : xs[c] - ((xs[c + 1] ?? xs[c] + pitch) - xs[c]));
          const x = over ? (xs[c] + neighbour) / 2 : xs[c];
          placed.set(g, { x, y: layerAltitude(k, blockPitch), z, yaw, echelon, committed });
          halfWidth = Math.max(halfWidth, Math.abs(x - centreX) + boxWidth(g) / 2);
        });
      });
      rear = z;
    }
    return { halfWidth, rear };
  };

  const blockSize = Math.max(2 * committedRanks, Math.round(count * 0.1));
  const echelons = orderOfBattle(groups, seed, reapers, formation, blockSize);
  const byName = (name: EchelonName): number[] => echelons.find(e => e.name === name)?.groups ?? [];
  const echelonYaw = (salt: number): number => (noise(99, salt) - 0.5) * 2 * ECHELON_YAW_RAD[kind];
  // Forward offsets of the leading echelons, in strides: a Reaper line order
  // keeps its horns and pickets close so the front stays a shallow line.
  const forward = reapers && formation === 'line_abreast' ? 0.45 : 1;

  if (isColumn) {
    // Each column stacks its own groups with exactly one clearance between
    // them (no interleaving), heads staggered so the lanes are not level.
    const columns = Math.min(3, Math.ceil(Math.sqrt(count)));
    const main = byName('main');
    const lanePitch = (Math.max(...widths) + clearance) * 0.8;
    const offsets = Array.from({ length: columns }, (_, c) => spreadIndex(c) * lanePitch * (0.85 + noise(c, 50) * 0.3));
    const heads = Array.from({ length: columns }, (_, c) => c === 0 ? 0 : -(noise(c, 53) * 0.6) * stride);
    const tails = heads.map(h => h);
    const last: (number | undefined)[] = Array.from({ length: columns }, () => undefined);
    main.forEach((g, i) => {
      const column = i % columns;
      const previous = last[column];
      const z = previous === undefined ? heads[column]
        : tails[column] - depths[previous] / 2 - depths[g] / 2 - clearance * (reapers ? 1 : 0.9 + noise(g, 51) * 0.3);
      tails[column] = z;
      last[column] = g;
      const committed = z >= -depthBudget;
      placed.set(g, { x: offsets[column], y: 0, z, yaw: 0, echelon: committed ? 'main' : 'reserve', committed });
    });
    // The screen leads the column heads in the same lanes rather than spreading across a front.
    byName('screen').forEach((g, i) => {
      const column = i % columns, rank = Math.floor(i / columns);
      placed.set(g, { x: offsets[column] * 1.1, y: 0, z: heads[column] + deepest / 2 + clearance + rank * (deepest + clearance) + depths[g] / 2, yaw: echelonYaw(1), echelon: 'screen', committed: true });
    });
  } else if (formation === 'dispersed') {
    const main = byName('main'), screen = byName('screen');
    [...main, ...screen].forEach((g, i) => {
      const phase = i * 2.399963229728653;
      const radius = Math.sqrt(i) * pitch * (0.6 + noise(g, 52) * 0.3);
      const ahead = screen.includes(g) ? stride * 0.8 : 0;
      placed.set(g, { x: Math.cos(phase) * radius * 1.3, y: 0, z: ahead + Math.sin(phase) * Math.min(radius * 0.6, depthBudget * 0.5), yaw: 0, echelon: screen.includes(g) ? 'screen' : 'main', committed: true });
    });
  } else {
    // Main body: the heaviest groups hold the gun line, front rank first, as
    // few ranks as the frontage allows, then altitude layers; whatever the
    // frontage and layers cannot hold becomes the reserve (its lightest groups).
    const main = byName('main');
    // Organics fill their committed ranks, then the floor frontage, then altitude
    // layers and only then widen towards the frontage cap; Reaper waves stack a
    // second layer before a third wave, so a pressure front stays within reach.
    const mainRanks = reapers
      ? Math.min(committedRanks, Math.max(1, Math.ceil(main.length / (frontCap * layersCap))))
      : Math.min(committedRanks, Math.max(1, Math.ceil(main.length / frontCap)));
    let mainWings = Math.min(frontCap, Math.ceil(main.length / mainRanks));
    if (mainWings > WINGS_FLOOR[kind]) mainWings = Math.max(WINGS_FLOOR[kind], Math.min(frontCap, Math.ceil(main.length / (mainRanks * layersCap))));
    const capacity = mainWings * mainRanks * layersCap;
    const overflow = main.length > capacity ? main.splice(capacity) : [];
    const body = layBlock(main, mainWings, mainRanks, layersCap, 0, 0, 1, 'main', 10, echelonYaw(2) * 0.5);
    const mainHalf = body.halfWidth;
    // Flank concentrations: organics extend the line beside the body, one refused
    // and one advanced by seed; Reaper flanks are forward horns overlapping the
    // ends of the body, a crescent that reads as a claw rather than a wider line.
    const flankAdvance = noise(98, 20) < 0.5 ? 1 : -1;
    for (const [name, sign, salt] of [['flank_left', -1, 30], ['flank_right', 1, 40]] as [EchelonName, number, number][]) {
      const members = byName(name);
      if (!members.length) continue;
      // A concentration is a compact block: wings by the lattice rule, up to the
      // committed rank count, and only then altitude layers (never a tower).
      const wings = Math.max(1, Math.min(members.length, Math.round(Math.sqrt(members.length * 1.6 / layersCap))));
      const ranks = Math.min(committedRanks, Math.max(1, Math.ceil(members.length / wings)));
      const width = Math.max(0, ...members.map(g => widths[g])) * wings + clearance * (wings - 1);
      const centreX = reapers
        ? sign * Math.max(0, mainHalf - width * 0.5)
        : sign * (mainHalf + clearance * (0.6 + noise(99, salt) * 0.8) + width / 2);
      const z0 = reapers ? 0 : stride * (0.15 + noise(99, salt + 1) * 0.2) * (sign === flankAdvance ? 1 : -1);
      const block = layBlock(members, wings, ranks, layersCap, centreX, z0, 0.85 + noise(99, salt + 2) * 0.3, name, salt, echelonYaw(salt) + sign * (reapers ? -0.05 : -0.08));
      if (reapers) {
        // The horn stands wholly ahead of the body's end groups it overlaps: its
        // rearmost wave clears the body's front by at least a clearance.
        const lift = -block.rear + deepest / 2 + Math.max(...members.map(g => depths[g])) / 2 + clearance * Math.max(0.75, forward * (1.0 + noise(99, salt + 1) * 0.25));
        for (const g of members) placed.get(g)!.z += lift;
      }
    }
    const vanguard = byName('vanguard');
    if (vanguard.length) layBlock(vanguard, vanguard.length, 1, 1, (noise(99, 70) - 0.5) * mainHalf * 0.6, stride * forward * ((reapers ? 1.0 : 0.65) + noise(99, 71) * 0.35), 0.9, 'vanguard', 70, echelonYaw(3));
    const screen = byName('screen');
    if (screen.length) {
      const z0 = stride * forward * ((vanguard.length ? 1.45 : 1.0) + noise(99, 80) * 0.4);
      layBlock(screen, screen.length, 1, 1, (noise(99, 81) - 0.5) * mainHalf * 0.3, z0, 1.35 + noise(99, 82) * 0.4, 'screen', 80, echelonYaw(4));
    }
    const reserve = [...byName('reserve'), ...overflow];
    if (reserve.length) {
      const reserveWings = Math.max(1, Math.min(Math.max(2, mainWings - 1), Math.ceil(Math.sqrt(reserve.length * 1.6))));
      const ranks = Math.max(1, Math.ceil(reserve.length / (reserveWings * layersCap)));
      const z0 = body.rear - stride * (1.1 + noise(99, 90) * 0.5);
      layBlock(reserve, reserveWings, ranks, layersCap, (noise(99, 91) - 0.5) * mainHalf * 0.7, z0, 0.9 + noise(99, 92) * 0.25, 'reserve', 90, echelonYaw(5) * 0.6, false);
    }
    const salient = byName('salient');
    if (salient.length) {
      const sign = noise(99, 95) < 0.5 ? -1 : 1;
      layBlock(salient, salient.length, 1, 1, sign * mainHalf * (0.5 + noise(99, 96) * 0.4), stride * forward * ((reapers ? 2.1 : 1.3) + noise(99, 97) * 0.5), 1, 'salient', 95, echelonYaw(6));
    }
    // Fleet-scale bow or sweep, bounded so the committed body stays within its depth budget.
    const halfSpan = Math.max(1, ...[...placed.values()].map(p => Math.abs(p.x)));
    const sweepBudget = Math.max(0, depthBudget + body.rear - deepest * 0.5);
    for (const p of placed.values()) {
      if (!p.committed) continue;
      switch (formation) {
        case 'strike_wedge': p.z -= Math.min(Math.abs(p.x) * (reapers ? 0.32 : 0.26), sweepBudget * (reapers ? 1.5 : 1.1)); break;
        case 'defensive_screen': p.z -= (p.x / halfSpan) ** 2 * Math.min(sweepBudget, pitch * (reapers ? 0.5 : 0.9)); break;
        case 'fighter_screen': p.z -= Math.min(Math.abs(p.x) * 0.12, sweepBudget); break;
        case 'line_abreast': p.z -= (p.x / halfSpan) ** 2 * Math.min(sweepBudget * 0.5, pitch * (reapers ? 0.25 : 0.35)); break;
        default: break;
      }
    }
  }
  // Committed groups never sit deeper than the reach budget allows (reserves may).
  const deepestCommitted = -(depthBudget - deepest * 0.5);
  for (const p of placed.values()) if (p.committed && !isColumn && p.z < deepestCommitted) p.z = deepestCommitted;
  // Per-group placement jitter, before the Reaper separation pass sees the final centres.
  for (const [index, p] of placed) {
    p.x += reapers ? 0 : (noise(index, 1) - 0.5) * pitch * 0.18;
    p.z += (noise(index, 2) - 0.5) * stride * (reapers ? 0.08 : 0.3);
  }
  if (reapers) separateGroups(placed, widths, depths, clearance);

  // Per-group altitude and yaw; per-hull station trims and heading trims.
  const slots = new Map<string, Vec3>();
  const altitude = rangeUnits * GROUP_ALTITUDE_RANGE_FRACTION[kind];
  const screenAltitude = layerPitch * SCREEN_ALTITUDE_LAYER_FRACTION * (noise(99, 4) < 0.5 ? 1 : -1);
  const capitalTrim = reapers ? HULL_TRIM_RAD.reaperCapital : HULL_TRIM_RAD.capital;
  const escortTrim = reapers ? HULL_TRIM_RAD.reaperDestroyer : HULL_TRIM_RAD.escort;
  layouts.forEach((layout, index) => {
    const p = placed.get(index) ?? { x: 0, y: 0, z: 0, yaw: 0, echelon: 'main' as EchelonName, committed: true };
    const y = p.y + (noise(index, 3) - 0.5) * 2 * altitude + (p.echelon === 'screen' ? screenAltitude : 0);
    const groupYaw = p.yaw + (noise(index, 5) - 0.5) * 2 * (reapers ? 0.03 : 0.14);
    const cos = Math.cos(groupYaw), sin = Math.sin(groupYaw);
    const scale = reapers ? 1 : 0.9 + noise(index, 6) * 0.25;
    const localSeed = seed ^ Math.imul(index + 1, 0x71e2a9b7);
    [...layout].forEach(([id, local], localIndex) => {
      const lx = local.x * scale, lz = local.z * scale;
      const dx = lx * cos - lz * sin;
      const dz = lx * sin + lz * cos;
      const trimX = reapers ? 0 : (layoutNoise(localSeed, localIndex, 8) - 0.5) * clearance * 0.24;
      const trimZ = reapers ? 0 : (layoutNoise(localSeed, localIndex, 9) - 0.5) * clearance * 0.26;
      slots.set(id, v3(p.x + dx + trimX, y + local.y, p.z + dz + trimZ));
      // Capitals keep the group's bearing within their spinal arcs; escorts
      // hold their own course within the line.
      const bound = tier(roleOf.get(id)!) === 0 ? capitalTrim : escortTrim;
      const own = (layoutNoise(localSeed, localIndex, 10) - 0.5) * 2 * bound * 0.5;
      headingTrims.set(id, Math.max(-bound, Math.min(bound, groupYaw + own)));
      echelonOf.set(id, p.echelon);
    });
  });
  return slots;
}

// --------------------------------------------------------------- nominal

function assignSlotsNominal(ships: SlotShip[], formation: FormationType): Map<string, Vec3> {
  const slots = new Map<string, Vec3>();
  const byTier: SlotShip[][] = [[], [], [], []];
  for (const s of ships) byTier[tier(s.role)].push(s);
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
