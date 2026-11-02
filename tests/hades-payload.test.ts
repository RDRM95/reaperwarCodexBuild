import { describe, expect, it } from 'vitest';
import { Rng } from '@/core/rng';
import { normalize, sub } from '@/core/vec3';
import { buildCustomBattle } from '@/scenarios';
import { BattleSimulation } from '@/simulation/battle';
import { applyProjectileDamage } from '@/simulation/damage';

function battery(rulesId = 'prime_apex') {
  const sim = new BattleSimulation(buildCustomBattle({ seed: 71, rulesId, environment: 'deep_space', startingDistanceKm: 24, maxDuration: 60,
    sideA: { faction: 'alliance', name: 'HADES battery', formation: 'line_abreast', counts: { alliance_dreadnought: 3 } },
    sideB: { faction: 'reaper', name: 'Armour target', formation: 'line_abreast', counts: { reaper_capital: 1 } } }));
  const target = sim.ships.find(s => s.side === 'B')!, guns = sim.ships.filter(s => s.side === 'A');
  const weapon = guns[0].weapons.find(w => w.def.antiCapital && w.def.kind === 'mass_accelerator')!.def;
  target.hull = target.maxHull = 1_000_000; target.barriers = 10000; target.armour = 0;
  return { sim, target, guns, weapon };
}

describe('HADES penetrators with internal nuclear warheads', () => {
  it('reserves one existing shot budget for kinetic entry and an internal barrier-bypassing burst', () => {
    const { target, weapon } = battery();
    const out = applyProjectileDamage(target, 1000, weapon, new Rng(1), 0);
    expect(out.internalDetonated).toBe(true);
    expect(out.barrierDamage).toBeCloseTo(390);
    expect(out.internalWarheadDamage).toBeCloseTo(350);
    expect(out.hullDamage).toBeCloseTo(610);
    expect(out.hullDamage + out.barrierDamage).toBeCloseTo(1000);
    expect(target.barriers).toBeCloseTo(9610);
  });

  it('a penetrator stopped outside the hull cannot detonate inside it', () => {
    const { target, weapon } = battery();
    const out = applyProjectileDamage(target, 1000, { ...weapon, barrierEfficiencyMultiplier: 1 }, new Rng(1), 0);
    expect(out.hullDamage).toBe(0);
    expect(out.internalDetonated).toBeFalsy();
    expect(out.internalWarheadDamage).toBeUndefined();
  });

  it('canon ammunition has no nuclear payload or hidden damage bonus', () => {
    const { target, weapon } = battery('canon_me3');
    const out = applyProjectileDamage(target, 1000, weapon, new Rng(1), 0);
    expect(weapon.internalWarheadFraction).toBe(0);
    expect(out.barrierDamage).toBe(1000);
    expect(out.hullDamage).toBe(0);
    expect(out.internalDetonated).toBeFalsy();
  });

  it('the real battery produces exactly one detonation per penetrating impact and remains deterministic', () => {
    const run = () => {
      const { sim, target, guns } = battery();
      target.barriers = 0;
      for (const fleet of sim.fleets.values()) sim.issueOrders(fleet.spec.id, { order: 'hold_formation' });
      sim.issueOrders('custom-a', { primaryFire: 'hold' });
      sim.orderShipsAttack(guns.map(s => s.id), target.id);
      for (const ship of sim.ships) for (const w of ship.weapons) {
        w.cooldown = 0;
        if (!(ship.side === 'A' && w.def.antiCapital && w.def.kind === 'mass_accelerator')) w.def = { ...w.def, damage: 0 };
      }
      for (const ship of guns) ship.heading = normalize(sub(target.pos, ship.pos));
      for (let i = 0; i < 400; i++) { if (i % 120 === 0) sim.releasePrimaryVolley('custom-a'); sim.step(); }
      return sim.events;
    };
    const a = run(), b = run();
    expect(a).toEqual(b);
    const detonations = a.filter(e => e.type === 'hades_detonation');
    const penetrating = a.filter(e => e.type === 'projectile_impact' && e.damageType === 'kinetic' && e.hullDamage > 0);
    expect(detonations.length).toBeGreaterThanOrEqual(3);
    expect(detonations).toHaveLength(penetrating.length);
    expect(new Set(detonations.map(e => e.type === 'hades_detonation' ? e.shipId : '')) .size).toBeGreaterThanOrEqual(2);
    for (const e of detonations) if (e.type === 'hades_detonation') expect(e.internalDamage).toBeGreaterThan(0);
  });
});
