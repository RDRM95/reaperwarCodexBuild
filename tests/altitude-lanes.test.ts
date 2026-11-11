import { describe, expect, it } from 'vitest';
import { buildCustomBattle, buildScenario } from '@/scenarios';
import { BattleSimulation } from '@/simulation/battle';
import { ALTITUDE_LANES, ALTITUDE_LANE_STEP, altitudeLane } from '@/simulation/ai';
import { sampleGeometry } from '@/simulation/engagementGeometry';

/**
 * Allied fleets used to close on one level: in the Final Battle of Earth the five Alliance fleets' anchors stayed
 * within 1.1 km of each other in altitude (mean of six seeds, measured before this change). Each fleet of a side
 * after the first now takes its own altitude lane on the way in.
 */
const run = (sim: BattleSimulation, seconds: number) => { while (!sim.finished && sim.time < seconds) sim.step(); return sim; };

describe('altitude lanes', () => {
  it('the first fleet of a side keeps its level; later fleets alternate above and below; the sides mirror', () => {
    const sim = new BattleSimulation(buildScenario('final_battle_of_earth', 'prime_apex', 1));
    const lanes = (side: string) => [...sim.fleets.values()].filter(f => f.spec.side === side).map(f => altitudeLane(sim, f).lane);
    const alliance = lanes('A'), reapers = lanes('B');
    expect(alliance.length).toBeGreaterThanOrEqual(4);
    expect(alliance).toEqual(ALTITUDE_LANES.slice(0, alliance.length));
    expect(reapers).toEqual(ALTITUDE_LANES.slice(0, reapers.length).map(lane => lane === 0 ? 0 : -lane));
    // A lane is held for the battle.
    run(sim, 20);
    expect(lanes('A')).toEqual(alliance);
  });

  it('a side with one fleet goes on as before: no lane, no climb', () => {
    const sim = new BattleSimulation(buildCustomBattle({
      seed: 42, rulesId: 'prime_apex', environment: 'deep_space', startingDistanceKm: 60, maxDuration: 100,
      sideA: { faction: 'alliance', name: 'Alliance line', formation: 'line_abreast', counts: { alliance_dreadnought: 6, alliance_cruiser: 18, alliance_frigate: 30 } },
      sideB: { faction: 'reaper', name: 'Reaper pressure', formation: 'strike_wedge', counts: { reaper_capital: 8, reaper_destroyer: 30 } },
    }));
    const start = [...sim.fleets.values()].map(f => f.anchor.y);
    run(sim, 60);
    for (const [i, fleet] of [...sim.fleets.values()].entries()) {
      expect(altitudeLane(sim, fleet).lane).toBe(0);
      // An anchor follows its focus target's level a little, as it always did (under 2 km here).
      expect(Math.abs(fleet.anchor.y - start[i])).toBeLessThan(2);
    }
  });

  it('in the Final Battle of Earth the Alliance fleets stack on separate levels and nothing collides', () => {
    const sim = new BattleSimulation(buildScenario('final_battle_of_earth', 'prime_apex', 1));
    let overlaps = 0, next = 30;
    while (!sim.finished && sim.time < 100) {
      sim.step();
      if (sim.time >= next) { next += 10; for (const row of sampleGeometry(sim)) overlaps += row.overlaps; }
    }
    const alliance = [...sim.fleets.values()].filter(f => f.spec.side === 'A');
    const altitudes = alliance.map(f => f.anchor.y);
    // Measured: -0.1, +7.9, -6.2, +4.0 and -4.0 km. Before the change all five were within 1.1 km.
    expect(Math.max(...altitudes) - Math.min(...altitudes)).toBeGreaterThan(10);
    for (const fleet of alliance) {
      const { lane, base } = altitudeLane(sim, fleet);
      if (lane === 0) continue;
      expect(Math.sign(fleet.anchor.y - base)).toBe(Math.sign(lane));
      // No fleet overshoots its lane.
      expect(Math.abs(fleet.anchor.y - base)).toBeLessThanOrEqual(Math.abs(lane) * (fleet.engagementRange ?? 0) * ALTITUDE_LANE_STEP + 1e-6);
    }
    const sorted = [...altitudes].sort((a, b) => a - b);
    for (let i = 1; i < sorted.length; i++) expect(sorted[i] - sorted[i - 1]).toBeGreaterThan(1.5);
    expect(overlaps).toBe(0);
  });

  it('is reproducible: the same seed gives the same anchors', () => {
    const anchors = () => [...run(new BattleSimulation(buildScenario('battle_of_the_citadel', 'prime_apex', 3)), 80).fleets.values()].map(f => [f.anchor.x, f.anchor.y, f.anchor.z]);
    expect(anchors()).toEqual(anchors());
  });
});
