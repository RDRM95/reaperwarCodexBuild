import { describe, expect, it } from 'vitest';
import { createCampaign, advanceTick } from '@/campaign/engine';
import { CROSSOVER_FACTIONS, CROSSOVER_SHIPS, CROSSOVER_WEAPONS } from '@/data/crossover';
import { FACTIONS } from '@/data/factions';
import { SHIP_CLASSES, getShipClass } from '@/data/ships';
import { CROSSOVER_FACTION_IDS, MASS_EFFECT_FACTION_IDS, isCrossoverFaction, isMassEffectFaction } from '@/data/types';
import { WEAPONS } from '@/data/weapons';
import { buildCustomBattle } from '@/scenarios';
import { BattleSimulation } from '@/simulation/battle';
import { CANON_ME3, PRIME_APEX } from '@/timelines/presets';
import { applyRulesToShip, applyRulesToWeapon, cloneRules } from '@/timelines/rules';

describe('explicitly estimated crossover catalogue', () => {
  it('registers complete, finite, separately labelled rosters without changing original catalogue entries', () => {
    expect(Object.keys(CROSSOVER_FACTIONS)).toEqual([...CROSSOVER_FACTION_IDS]);
    expect(Object.keys(CROSSOVER_SHIPS)).toHaveLength(10);
    for (const faction of CROSSOVER_FACTION_IDS) {
      expect(FACTIONS[faction]).toBe(CROSSOVER_FACTIONS[faction]);
      expect(FACTIONS[faction].sandboxOnly).toBe(true);
      expect(['halo', 'warhammer40k', 'terminator']).toContain(FACTIONS[faction].universe);
      expect(isCrossoverFaction(faction)).toBe(true);
      expect(isMassEffectFaction(faction)).toBe(false);
      expect(Object.values(CROSSOVER_SHIPS).filter(ship => ship.faction === faction)).toHaveLength(2);
    }
    for (const ship of Object.values(CROSSOVER_SHIPS)) {
      expect(SHIP_CLASSES[ship.id]).toBe(ship);
      expect(ship.designProvenance.provenance).toBe('AU_MODIFIED');
      for (const value of [ship.lengthM, ship.hull, ship.armour, ship.barriers, ship.barrierRegen, ship.maxSpeed, ship.acceleration, ship.turnRate, ship.sensorRange]) {
        expect(Number.isFinite(value.value)).toBe(true);
        expect(value.value).toBeGreaterThanOrEqual(0);
        expect(value.provenance).toBe('AU_MODIFIED');
      }
      expect(ship.pointValue).toBeGreaterThan(0);
      for (const mount of ship.hardpoints) {
        expect(WEAPONS[mount.weaponId]).toBeDefined();
        expect(mount.count).toBeGreaterThan(0);
        expect(mount.offset.every(Number.isFinite)).toBe(true);
        expect(Math.hypot(...mount.offset)).toBeLessThan(ship.lengthM.value / 2);
      }
    }
    for (const weapon of Object.values(CROSSOVER_WEAPONS)) {
      expect(WEAPONS[weapon.id]).toBe(weapon);
      expect(weapon.provenance.provenance).toBe('AU_MODIFIED');
      expect(weapon.provenance.note).toContain('not a canonical cross-universe');
      expect(weapon.cooldown).toBeGreaterThan(0);
    }
    expect(WEAPONS.alliance_dn_main.damage).toBe(1000);
    expect(WEAPONS.alliance_dn_main.cooldown).toBe(4);
    expect(getShipClass('reaper_capital').lengthM.value).toBe(2000);
  });

  it('retains declared encounter tiers and different protection profiles under the real rule resolver', () => {
    const marathon = getShipClass('unsc_marathon'), infinity = getShipClass('unsc_infinity');
    const ccs = getShipClass('covenant_ccs'), cas = getShipClass('covenant_cas');
    const lunar = getShipClass('imperium_lunar'), retribution = getShipClass('imperium_retribution');
    expect(applyRulesToShip(marathon, CANON_ME3).barriers).toBe(0);
    expect(ccs.barriers.value).toBeGreaterThan(ccs.hull.value);
    expect(cas.barriers.value).toBeGreaterThan(infinity.barriers.value);
    expect(lunar.hull.value).toBeGreaterThan(infinity.hull.value * 2);
    expect(retribution.hull.value + retribution.barriers.value).toBeGreaterThan((cas.hull.value + cas.barriers.value) * 3);
    expect(retribution.pointValue).toBeGreaterThan(cas.pointValue * 3);
    expect(retribution.maxSpeed.value).toBeLessThan(marathon.maxSpeed.value);
    expect(retribution.turnRate.value).toBeLessThan(ccs.turnRate.value);
    for (const ship of Object.values(CROSSOVER_SHIPS)) for (const hp of ship.hardpoints) {
      const base = WEAPONS[hp.weaponId];
      const resolved = applyRulesToWeapon(base, ship.faction, ship, PRIME_APEX, WEAPONS);
      expect(resolved.id).toBe(base.id);
      expect(resolved.internalWarheadFraction ?? 0).toBe(0);
      expect(resolved.substitutedFrom).toBeUndefined();
    }
  });

  it('fires real side-facing macro mounts and applies swept projectile damage deterministically', () => {
    const run = () => {
      const rules = cloneRules(CANON_ME3); rules.id = 'crossover_test'; rules.category = 'au';
      const sim = new BattleSimulation(buildCustomBattle({ seed: 51, rulesId: rules.id, environment: 'deep_space', startingDistanceKm: 60, maxDuration: 30,
        sideA: { faction: 'imperium', name: 'Broadside', formation: 'line_abreast', counts: { imperium_lunar: 1 } },
        sideB: { faction: 'unsc', name: 'Armour target', formation: 'line_abreast', counts: { unsc_infinity: 1 } },
      }, rules));
      const shooter = sim.ships.find(s => s.side === 'A')!, target = sim.ships.find(s => s.side === 'B')!;
      for (const fleet of sim.fleets.values()) sim.issueOrders(fleet.spec.id, { order: 'hold_formation' });
      shooter.heading = { x: -1, y: 0, z: 0 }; shooter.prevHeading = { ...shooter.heading };
      target.barriers = 0;
      for (const ship of sim.ships) for (const mount of ship.weapons) mount.cooldown = ship === shooter && mount.def.id === 'wh_macro_cruiser' && Math.abs(mount.facing - Math.PI / 2) < 1e-6 ? 0 : 1000;
      for (let i = 0; i < 160; i++) sim.step();
      const fired = sim.events.filter(e => e.type === 'weapon_fired' && e.shipId === shooter.id && e.weaponId === 'wh_macro_cruiser');
      expect(fired.length).toBeGreaterThan(0);
      expect(shooter.stats.hits).toBeGreaterThan(0);
      expect(target.stats.damageTaken).toBeGreaterThan(0);
      return sim.events;
    };
    expect(run()).toEqual(run());
  });

  it('keeps crossover factions and hulls outside campaign status, politics and production', () => {
    for (const rules of [CANON_ME3, PRIME_APEX]) {
      const state = createCampaign({ seed: 51, rules: cloneRules(rules), worldState: {} });
      for (let i = 0; i < 6; i++) advanceTick(state, { interactive: true });
      expect(Object.keys(state.factions).sort()).toEqual([...MASS_EFFECT_FACTION_IDS].sort());
      for (const faction of Object.values(state.factions)) {
        expect(isMassEffectFaction(faction.faction)).toBe(true);
        expect(Number.isFinite(faction.cooperation + faction.productionPool + faction.morale)).toBe(true);
      }
      for (const fleet of state.fleets) {
        expect(isMassEffectFaction(fleet.faction)).toBe(true);
        for (const id of Object.keys(fleet.counts)) expect(isCrossoverFaction(getShipClass(id).faction)).toBe(false);
      }
    }
  });
});
