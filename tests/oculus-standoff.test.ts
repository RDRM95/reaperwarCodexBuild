import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { buildCustomBattle } from '@/scenarios';
import { BattleSimulation, SIM_DT } from '@/simulation/battle';
import { engagementBand, shipEngagementRange } from '@/simulation/ai';
import { SHIP_CLASSES } from '@/data/ships';
import { WEAPONS } from '@/data/weapons';
import { buildReaperOculus } from '@/rendering/ships/oculus';

describe('deliberate capital gunnery and Oculus interceptors', () => {
  it('keeps spinal batteries comfortably within firing range', () => {
    const sim = new BattleSimulation(buildCustomBattle({
      seed: 31, rulesId: 'canon_me3', environment: 'deep_space',
      startingDistanceKm: 75, maxDuration: 180,
      sideA: { faction: 'alliance', name: 'Gunnery', formation: 'line_abreast', counts: { alliance_dreadnought: 1 } },
      sideB: { faction: 'reaper', name: 'Harvester', formation: 'line_abreast', counts: { reaper_capital: 1 } },
    }));
    const dreadnought = sim.ships.find(s => s.classId === 'alliance_dreadnought')!;
    const band = engagementBand(dreadnought);
    expect(band.preferred).toBeLessThan(shipEngagementRange(dreadnought) * 0.90);
    expect(band.max).toBeLessThan(shipEngagementRange(dreadnought) * 0.95);
    expect(WEAPONS.reaper_capital_beam.range).toBeGreaterThan(WEAPONS.alliance_dn_main.range);
    expect(WEAPONS.reaper_capital_beam.cooldown).toBeGreaterThan(WEAPONS.alliance_dn_main.cooldown);
    expect(SHIP_CLASSES.reaper_capital.turnRate.value).toBeLessThan(SHIP_CLASSES.alliance_dreadnought.turnRate.value);
  });

  it('builds the red-eye interceptor with economical render geometry', () => {
    const drone = buildReaperOculus();
    const meshes = drone.group.children.filter((c): c is THREE.Mesh => (c as THREE.Mesh).isMesh);
    expect(meshes.map(c => c.name).sort()).toEqual(['accent', 'engine', 'hull', 'hullDark', 'windows']);
    expect(drone.engineNodes).toHaveLength(1);
    expect(drone.muzzle?.z).toBeGreaterThan(0);
    expect(drone.lengthUnits).toBeCloseTo(0.16);
    expect(meshes.every(mesh => Array.from(mesh.geometry.getAttribute('position').array).every(Number.isFinite))).toBe(true);
  });

  it('deploys a bounded Oculus screen in four-craft squadron lanes', () => {
    const configuration = buildCustomBattle({
      seed: 4, rulesId: 'prime_apex', environment: 'deep_space',
      startingDistanceKm: 45, maxDuration: 90,
      sideA: { faction: 'alliance', name: 'Defenders', formation: 'line_abreast', counts: { alliance_dreadnought: 1 } },
      sideB: { faction: 'reaper', name: 'Interceptors', formation: 'line_abreast', counts: { reaper_capital: 8 } },
    });
    configuration.rules.special.reaperHardcore = true;
    const sim = new BattleSimulation(configuration);
    sim.issueOrders('custom-b', { fightersDeployed: true });
    for (const s of sim.ships) for (const w of s.weapons) w.def = { ...w.def, damage: 0 };
    for (let i = 0; i < Math.round(12 / SIM_DT); i++) sim.step();
    const oculi = sim.ships.filter(s => s.classId === 'reaper_oculus');
    expect(oculi).toHaveLength(24); // fleet cap, not 32 simultaneous drones
    expect(new Set(oculi.map(s => s.id)).size).toBe(24);
    expect(new Set(oculi.map(s => s.slot.x)).size).toBeGreaterThan(2);
    expect(oculi.every(s => s.role === 'fighter' && s.weapons[0].def.id === 'oculus_beam')).toBe(true);
  });
});
