import type { EffectiveWeapon } from '@/timelines/rules';
import type { BattleSimulation } from './battle';
import type { BattleConfig, BattleEvent, BattleResult, FleetState, Missile, Projectile, ShipState, WeaponState } from './types';
import type { Vec3 } from '@/core/vec3';

/**
 * Snapshots of a running battle, for running the simulation off the thread that draws it.
 *
 * The simulation steps in one place (a Web Worker). After each tick `SnapshotEncoder` packs everything that changed
 * into a `SimSnapshot`: the dynamic fields of every ship and weapon as numbers in typed arrays, projectiles,
 * missiles and point-defence flashes the same way, and the few things that are not numbers (ships that have just
 * appeared, weapon definitions seen for the first time, new events, fleet state) as plain data. `SimMirror` on the
 * drawing thread applies each snapshot in place to ship objects it keeps for the whole battle, so code that holds a
 * `ShipState` and reads it every frame goes on working.
 *
 * A snapshot is plain data and typed arrays: it survives `postMessage`, and its arrays can be transferred, not
 * copied. Nothing here steps or alters the simulation.
 */
export interface SimSnapshot {
  tick: number;
  time: number;
  finished: boolean;
  result?: BattleResult;
  /** Ships that did not exist at the previous snapshot, complete, in simulation order. */
  spawned: ShipState[];
  /** Weapon definitions first carried by a projectile or missile in this snapshot, in table order. */
  definitions: EffectiveWeapon[];
  /** `SHIP_STRIDE` numbers for each ship, in simulation order. */
  ships: Float64Array;
  /** `WEAPON_STRIDE` numbers for each weapon of each ship, in the same order. */
  weapons: Float64Array;
  /** `PROJECTILE_STRIDE` numbers for each projectile. */
  projectiles: Float64Array;
  /** `MISSILE_STRIDE` numbers for each missile. */
  missiles: Float64Array;
  /** `FLASH_STRIDE` numbers for each point-defence flash. */
  flashes: Float64Array;
  /** Events emitted since the previous snapshot. */
  events: BattleEvent[];
  /** Every fleet's state, in the simulation's order. */
  fleets: FleetState[];
}

export const SHIP_STRIDE = 54;
export const WEAPON_STRIDE = 18;
export const PROJECTILE_STRIDE = 15;
export const MISSILE_STRIDE = 17;
export const FLASH_STRIDE = 8;

const MODES = [undefined, 'approach', 'hold', 'reposition'] as const;
/** Optional numbers and flags travel as NaN when they are not set. */
const optional = (value: number | boolean | undefined): number => value === undefined ? NaN : Number(value);
const number = (value: number): number | undefined => Number.isNaN(value) ? undefined : value;
const flag = (value: number): boolean | undefined => Number.isNaN(value) ? undefined : value !== 0;

/** Packs the state of a simulation after a tick. One encoder per simulation: it remembers what it has already sent. */
export class SnapshotEncoder {
  private sentShips = 0;
  private sentEvents = 0;
  private readonly shipIndex = new Map<string, number>();
  private readonly definitionIndex = new Map<EffectiveWeapon, number>();

  constructor(private readonly sim: BattleSimulation) {}

  private ref(id: string | undefined): number {
    if (id === undefined) return -1;
    const index = this.shipIndex.get(id);
    if (index === undefined) throw new Error(`snapshot: ${id} is not a ship of this battle`);
    return index;
  }

  encode(): SimSnapshot {
    const sim = this.sim;
    const spawned = sim.ships.slice(this.sentShips);
    for (let i = this.sentShips; i < sim.ships.length; i++) this.shipIndex.set(sim.ships[i].id, i);
    this.sentShips = sim.ships.length;

    let weaponCount = 0;
    for (const ship of sim.ships) weaponCount += ship.weapons.length;
    const ships = new Float64Array(sim.ships.length * SHIP_STRIDE);
    const weapons = new Float64Array(weaponCount * WEAPON_STRIDE);
    let o = 0, w = 0;
    for (const s of sim.ships) {
      ships[o++] = s.pos.x; ships[o++] = s.pos.y; ships[o++] = s.pos.z;
      ships[o++] = s.prevPos.x; ships[o++] = s.prevPos.y; ships[o++] = s.prevPos.z;
      ships[o++] = s.vel.x; ships[o++] = s.vel.y; ships[o++] = s.vel.z;
      ships[o++] = s.heading.x; ships[o++] = s.heading.y; ships[o++] = s.heading.z;
      ships[o++] = s.prevHeading.x; ships[o++] = s.prevHeading.y; ships[o++] = s.prevHeading.z;
      ships[o++] = s.slot.x; ships[o++] = s.slot.y; ships[o++] = s.slot.z;
      ships[o++] = s.firingOffset ? s.firingOffset.x : NaN; ships[o++] = s.firingOffset ? s.firingOffset.y : NaN; ships[o++] = s.firingOffset ? s.firingOffset.z : NaN;
      ships[o++] = optional(s.engineThrust); ships[o++] = optional(s.inertialCoast);
      ships[o++] = s.hull; ships[o++] = s.armour; ships[o++] = s.barriers; ships[o++] = s.heat; ships[o++] = Number(s.overheated);
      ships[o++] = s.subsystems.engines; ships[o++] = s.subsystems.weapons; ships[o++] = s.subsystems.sensors;
      ships[o++] = Number(s.alive); ships[o++] = optional(s.destroyedAt);
      ships[o++] = this.ref(s.targetId); ships[o++] = optional(s.targetLockUntil); ships[o++] = MODES.indexOf(s.engagementMode);
      ships[o++] = this.ref(s.firingTargetId); ships[o++] = this.ref(s.forcedTargetId); ships[o++] = this.ref(s.escortId);
      ships[o++] = Number(s.withdrawing); ships[o++] = Number(s.escaped); ships[o++] = s.lastHitAt; ships[o++] = optional(s.firstShotAt);
      ships[o++] = optional(s.rearming); ships[o++] = optional(s.rearmTimer); ships[o++] = optional(s.stationTimer); ships[o++] = s.aiTimer;
      ships[o++] = s.hangar ? s.hangar.remaining : NaN; ships[o++] = s.hangar ? s.hangar.launchTimer : NaN;
      ships[o++] = s.stats.damageDealt; ships[o++] = s.stats.damageTaken; ships[o++] = s.stats.shotsFired; ships[o++] = s.stats.hits; ships[o++] = s.stats.kills;
      for (const weapon of s.weapons) {
        weapons[w++] = weapon.cooldown; weapons[w++] = weapon.facing;
        weapons[w++] = weapon.beamRemaining; weapons[w++] = this.ref(weapon.beamTargetId); weapons[w++] = Number(weapon.beamHit);
        weapons[w++] = weapon.beamLocalHit ? weapon.beamLocalHit.x : NaN; weapons[w++] = weapon.beamLocalHit ? weapon.beamLocalHit.y : NaN; weapons[w++] = weapon.beamLocalHit ? weapon.beamLocalHit.z : NaN;
        weapons[w++] = optional(weapon.beamGlance);
        weapons[w++] = weapon.beamEnd ? weapon.beamEnd.x : NaN; weapons[w++] = weapon.beamEnd ? weapon.beamEnd.y : NaN; weapons[w++] = weapon.beamEnd ? weapon.beamEnd.z : NaN;
        weapons[w++] = weapon.beamStart ? weapon.beamStart.x : NaN; weapons[w++] = weapon.beamStart ? weapon.beamStart.y : NaN; weapons[w++] = weapon.beamStart ? weapon.beamStart.z : NaN;
        weapons[w++] = optional(weapon.ammo); weapons[w++] = optional(weapon.burstLeft); weapons[w++] = weapon.burstRecover;
      }
    }

    const definitions: EffectiveWeapon[] = [];
    const definition = (weapon: EffectiveWeapon): number => {
      let index = this.definitionIndex.get(weapon);
      if (index === undefined) { index = this.definitionIndex.size; this.definitionIndex.set(weapon, index); definitions.push(weapon); }
      return index;
    };
    const projectiles = new Float64Array(sim.projectiles.length * PROJECTILE_STRIDE);
    o = 0;
    for (const p of sim.projectiles) {
      projectiles[o++] = p.id; projectiles[o++] = this.ref(p.shooterId); projectiles[o++] = p.side === 'A' ? 0 : 1; projectiles[o++] = definition(p.weapon);
      projectiles[o++] = p.pos.x; projectiles[o++] = p.pos.y; projectiles[o++] = p.pos.z;
      projectiles[o++] = p.prevPos.x; projectiles[o++] = p.prevPos.y; projectiles[o++] = p.prevPos.z;
      projectiles[o++] = p.vel.x; projectiles[o++] = p.vel.y; projectiles[o++] = p.vel.z;
      projectiles[o++] = p.ttl; projectiles[o++] = this.ref(p.intendedTargetId);
    }
    const missiles = new Float64Array(sim.missiles.length * MISSILE_STRIDE);
    o = 0;
    for (const m of sim.missiles) {
      missiles[o++] = m.id; missiles[o++] = this.ref(m.shooterId); missiles[o++] = m.side === 'A' ? 0 : 1; missiles[o++] = definition(m.weapon);
      missiles[o++] = m.pos.x; missiles[o++] = m.pos.y; missiles[o++] = m.pos.z;
      missiles[o++] = m.prevPos.x; missiles[o++] = m.prevPos.y; missiles[o++] = m.prevPos.z;
      missiles[o++] = m.vel.x; missiles[o++] = m.vel.y; missiles[o++] = m.vel.z;
      missiles[o++] = this.ref(m.targetId); missiles[o++] = m.hp; missiles[o++] = m.ttl; missiles[o++] = Number(m.alive);
    }
    const flashes = new Float64Array(sim.flashes.length * FLASH_STRIDE);
    o = 0;
    for (const f of sim.flashes) {
      flashes[o++] = f.from.x; flashes[o++] = f.from.y; flashes[o++] = f.from.z;
      flashes[o++] = f.to.x; flashes[o++] = f.to.y; flashes[o++] = f.to.z;
      flashes[o++] = f.kind === 'gardian' ? 0 : 1; flashes[o++] = f.ttl;
    }

    if (w !== weapons.length) throw new Error('snapshot: weapon rows do not match WEAPON_STRIDE');
    const events = sim.events.slice(this.sentEvents);
    this.sentEvents = sim.events.length;
    return { tick: sim.tick, time: sim.time, finished: sim.finished, result: sim.result, spawned, definitions, ships, weapons, projectiles, missiles, flashes, events, fleets: [...sim.fleets.values()] };
  }
}

/**
 * The drawing thread's copy of a battle. It has the simulation's readable shape (`ships`, `getShip`, `fleets`,
 * `projectiles`, `missiles`, `flashes`, `events`, `time`, `finished`, `result`) and is brought up to date by
 * `apply`. Ship, weapon and fleet objects keep their identity from one snapshot to the next.
 */
export class SimMirror {
  time = 0;
  tick = 0;
  finished = false;
  result?: BattleResult;
  ships: ShipState[] = [];
  readonly shipById = new Map<string, ShipState>();
  readonly fleets = new Map<string, FleetState>();
  projectiles: Projectile[] = [];
  missiles: Missile[] = [];
  flashes: { from: Vec3; to: Vec3; kind: 'gardian' | 'reaper_pd'; ttl: number }[] = [];
  readonly events: BattleEvent[] = [];
  /** Called for each event as its snapshot is applied, in order: what the simulation's own `onEvent` does inline. */
  onEvent?: (event: BattleEvent) => void;
  private readonly definitions: EffectiveWeapon[] = [];

  constructor(readonly config: BattleConfig) {}

  get rules(): BattleConfig['rules'] { return this.config.rules; }

  getShip(id: string): ShipState | undefined { return this.shipById.get(id); }

  private id(index: number): string | undefined { return index < 0 ? undefined : this.ships[index].id; }

  apply(snapshot: SimSnapshot): void {
    for (const ship of snapshot.spawned) { this.ships.push(ship); this.shipById.set(ship.id, ship); }
    this.definitions.push(...snapshot.definitions);
    this.tick = snapshot.tick; this.time = snapshot.time; this.finished = snapshot.finished; this.result = snapshot.result;

    const a = snapshot.ships, b = snapshot.weapons;
    let o = 0, w = 0;
    for (const s of this.ships) {
      s.pos.x = a[o++]; s.pos.y = a[o++]; s.pos.z = a[o++];
      s.prevPos.x = a[o++]; s.prevPos.y = a[o++]; s.prevPos.z = a[o++];
      s.vel.x = a[o++]; s.vel.y = a[o++]; s.vel.z = a[o++];
      s.heading.x = a[o++]; s.heading.y = a[o++]; s.heading.z = a[o++];
      s.prevHeading.x = a[o++]; s.prevHeading.y = a[o++]; s.prevHeading.z = a[o++];
      s.slot.x = a[o++]; s.slot.y = a[o++]; s.slot.z = a[o++];
      s.firingOffset = vector(s.firingOffset, a[o++], a[o++], a[o++]);
      s.engineThrust = number(a[o++]); s.inertialCoast = flag(a[o++]);
      s.hull = a[o++]; s.armour = a[o++]; s.barriers = a[o++]; s.heat = a[o++]; s.overheated = a[o++] !== 0;
      s.subsystems.engines = a[o++]; s.subsystems.weapons = a[o++]; s.subsystems.sensors = a[o++];
      s.alive = a[o++] !== 0; s.destroyedAt = number(a[o++]);
      s.targetId = this.id(a[o++]); s.targetLockUntil = number(a[o++]); s.engagementMode = MODES[a[o++]];
      s.firingTargetId = this.id(a[o++]); s.forcedTargetId = this.id(a[o++]); s.escortId = this.id(a[o++]);
      s.withdrawing = a[o++] !== 0; s.escaped = a[o++] !== 0; s.lastHitAt = a[o++]; s.firstShotAt = number(a[o++]);
      s.rearming = flag(a[o++]); s.rearmTimer = number(a[o++]); s.stationTimer = number(a[o++]); s.aiTimer = a[o++];
      const remaining = a[o++], launchTimer = a[o++];
      if (s.hangar) { s.hangar.remaining = remaining; s.hangar.launchTimer = launchTimer; }
      s.stats.damageDealt = a[o++]; s.stats.damageTaken = a[o++]; s.stats.shotsFired = a[o++]; s.stats.hits = a[o++]; s.stats.kills = a[o++];
      for (const weapon of s.weapons) w = this.applyWeapon(weapon, b, w);
    }

    this.projectiles = resize(this.projectiles, snapshot.projectiles.length / PROJECTILE_STRIDE, newProjectile);
    const p = snapshot.projectiles;
    o = 0;
    for (const item of this.projectiles) {
      item.id = p[o++]; item.shooterId = this.id(p[o++])!; item.side = p[o++] === 0 ? 'A' : 'B'; item.weapon = this.definitions[p[o++]];
      item.pos.x = p[o++]; item.pos.y = p[o++]; item.pos.z = p[o++];
      item.prevPos.x = p[o++]; item.prevPos.y = p[o++]; item.prevPos.z = p[o++];
      item.vel.x = p[o++]; item.vel.y = p[o++]; item.vel.z = p[o++];
      item.ttl = p[o++]; item.intendedTargetId = this.id(p[o++])!;
    }
    this.missiles = resize(this.missiles, snapshot.missiles.length / MISSILE_STRIDE, newMissile);
    const m = snapshot.missiles;
    o = 0;
    for (const item of this.missiles) {
      item.id = m[o++]; item.shooterId = this.id(m[o++])!; item.side = m[o++] === 0 ? 'A' : 'B'; item.weapon = this.definitions[m[o++]];
      item.pos.x = m[o++]; item.pos.y = m[o++]; item.pos.z = m[o++];
      item.prevPos.x = m[o++]; item.prevPos.y = m[o++]; item.prevPos.z = m[o++];
      item.vel.x = m[o++]; item.vel.y = m[o++]; item.vel.z = m[o++];
      item.targetId = this.id(m[o++])!; item.hp = m[o++]; item.ttl = m[o++]; item.alive = m[o++] !== 0;
    }
    this.flashes = resize(this.flashes, snapshot.flashes.length / FLASH_STRIDE, newFlash);
    const f = snapshot.flashes;
    o = 0;
    for (const item of this.flashes) {
      item.from.x = f[o++]; item.from.y = f[o++]; item.from.z = f[o++];
      item.to.x = f[o++]; item.to.y = f[o++]; item.to.z = f[o++];
      item.kind = f[o++] === 0 ? 'gardian' : 'reaper_pd'; item.ttl = f[o++];
    }

    for (const incoming of snapshot.fleets) {
      const existing = this.fleets.get(incoming.spec.id);
      // Keep the object the interface already holds; its contents are replaced.
      if (existing) Object.assign(existing, incoming, { spec: existing.spec });
      else this.fleets.set(incoming.spec.id, incoming);
    }
    for (const event of snapshot.events) { this.events.push(event); this.onEvent?.(event); }
  }

  private applyWeapon(weapon: WeaponState, b: Float64Array, w: number): number {
    weapon.cooldown = b[w++]; weapon.facing = b[w++];
    weapon.beamRemaining = b[w++]; weapon.beamTargetId = this.id(b[w++]); weapon.beamHit = b[w++] !== 0;
    weapon.beamLocalHit = vector(weapon.beamLocalHit, b[w++], b[w++], b[w++]);
    weapon.beamGlance = number(b[w++]);
    weapon.beamEnd = vector(weapon.beamEnd, b[w++], b[w++], b[w++]);
    weapon.beamStart = vector(weapon.beamStart, b[w++], b[w++], b[w++]);
    weapon.ammo = number(b[w++]); weapon.burstLeft = number(b[w++]); weapon.burstRecover = b[w++];
    return w;
  }
}

/** Write an optional vector in place: NaN means it is not set; an existing object is reused. */
function vector(current: Vec3 | undefined, x: number, y: number, z: number): Vec3 | undefined {
  if (Number.isNaN(x)) return undefined;
  if (!current) return { x, y, z };
  current.x = x; current.y = y; current.z = z;
  return current;
}

/** Grow or shrink a pooled list to `length`, keeping the objects it already has. */
function resize<T>(list: T[], length: number, create: () => T): T[] {
  if (list.length > length) list.length = length;
  while (list.length < length) list.push(create());
  return list;
}

const zero = (): Vec3 => ({ x: 0, y: 0, z: 0 });
const newProjectile = (): Projectile => ({ id: 0, shooterId: '', side: 'A', weapon: undefined as unknown as EffectiveWeapon, pos: zero(), prevPos: zero(), vel: zero(), ttl: 0, intendedTargetId: '' });
const newMissile = (): Missile => ({ id: 0, shooterId: '', side: 'A', weapon: undefined as unknown as EffectiveWeapon, pos: zero(), prevPos: zero(), vel: zero(), targetId: '', hp: 0, ttl: 0, alive: true });
const newFlash = (): SimMirror['flashes'][number] => ({ from: zero(), to: zero(), kind: 'gardian', ttl: 0 });
