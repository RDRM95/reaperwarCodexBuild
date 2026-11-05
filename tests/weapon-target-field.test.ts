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

  it('limits the candidate scan for tight-range defensive mounts', () => {
    const ships = Array.from({ length: 1100 }, (_, i) => ship(i));
    const field = new WeaponTargetField(ships, 0.05);
    field.forRange('A', v3(0, 0, 0), 3, () => undefined);
    expect(field.candidateChecks).toBeLessThan(60);
  });
});
