import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { AU_DESIGN_NOTE, SANDBOX_FACTIONS, SANDBOX_SHIPS, SANDBOX_WEAPONS, SKYNET_SHIPS } from '@/data/auFactions';
import { FACTIONS } from '@/data/factions';
import { SHIP_CLASSES } from '@/data/ships';
import { WEAPONS } from '@/data/weapons';
import { MASS_EFFECT_FACTION_IDS, SANDBOX_FACTION_IDS, isCrossoverFaction, isSandboxFaction } from '@/data/types';
import { getShipTemplate, hasModel } from '@/rendering/ships';
import { buildCustomBattle } from '@/scenarios';
import { BattleSimulation } from '@/simulation/battle';
import { isShipAllowedInRules } from '@/timelines/lore';
import { getPreset } from '@/timelines/presets';
import { createCampaign } from '@/campaign/engine';

describe('playable AU civilization and machine factions', () => {
  it('registers three separate AU factions without changing the canonical campaign faction set', () => {
    expect(Object.keys(SANDBOX_FACTIONS)).toEqual([...SANDBOX_FACTION_IDS]);
    expect(MASS_EFFECT_FACTION_IDS).toHaveLength(8);
    for (const id of SANDBOX_FACTION_IDS) {
      expect(FACTIONS[id].sandboxOnly).toBe(true); expect(FACTIONS[id].universe).toBe('mass_effect');
      expect(isSandboxFaction(id)).toBe(true); expect(isCrossoverFaction(id)).toBe(false);
      expect(Object.values(SANDBOX_SHIPS).filter(s => s.faction === id)).toHaveLength(2);
    }
    expect(FACTIONS.skynet.sandboxOnly).toBe(true); expect(FACTIONS.skynet.universe).toBe('terminator');
    expect(isCrossoverFaction('skynet')).toBe(true);
    const campaign = createCampaign({ seed: 5, rules: getPreset('canon_me3'), worldState: {} });
    expect(Object.keys(campaign.factions).sort()).toEqual([...MASS_EFFECT_FACTION_IDS].sort());
    for (const fleet of campaign.fleets) expect(MASS_EFFECT_FACTION_IDS).toContain(fleet.faction);
  });

  it('has complete declared hull/weapon data, distinct real models and Strict Lore exclusions', () => {
    const strict = getPreset('strict_lore');
    const ships = { ...SANDBOX_SHIPS, ...SKYNET_SHIPS };
    expect(Object.keys(ships)).toHaveLength(Object.keys(SANDBOX_SHIPS).length + Object.keys(SKYNET_SHIPS).length);
    for (const ship of Object.values(ships)) {
      expect(SHIP_CLASSES[ship.id]).toBe(ship); expect(ship.designProvenance.provenance).toBe('AU_MODIFIED');
      expect(isShipAllowedInRules(ship, strict)).toBe(false); expect(hasModel(ship.id)).toBe(true);
      for (const value of [ship.lengthM, ship.hull, ship.armour, ship.barriers, ship.barrierRegen, ship.maxSpeed, ship.acceleration, ship.turnRate, ship.sensorRange]) {
        expect(value.provenance).toBe('AU_MODIFIED'); expect(Number.isFinite(value.value)).toBe(true); expect(value.value).toBeGreaterThanOrEqual(0);
      }
      expect(ship.pointValue).toBeGreaterThan(0);
      for (const mount of ship.hardpoints) { expect(WEAPONS[mount.weaponId]).toBeDefined(); expect(Math.hypot(...mount.offset)).toBeLessThan(ship.lengthM.value / 2); }
      const model = getShipTemplate(ship.id), size = new THREE.Box3().setFromObject(model.group).getSize(new THREE.Vector3());
      expect(model.lengthUnits).toBeCloseTo(ship.lengthM.value / 100, 6); expect(size.z).toBeCloseTo(model.lengthUnits, 4);
    }
    for (const weapon of Object.values(SANDBOX_WEAPONS)) {
      expect(WEAPONS[weapon.id]).toBe(weapon); expect(weapon.provenance.provenance).toBe('AU_MODIFIED');
      expect(weapon.provenance.note).toBe(AU_DESIGN_NOTE); expect(weapon.cooldown).toBeGreaterThan(0);
    }
  });

  it('gives both selectable civilization frames real kinetic and energy batteries for doctrine choices', () => {
    for (const id of ['player_civ_cruiser', 'player_civ_dreadnought', 'past_cycle_cruiser', 'past_cycle_dreadnought']) {
      const kinds = new Set(SHIP_CLASSES[id].hardpoints.map(h => WEAPONS[h.weaponId].kind));
      expect(kinds.has('mass_accelerator')).toBe(true); expect(kinds.has('thanix')).toBe(true);
    }
    expect(SHIP_CLASSES.player_civ_cruiser.pointValue).toBe(280); expect(SHIP_CLASSES.player_civ_dreadnought.pointValue).toBe(900);
    expect(SHIP_CLASSES.past_cycle_cruiser.pointValue).toBe(400); expect(SHIP_CLASSES.past_cycle_dreadnought.pointValue).toBe(1200);
    expect(SHIP_CLASSES.skynet_hunter.barriers.value).toBe(0); expect(SHIP_CLASSES.skynet_harvester.barriers.value).toBe(0);
    expect(SHIP_CLASSES.skynet_harvester.hull.value).toBeLessThan(SHIP_CLASSES.reaper_capital.hull.value);
  });

  it.each([
    ['player_civ', 'player_civ_dreadnought'], ['past_cycle', 'past_cycle_dreadnought'],
    ['prothean', 'prothean_dreadnought'], ['skynet', 'skynet_harvester'],
  ] as const)('%s participates in an actual damaging battle against Reapers', (faction, classId) => {
    const config = buildCustomBattle({ seed: 6, rulesId: 'multiverse_crossover', environment: 'deep_space', startingDistanceKm: 30, maxDuration: 90,
      sideA: { faction, name: 'AU battlegroup', formation: 'line_abreast', counts: { [classId]: 1 } },
      sideB: { faction: 'reaper', name: 'Reaper target', formation: 'line_abreast', counts: { reaper_capital: 1 } },
    });
    const sim = new BattleSimulation(config);
    for (let i = 0; i < 600; i++) sim.step();
    for (const side of ['A', 'B']) {
      expect(sim.events.some(e => e.type === 'weapon_fired' && sim.getShip(e.shipId)?.side === side)).toBe(true);
    }
    expect(sim.ships.some(s => s.stats.damageTaken > 0)).toBe(true);
    expect(sim.ships.filter(s => s.faction === 'reaper').every(s => !s.withdrawing && !s.escaped)).toBe(true);
  });
});
