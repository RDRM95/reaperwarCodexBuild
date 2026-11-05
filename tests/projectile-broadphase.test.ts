import { describe, expect, it } from 'vitest';
import { v3, type Vec3 } from '@/core/vec3';
import { segmentSphere } from '@/simulation/battle';
import { ProjectileBroadphase } from '@/simulation/projectileBroadphase';
import type { ShipState, Side } from '@/simulation/types';

function ship(index: number, x: number, y: number, z: number, radius = 0.4): ShipState {
  return {
    id: `test-${index}`, side: index % 2 ? 'A' : 'B', alive: true, escaped: false,
    pos: v3(x, y, z), radiusKm: radius, role: index % 7 === 0 ? 'fighter' : 'frigate',
  } as ShipState;
}

function firstHit(ships: ShipState[], from: Vec3, to: Vec3, side: Side, antiSmall: boolean, grid?: ProjectileBroadphase): string | undefined {
  let best = Infinity;
  let bestIndex = Infinity;
  let hit: ShipState | undefined;
  const check = (s: ShipState, index: number) => {
    if (!s.alive || s.escaped || s.side === side) return;
    if (s.role === 'fighter' && !antiSmall) return;
    const r = s.radiusKm * (s.role === 'fighter' ? 2.5 : 1);
    const t = segmentSphere(from, to, s.pos, r);
    if (t !== undefined && (t < best || (t === best && index < bestIndex))) {
      best = t;
      bestIndex = index;
      hit = s;
    }
  };
  if (grid) grid.forSegment(side, from, to, check);
  else ships.forEach(check);
  return hit?.id;
}

describe('large-fleet projectile broadphase', () => {
  it('matches brute-force hits across negative coordinates, heights, and fighter hitboxes', () => {
    const ships: ShipState[] = [];
    let seed = 7483;
    const random = () => {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      return seed / 4294967296;
    };
    for (let i = 0; i < 1100; i++) {
      ships.push(ship(i, (random() - 0.5) * 220, (random() - 0.5) * 60, (random() - 0.5) * 220, 0.2 + random() * 1.1));
    }
    ships[12].alive = false;
    ships[30].escaped = true;
    const grid = new ProjectileBroadphase(ships);
    for (let i = 0; i < 220; i++) {
      const from = v3((random() - 0.5) * 240, (random() - 0.5) * 70, (random() - 0.5) * 240);
      const to = v3(from.x + (random() - 0.5) * 40, from.y + (random() - 0.5) * 15, from.z + (random() - 0.5) * 40);
      const side: Side = i % 2 ? 'A' : 'B';
      const antiSmall = i % 3 === 0;
      expect(firstHit(ships, from, to, side, antiSmall, grid)).toBe(firstHit(ships, from, to, side, antiSmall));
    }
  });

  it('conservatively handles exceptionally long projectile travel', () => {
    const ships = [ship(0, 0, 0, 0, 3), ship(1, 22, 0, 0, 1), ship(2, -30, 0, 0, 1)];
    const grid = new ProjectileBroadphase(ships);
    const from = v3(-10000, 0, 0), to = v3(10000, 0, 0);
    expect(firstHit(ships, from, to, 'A', false, grid)).toBe(firstHit(ships, from, to, 'A', false));
  });

  it('avoids quadratic narrow-phase checks for a dispersed thousand-ship fleet', () => {
    const ships: ShipState[] = [];
    for (let i = 0; i < 1200; i++) ships.push(ship(i, i % 40 * 8 - 160, 0, Math.floor(i / 40) * 8 - 120, 0.3));
    const grid = new ProjectileBroadphase(ships);
    grid.forSegment('A', v3(-4, 0, 0), v3(4, 0, 0), () => undefined);
    expect(grid.candidateChecks).toBeLessThan(60);
  });
});
