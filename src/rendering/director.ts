import type { Rng } from '@/core/rng';
import { distance } from '@/core/vec3';
import type { ShipState } from '@/simulation/types';

/** Activity-weighted camera subjects, independent of the simulation RNG.
 * Ship motion and outcomes never depend on whether the director is enabled. */
export function cinematicPair(ships: readonly ShipState[], rng: Rng, previousId?: string): { fromId: string; toId?: string } | undefined {
  const alive = ships.filter(s => s.alive && !s.escaped && s.role !== 'fighter');
  if (!alive.length) return undefined;
  const byId = new Map(alive.map(s => [s.id, s]));
  const candidates = alive.map(ship => {
    const target = ship.targetId ? byId.get(ship.targetId) : undefined;
    const enemy = target && target.side !== ship.side ? target : undefined;
    const range = Math.max(0, ...ship.weapons.filter(w => !w.def.antiSmall).map(w => w.def.range));
    const engaged = !!enemy && distance(ship.pos, enemy.pos) <= range * 1.1;
    const firing = ship.weapons.some(w => w.beamRemaining > 0 || w.cooldown > w.def.cooldown * 0.85);
    const capital = ['dreadnought', 'carrier', 'reaper_capital'].includes(ship.role);
    const weight = (capital ? 3 : 1) * (engaged ? 3 : 0.5) * (firing ? 2 : 1) * (ship.id === previousId ? 0.1 : 1);
    return { ship, enemy, weight };
  });
  let pick = rng.next() * candidates.reduce((sum, c) => sum + c.weight, 0);
  const chosen = candidates.find(c => (pick -= c.weight) <= 0) ?? candidates[candidates.length - 1];
  let enemy = chosen.enemy;
  if (!enemy) {
    let nearest = Infinity;
    for (const other of alive) {
      if (other.side === chosen.ship.side) continue;
      const d = distance(chosen.ship.pos, other.pos);
      if (d < nearest) { nearest = d; enemy = other; }
    }
  }
  return { fromId: chosen.ship.id, toId: enemy?.id };
}

/** A bounded neighbourhood for a fleet pass. Membership is chosen only when
 * the shot changes; the camera follows these hulls rather than chasing the
 * changing centroid of an entire battle. */
export function cinematicWing(ships: readonly ShipState[], leaderId: string): string[] {
  const leader = ships.find(s => s.id === leaderId && s.alive && !s.escaped);
  if (!leader) return [];
  const members = ships.filter(s => s.alive && !s.escaped && s.fleetId === leader.fleetId && s.role !== 'fighter')
    .sort((a, b) => distance(a.pos, leader.pos) - distance(b.pos, leader.pos) || a.id.localeCompare(b.id))
    .slice(0, 12);
  return members.length >= 6 ? members.map(s => s.id) : [];
}

/** What a shot is of. */
export type ShotKind =
  /** Two hulls fighting each other. */
  | 'duel'
  /** A hull about to be destroyed, with the hull destroying it. */
  | 'kill'
  /** A Reaper capital with its main beam on a target. */
  | 'beam'
  /** A battlegroup under way. */
  | 'fleet'
  /** One hull going past a camera that stands still. */
  | 'pass'
  /** One hull on its own. */
  | 'solo';

export type ShotMoveKind = 'arc' | 'push' | 'pull' | 'rise' | 'flyby';

export interface ShotPlan {
  kind: ShotKind;
  fromId: string;
  toId?: string;
  move: ShotMoveKind;
  side: 1 | -1;
  /** Seconds the shot is meant to last. */
  hold: number;
  /** Whether the shot should take in the subject's battlegroup. */
  wide: boolean;
}

/** What the director remembers of the shot before, so as not to repeat itself. */
export interface ShotMemory {
  fromId?: string;
  move?: ShotMoveKind;
  kind?: ShotKind;
  /** How many shots have been planned. */
  count: number;
}

/** A hull is worth a 'kill' shot when this little of its hull is left and something is shooting at it. */
export const KILL_WATCH_HULL = 0.3;
/** A hull must cross this many of its own lengths during a shot for a flyby of it to read as one. */
export const FLYBY_LENGTHS = 2.5;

const CAPITALS = ['dreadnought', 'carrier', 'reaper_capital'];
const mainRange = (ship: ShipState): number => {
  let range = 0;
  for (const w of ship.weapons) if (!w.def.antiSmall && w.def.range > range) range = w.def.range;
  return range;
};

/**
 * The director: what to show next, and how the camera should travel while it does.
 *
 * It only looks. It reads the ships as they are, uses its own random numbers, and nothing in the battle depends on
 * it. What it prefers, in order: a hull about to die and the hull killing it; a Reaper's main beam on a target; a
 * capital ship in a fight; any hull in a fight; and, when nothing is in range of anything yet, a battlegroup under
 * way, a hull going past, or a hull on its own. It does not show the same hull twice running, nor make the same camera move twice
 * running, and every third shot of a large battle takes in a battlegroup. A shot lasts real seconds; `rate` is how
 * many battle seconds pass in one of them, so that a hull is only watched going past when it will get past.
 */
export function planShot(ships: readonly ShipState[], rng: Rng, memory: ShotMemory, rate = 1): ShotPlan | undefined {
  const alive = ships.filter(s => s.alive && !s.escaped && s.role !== 'fighter');
  if (!alive.length) return undefined;
  const byId = new Map(alive.map(s => [s.id, s]));
  let anyEngaged = false;
  const candidates = alive.map(ship => {
    const target = ship.targetId ? byId.get(ship.targetId) : undefined;
    const enemy = target && target.side !== ship.side ? target : undefined;
    const engaged = !!enemy && distance(ship.pos, enemy.pos) <= mainRange(ship) * 1.1;
    if (engaged) anyEngaged = true;
    const firing = ship.weapons.some(w => w.beamRemaining > 0 || w.cooldown > w.def.cooldown * 0.85);
    const beam = ship.role === 'reaper_capital' && ship.weapons.some(w => w.beamRemaining > 0 && w.def.kind === 'reaper_beam');
    const killing = engaged && firing && enemy!.hull <= enemy!.maxHull * KILL_WATCH_HULL;
    const capital = CAPITALS.includes(ship.role);
    const weight = (capital ? 3 : 1) * (engaged ? 3 : 0.5) * (firing ? 2 : 1) * (killing ? 3 : 1) * (beam ? 2 : 1) *
      (ship.id === memory.fromId ? 0.1 : 1);
    return { ship, enemy, engaged, firing, beam, killing, weight };
  });
  let pick = rng.next() * candidates.reduce((sum, c) => sum + c.weight, 0);
  const chosen = candidates.find(c => (pick -= c.weight) <= 0) ?? candidates[candidates.length - 1];
  let enemy = chosen.enemy;
  if (!enemy) {
    let nearest = Infinity;
    for (const other of alive) {
      if (other.side === chosen.ship.side) continue;
      const d = distance(chosen.ship.pos, other.pos);
      if (d < nearest) { nearest = d; enemy = other; }
    }
  }
  const ship = chosen.ship;
  const side: 1 | -1 = rng.next() < 0.5 ? 1 : -1;
  const large = alive.length >= 24;
  // How fast the hull crosses the picture: `rate` battle seconds pass in a real one (none while paused).
  const speed = Math.hypot(ship.vel.x, ship.vel.y, ship.vel.z) * rate;

  let kind: ShotKind;
  let hold = 11 + rng.next() * 7;
  let wide = false;
  let toId = enemy?.id;
  // Which moves suit the shot, most wanted first; the one made last time goes to the back of the queue.
  let moves: ShotMoveKind[];
  if (chosen.killing) {
    kind = 'kill'; moves = ['push', 'arc']; hold = 8 + rng.next() * 3;
  } else if (chosen.beam && chosen.engaged) {
    kind = 'beam'; moves = ['arc', 'pull', 'rise']; hold = 8 + rng.next() * 4;
  } else if (!anyEngaged) {
    // The approach: fleets under way and hulls going past. Nothing is fighting, so there is no duel to frame.
    const canPass = speed * hold >= ship.lengthKm * FLYBY_LENGTHS;
    if (large && memory.kind !== 'fleet') { kind = 'fleet'; moves = ['push', 'arc', 'rise']; wide = true; }
    else if (canPass && memory.move !== 'flyby') { kind = 'pass'; moves = ['flyby']; toId = undefined; hold = 9 + rng.next() * 4; }
    else { kind = 'solo'; moves = ['arc', 'rise', 'push', 'pull']; toId = undefined; }
  } else if (large && memory.count % 3 === 0) {
    kind = 'fleet'; moves = ['arc', 'push', 'rise', 'pull']; wide = true;
  } else {
    kind = 'duel';
    moves = side === 1 ? ['arc', 'push', 'rise', 'pull'] : ['push', 'rise', 'arc', 'pull'];
    // Now and then a fast hull in a fight is worth watching go by.
    if (memory.move !== 'flyby' && speed * hold >= ship.lengthKm * FLYBY_LENGTHS * 2 && rng.next() < 0.2) { kind = 'pass'; moves = ['flyby']; toId = undefined; hold = 8 + rng.next() * 3; }
  }
  // Not the move made last time; of the rest, the earlier in the list the likelier (4 : 3 : 2 : 1).
  const open = moves.filter(m => m !== memory.move);
  let move = open[0] ?? moves[0];
  let draw = rng.next() * open.reduce((sum, _m, i) => sum + Math.max(1, 4 - i), 0);
  for (let i = 0; i < open.length; i++) {
    draw -= Math.max(1, 4 - i);
    if (draw <= 0) { move = open[i]; break; }
  }
  return { kind, fromId: ship.id, toId, move, side, hold, wide };
}
