import { describe, expect, it } from 'vitest';
import { buildCustomBattle, buildScenario } from '@/scenarios';
import { BattleSimulation } from '@/simulation/battle';
import { assessReapers } from '@/simulation/reaperIntel';

/**
 * The Reaper assessment on the results screen must agree with the result.
 *
 * Owner's report, 13 Nov 2026: after an Annihilation battle in which all 8,652 allied warships were destroyed and
 * 15 of 1,500 Sovereigns lost, the report concluded "Organic fleets capable of defeating harvest forces in open
 * engagement." The threat score added 0.6 for every capital lost, whatever the number committed, so fifteen of
 * fifteen hundred scored 9 where 3.2 is CRITICAL; and the conclusion was drawn from that score alone, not from
 * how the engagement ended.
 */
describe('Reaper assessment', () => {
  /** A harvest fleet of 1,500 Sovereigns that has just destroyed everything sent against it, at the cost of `lost`. */
  const annihilation = (lost: number) => {
    const sim = new BattleSimulation(buildCustomBattle({ seed: 45, rulesId: 'reaper_hardcore', environment: 'deep_space', startingDistanceKm: 120, maxDuration: 600,
      sideA: { faction: 'alliance', name: 'Allied fleet', formation: 'line_abreast', counts: { alliance_dreadnought: 4, alliance_cruiser: 8 } },
      sideB: { faction: 'reaper', name: 'Harvest fleet', formation: 'strike_wedge', counts: { reaper_capital: 1500 } } }));
    const capitals = sim.ships.filter(s => s.role === 'reaper_capital');
    for (const ship of capitals.slice(0, lost)) { ship.alive = false; ship.hull = 0; ship.destroyedAt = 0; }
    for (const ship of sim.ships) if (ship.side === 'A') { ship.alive = false; ship.hull = 0; ship.destroyedAt = 0; ship.stats.shotsFired = 120; ship.stats.damageDealt = 9000; }
    sim.step();
    return sim;
  };

  it('fifteen Sovereigns lost of fifteen hundred, and every allied ship destroyed, is not a critical threat', () => {
    const sim = annihilation(15);
    expect(sim.finished).toBe(true);
    expect(sim.result!.winner).toBe('B');
    const report = assessReapers(sim);
    expect(report.reaperCapitalLosses).toBe(15);
    expect(report.organicFleetStrength).toBe(0);
    // Was CRITICAL, "Organic fleets capable of defeating harvest forces in open engagement", "Harvest of this
    // system: cannot be completed with committed forces", under "CAPITAL UNIT LOSSES EXCEED HISTORICAL
    // PROJECTIONS".
    expect(['NEGLIGIBLE', 'LOW']).toContain(report.threatLevel);
    expect(report.projectedResistance).toBe('Organic fleet destroyed. No resistance remains in this engagement.');
    expect(report.harvestCompletionEstimate).toBe('Harvest of this system: proceeding.');
    expect(report.headline).toBe('CAPITAL UNIT LOSSES RECORDED. ATTRITION WITHIN COMMITTED RESERVES.');
    expect(report.lines).toContain('Capital units destroyed: 15.');
    expect(report.lines).toContain('Engagement concluded. Resistance eliminated.');
  });

  it('a victory that cost the harvest fleet a third of its capitals says so, and is still a victory', () => {
    const report = assessReapers(annihilation(500));
    expect(['SEVERE', 'CRITICAL']).toContain(report.threatLevel);
    expect(report.headline).toBe('CAPITAL UNIT LOSSES EXCEED HISTORICAL PROJECTIONS.');
    expect(report.projectedResistance).toBe('Organic fleet destroyed at a cost above projections. No resistance remains in this engagement.');
    expect(report.harvestCompletionEstimate).toBe('Harvest of this system: proceeding. Replacement of lost units advisable.');
  });

  it('where the organic fleets win, the report says they did; while the battle is being fought it still projects', () => {
    const sim = new BattleSimulation(buildScenario('battle_of_earth', 'prime_apex', 1));
    while (!sim.finished && sim.time < 40) sim.step();
    // Mid-battle: a projection from the threat score, as before.
    expect(sim.finished).toBe(false);
    const during = assessReapers(sim);
    expect(during.lines.some(line => line.startsWith('Engagement'))).toBe(false);
    expect(during.projectedResistance).toMatch(/^Organic fleets (will be eliminated|inflict measurable attrition|threaten capital units|capable of defeating)/);
    sim.run();
    expect(sim.result!.winner).toBe('A');
    const after = assessReapers(sim);
    expect(after.projectedResistance).toBe('Organic fleets defeated the committed harvest force in open engagement.');
    expect(after.harvestCompletionEstimate).toBe('Harvest of this system: cannot be completed with committed forces.');
    expect(after.lines).toContain('Engagement lost. This outcome has no precedent in archived cycles.');
  });

  it('in a small engagement a capital lost counts as it always did', () => {
    // One of four capitals lost is a quarter of them: the score keeps the 0.6 the count alone gave.
    const sim = new BattleSimulation(buildScenario('battle_of_earth', 'canon_me3', 1));
    const capitals = sim.ships.filter(s => s.role === 'reaper_capital');
    expect(capitals.length).toBeLessThanOrEqual(6);
    const before = assessReapers(sim);
    capitals[0].alive = false;
    const after = assessReapers(sim);
    expect(before.threatLevel).toBe('NEGLIGIBLE');
    expect(after.reaperCapitalLosses).toBe(1);
    expect(['MODERATE', 'ELEVATED']).toContain(after.threatLevel);
    expect(after.headline).toBe('CAPITAL UNIT LOSS RECORDED. ANOMALY UNDER EVALUATION.');
  });
});
