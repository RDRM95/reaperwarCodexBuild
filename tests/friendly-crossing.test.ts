import { describe, expect, it } from 'vitest';
import { BattleSimulation } from '@/simulation/battle';
import { getPreset } from '@/timelines/presets';
import { shipEngagementRange } from '@/simulation/ai';
import type { BattleConfig, FleetSpec } from '@/simulation/types';

/**
 * Friendly fleets are not walls. Owner's directive: "Battle groups must be able to move between, across and through
 * other friendly formations ... Avoid traffic jams, deadlocks, formation bottlenecks." A fleet of 36 hulls attacks
 * an enemy that lies directly behind an allied fleet of 46 hulls holding its position. Weapons do no damage, so
 * this is a control experiment on movement; the same battle is run without the allied fleet for comparison.
 */
function cross(blocker: boolean, seed: number) {
  const fleets: FleetSpec[] = [
    { id: 'mover', name: 'Mover', faction: 'alliance', side: 'A', ships: [{ classId: 'alliance_dreadnought', count: 4 }, { classId: 'alliance_cruiser', count: 12 }, { classId: 'alliance_frigate', count: 20 }], formation: 'line_abreast', position: { x: 0, y: 0, z: -70 }, heading: { x: 0, y: 0, z: 1 } },
    { id: 'enemy', name: 'Reapers', faction: 'reaper', side: 'B', ships: [{ classId: 'reaper_capital', count: 3 }, { classId: 'reaper_destroyer', count: 8 }], formation: 'line_abreast', position: { x: 0, y: 0, z: 70 }, heading: { x: 0, y: 0, z: -1 }, initialOrder: { order: 'hold_formation' } },
  ];
  if (blocker) fleets.push({ id: 'blocker', name: 'Blocker', faction: 'turian', side: 'A', ships: [{ classId: 'turian_dreadnought', count: 6 }, { classId: 'turian_cruiser', count: 16 }, { classId: 'turian_frigate', count: 24 }], formation: 'line_abreast', position: { x: 0, y: 0, z: -15 }, heading: { x: 0, y: 0, z: 1 }, initialOrder: { order: 'hold_formation' } });
  const config: BattleConfig = { id: 'cross', name: 'Crossing', scenarioId: 'custom', seed, rules: getPreset('canon_me3'), fleets, environment: 'deep_space', maxDuration: 400, perspectiveSide: 'A', objective: 'cross' };
  const sim = new BattleSimulation(config);
  for (const s of sim.ships) for (const w of s.weapons) w.def = { ...w.def, damage: 0 };
  const movers = sim.ships.filter(s => s.fleetId === 'mover'), blockers = sim.ships.filter(s => s.fleetId === 'blocker');
  const line = blockers.length ? Math.max(...blockers.map(s => s.pos.z)) : 0;
  const start = new Map(blockers.map(s => [s.id, { ...s.pos }]));
  const hulls = sim.ships.filter(s => s.role !== 'fighter' && s.side === 'A');
  const inRange = () => movers.filter(s => { const t = s.targetId ? sim.getShip(s.targetId) : undefined; return !!t && Math.hypot(t.pos.x - s.pos.x, t.pos.y - s.pos.y, t.pos.z - s.pos.z) <= shipEngagementRange(s); }).length;
  let contacts = 0, ninetyAt = -1;
  while (!sim.finished && sim.time < 150) {
    sim.step();
    for (let i = 0; i < hulls.length; i++) for (let j = 0; j < i; j++) {
      const a = hulls[i], b = hulls[j], reach = a.radiusKm + b.radiusKm, dx = a.pos.x - b.pos.x;
      if (dx > reach || dx < -reach) continue;
      if (Math.hypot(dx, a.pos.y - b.pos.y, a.pos.z - b.pos.z) < reach) contacts++;
    }
    if (ninetyAt < 0 && sim.tick % 20 === 0 && inRange() >= movers.length * 0.9) ninetyAt = sim.time;
  }
  const pushed = blockers.map(s => { const p = start.get(s.id)!; return Math.hypot(s.pos.x - p.x, s.pos.y - p.y, s.pos.z - p.z); });
  return { ninetyAt, contacts, passed: movers.filter(s => s.pos.z > line).length, movers: movers.length,
    pushedMean: pushed.length ? pushed.reduce((a, b) => a + b, 0) / pushed.length : 0, pushedMax: Math.max(0, ...pushed) };
}

describe('a fleet attacking through an allied fleet', () => {
  it.each([1, 2])('gets through without delay, deadlock or contact, and leaves the allied fleet where it was (seed %i)', (seed) => {
    const open = cross(false, seed), blocked = cross(true, seed);
    // Measured, seeds 1 and 2: nine tenths of the fleet is in range of its targets at 80 and 76 s with nothing in
    // the way, and at 79 and 76 s through the allied fleet.
    expect(open.ninetyAt).toBeGreaterThan(0);
    expect(blocked.ninetyAt).toBeGreaterThan(0);
    expect(blocked.ninetyAt - open.ninetyAt).toBeLessThan(6);
    // Every hull comes out the far side of the allied line.
    expect(blocked.passed).toBe(blocked.movers);
    // No two hulls touch at any tick, and the fleet that holds is barely moved: 0.01 km on average, at most 0.16.
    expect(blocked.contacts).toBe(0);
    expect(blocked.pushedMean).toBeLessThan(0.05);
    expect(blocked.pushedMax).toBeLessThan(0.5);
  });
});
