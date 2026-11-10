import { describe, expect, it } from 'vitest';
import { WEAPONS } from '@/data/weapons';
import { SHIP_CLASSES } from '@/data/ships';
import { getPreset } from '@/timelines/presets';
import { applyRulesToWeapon, techFor } from '@/timelines/rules';
import { hardcoreReaperBeamDamage } from '@/simulation/reaperHardcore';
import { BattleSimulation, SIM_DT } from '@/simulation/battle';
import { buildCustomBattle } from '@/scenarios';
import { v3 } from '@/core/vec3';

const pulse = (rulesId: string) => applyRulesToWeapon(WEAPONS.oculus_beam, 'reaper',
  SHIP_CLASSES.reaper_oculus, getPreset(rulesId), WEAPONS);

/** Controlled landed burst through the real tick/damage pipeline. Both hulls
 * are held on a fixed boresight; all unrelated weapons and launches are held.
 * Natural hit selection is exercised separately by the dogfight probe.
 */
function landedBurst(rulesId: string, targetClass: string) {
  const sim = new BattleSimulation(buildCustomBattle({ seed: 42, rulesId, environment: 'deep_space',
    startingDistanceKm: 60, maxDuration: 90,
    sideA: { faction: 'alliance', name: 'Target', formation: 'line_abreast', counts: { [targetClass]: 1, alliance_carrier: 1 } },
    sideB: { faction: 'reaper', name: 'Interceptor', formation: 'line_abreast', counts: { reaper_capital: 1, reaper_oculus: 1 } },
  }));
  for (const [i, ship] of sim.ships.entries()) {
    ship.pos = v3(1000 + i * 100, 0, 0); ship.prevPos = { ...ship.pos };
    ship.vel = v3(); ship.acceleration = 0; ship.turnRate = 0; ship.aiTimer = 1000;
    if (ship.hangar) ship.hangar.remaining = 0;
    for (const weapon of ship.weapons) weapon.cooldown = 1000;
  }
  const target = sim.ships.find(s => s.classId === targetClass)!;
  const oculus = sim.ships.find(s => s.classId === 'reaper_oculus')!;
  target.pos = v3(); target.prevPos = v3();
  oculus.pos = v3(0, 0, -.6); oculus.prevPos = { ...oculus.pos };
  oculus.heading = v3(0, 0, 1); oculus.targetId = target.id;
  const weapon = oculus.weapons[0];
  weapon.beamRemaining = weapon.def.beamDuration!;
  weapon.beamTargetId = target.id; weapon.beamHit = true; weapon.beamGlance = 1;
  const hull = target.hull, barriers = target.barriers;
  for (let tick = 0; tick < Math.round(weapon.def.beamDuration! / SIM_DT); tick++) sim.step();
  return { alive: target.alive, hullLoss: hull - target.hull, barrierLoss: barriers - target.barriers,
    damage: weapon.def.damage, destructionEvents: sim.events.filter(e => e.type === 'ship_destroyed' && e.shipId === target.id).length };
}

describe('Oculus interceptor damage stays separate from capital-beam amplification', () => {
  it('does not give an Oculus Annihilation’s ship-beam damage multiplier', () => {
    expect(pulse('reaper_hardcore').damage).toBe(WEAPONS.oculus_beam.damage);
    expect(pulse('canon_me3').damage).toBe(WEAPONS.oculus_beam.damage);
    expect(pulse('prime_apex').damage).toBe(WEAPONS.oculus_beam.damage);
  });

  it('preserves explicit fighter upgrades, ship-beam upgrades and organic Thanix technology', () => {
    const rules = getPreset('reaper_hardcore');
    rules.reaper.fighterStrength = 2; rules.reaper.beamDamage = 3;
    expect(applyRulesToWeapon(WEAPONS.oculus_beam, 'reaper', SHIP_CLASSES.reaper_oculus, rules, WEAPONS).damage)
      .toBe(WEAPONS.oculus_beam.damage * 2);
    expect(applyRulesToWeapon(WEAPONS.reaper_capital_beam, 'reaper', SHIP_CLASSES.reaper_capital, rules, WEAPONS).damage)
      .toBe(WEAPONS.reaper_capital_beam.damage * 3);
    const apex = getPreset('prime_apex');
    expect(applyRulesToWeapon(WEAPONS.alliance_thanix, 'alliance', SHIP_CLASSES.alliance_frigate_thanix, apex, WEAPONS).damage)
      .toBe(WEAPONS.alliance_thanix.damage * techFor(apex, 'alliance').beamDamage);
  });

  it.each(['alliance_fighter', 'alliance_frigate', 'alliance_cruiser', 'alliance_dreadnought'])
  ('does not amplify a landed Oculus burst against %s in Annihilation', targetClass => {
    const normal = landedBurst('canon_me3', targetClass), hardcore = landedBurst('reaper_hardcore', targetClass);
    expect(hardcore.hullLoss).toBeCloseTo(normal.hullLoss, 9);
    expect(hardcore.barrierLoss).toBeCloseTo(normal.barrierLoss, 9);
    expect(hardcore.alive).toBe(true); expect(hardcore.destructionEvents).toBe(0);
    expect(hardcore.hullLoss + hardcore.barrierLoss).toBeGreaterThan(0);
  });

  it('never applies the capital one-shot override to an Oculus weapon or fighter hull', () => {
    const rules = getPreset('reaper_hardcore');
    const target = { classId: 'alliance_dreadnought', faction: 'alliance' as const, maxHull: 1000, maxBarriers: 1000, armour: 40 };
    expect(hardcoreReaperBeamDamage(rules, { faction: 'reaper', role: 'fighter' }, target, WEAPONS.oculus_beam, 1)).toBe(1);
    expect(hardcoreReaperBeamDamage(rules, { faction: 'reaper', role: 'reaper_capital' }, target, WEAPONS.oculus_beam, 1)).toBe(1);
    expect(hardcoreReaperBeamDamage(rules, { faction: 'reaper', role: 'fighter' }, target, WEAPONS.reaper_capital_beam, 1)).toBe(1);
    expect(hardcoreReaperBeamDamage(rules, { faction: 'reaper', role: 'reaper_capital' }, target, WEAPONS.reaper_capital_beam, 1))
      .toBeGreaterThan(target.maxHull + target.maxBarriers);
  });
});
