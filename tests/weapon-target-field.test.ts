import { describe, expect, it } from 'vitest';
import { distance, v3 } from '@/core/vec3';
import { WeaponTargetField } from '@/simulation/weaponTargetField';
import type { ShipState, Side } from '@/simulation/types';

function ship(i: number): ShipState {
  return {
    id: `target-${i}`, side: i % 2 ? 'A' : 'B', alive: true, escaped: false,
    pos: v3((i % 55) * 5 - 130, (i % 9) * 0.8, Math.floor(i / 55) * 5 - 25),
    maxSpeed: 1.8, radiusKm: 0.2, role: i % 13 === 0 ? 'fighter' : 'frigate',
  } as ShipState;
}

describe('weapon targeting index', () => {
  it('contains every enemy that is actually in range after ships move within the tick', () => {
    const ships = Array.from({ length: 1100 }, (_, i) => ship(i));
    const field = new WeaponTargetField(ships, 0.05);
    for (const s of ships) {
      s.pos = v3(s.pos.x + (s.id.length % 3 - 1) * 0.07, s.pos.y, s.pos.z - 0.06);
    }
    for (let n = 0; n < 30; n++) {
      const origin = v3(n * 7 - 110, 1.5, n % 4 * 6 - 15);
      const range = 3 + n % 8;
      const side: Side = n % 2 ? 'A' : 'B';
      const actual = ships.filter(s => s.side !== side && distance(origin, s.pos) <= range).map(s => s.id).sort();
      const candidates: string[] = [];
      field.forRange(side, origin, range, (s) => {
        if (distance(origin, s.pos) <= range) candidates.push(s.id);
      });
      expect(candidates.sort()).toEqual(actual);
    }
  });

  it('does not miss fighters deployed after the index snapshot', () => {
    const ships = [ship(0), ship(1)];
    const field = new WeaponTargetField(ships, 0.05);
    const fighter = ship(2);
    fighter.pos = v3(3, 0, 4);
    ships.push(fighter);
    const ids: string[] = [];
    field.forRange('A', v3(3, 0, 4), 2, s => ids.push(s.id));
    expect(ids).toContain(fighter.id);
  });

  it('allows for a hull closing at the sprint when its side has nothing faster', () => {
    // One enemy hull, no fighters on its side: 0.09 km outside a 10 km weapon at the snapshot. Sprinting at twice
    // its combat speed of 1 km/s it covers 0.1 km in the tick and ends inside the weapon's range.
    const make = (): { ships: ShipState[]; enemy: ShipState } => {
      const shooter = { ...ship(1), pos: v3(0, 0, 0) } as ShipState, enemy = { ...ship(0), pos: v3(10.09, 0, 0), maxSpeed: 1 } as ShipState;
      return { ships: [shooter, enemy], enemy };
    };
    const visited = (sprint: number): boolean => {
      const { ships, enemy } = make();
      const field = new WeaponTargetField(ships, 0.05, sprint);
      enemy.pos = v3(9.99, 0, 0);
      let seen = false;
      field.forRange('A', v3(0, 0, 0), 10, (s) => { if (s === enemy && distance(v3(0, 0, 0), s.pos) <= 10) seen = true; });
      return seen;
    };
    expect(visited(2)).toBe(true);
    // The bound without the sprint, as it was: the hull is in range and is not visited.
    expect(visited(1)).toBe(false);
  });

  it('limits the candidate scan for tight-range defensive mounts', () => {
    const ships = Array.from({ length: 1100 }, (_, i) => ship(i));
    const field = new WeaponTargetField(ships, 0.05);
    field.forRange('A', v3(0, 0, 0), 3, () => undefined);
    expect(field.candidateChecks).toBeLessThan(60);
  });
});
