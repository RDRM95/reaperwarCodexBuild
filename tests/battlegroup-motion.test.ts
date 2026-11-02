import { beforeAll, describe, expect, it } from 'vitest';
import { dot, v3 } from '@/core/vec3';
import type { ShipRole } from '@/data/types';
import { buildCustomBattle } from '@/scenarios';
import { BattleSimulation, SIM_DT } from '@/simulation/battle';

/** Keep real navigation, target selection and firing arcs active throughout a
 * long approach; suppress damage so casualties cannot disguise lost spacing. */
function battle() {
  const sim = new BattleSimulation(buildCustomBattle({
    seed: 42, rulesId: 'prime_apex', environment: 'deep_space', startingDistanceKm: 80, maxDuration: 180,
    sideA: { faction: 'alliance', name: 'Battlegroup front', formation: 'line_abreast',
      counts: { alliance_dreadnought: 18, alliance_cruiser: 36, alliance_frigate: 36 } },
    sideB: { faction: 'reaper', name: 'Pressure wings', formation: 'strike_wedge',
      counts: { reaper_capital: 6, reaper_destroyer: 24 } },
  }));
  for (const ship of sim.ships) for (const weapon of ship.weapons) weapon.def = { ...weapon.def, damage: 0 };
  return sim;
}

function extent(sim: BattleSimulation, role: ShipRole) {
  const ships = sim.ships.filter(ship => ship.role === role);
  const fleet = sim.fleets.get(ships[0].fleetId)!;
  const right = v3(fleet.heading.z, 0, -fleet.heading.x);
  const xs = ships.map(ship => dot(ship.pos, right));
  const ys = ships.map(ship => ship.pos.y);
  return { width: Math.max(...xs) - Math.min(...xs), height: Math.max(...ys) - Math.min(...ys) };
}

const roles: ShipRole[] = ['dreadnought', 'cruiser', 'frigate', 'reaper_capital', 'reaper_destroyer'];

describe('battlegroup shape during actual engagement', () => {
  let sim: BattleSimulation;
  const starting = new Map<ShipRole, { width: number; height: number }>();

  beforeAll(() => {
    sim = battle();
    expect(sim.ships).toHaveLength(120);
    for (const role of roles) starting.set(role, extent(sim, role));
    for (let i = 0; i < Math.round(120 / SIM_DT); i++) sim.step();
  });

  it('retains broad organic wings and ordered Reaper wings through approach and sustained fire', () => {
    expect(sim.finished).toBe(false);
    for (const role of roles) {
      // Existing per-hull radial goals contracted Reaper capital width by 43%
      // in this battle. Evaluate real positions in each fleet's current basis.
      expect(extent(sim, role).width).toBeGreaterThan(starting.get(role)!.width * 0.80);
    }
    expect(extent(sim, 'frigate').height).toBeGreaterThan(starting.get('frigate')!.height * 0.75);
  });

  it('keeps both sides and every role fighting as the formation spreads across the front', () => {
    for (const role of roles) {
      expect(sim.events.some(event => event.type === 'weapon_fired' && event.t > 90 && sim.getShip(event.shipId)?.role === role)).toBe(true);
    }
    for (const ship of sim.ships.filter(candidate => candidate.faction === 'reaper')) {
      expect(ship.withdrawing).toBe(false);
      expect(ship.escaped).toBe(false);
    }
  });
});

describe('screen interception after an explicit enemy retreat', () => {
  it('intercepts nearby retreating cruisers while the capital line keeps its fleet focus', () => {
    const sim = new BattleSimulation(buildCustomBattle({
      seed: 5, rulesId: 'canon_me3', environment: 'deep_space', startingDistanceKm: 60, maxDuration: 180,
      sideA: { faction: 'alliance', name: 'Retreating formation', formation: 'line_abreast', counts: { alliance_dreadnought: 1, alliance_cruiser: 3 } },
      sideB: { faction: 'reaper', name: 'Capital and interceptors', formation: 'line_abreast', counts: { reaper_capital: 1, reaper_destroyer: 3 } },
    }));
    for (const ship of sim.ships) for (const weapon of ship.weapons) weapon.def = { ...weapon.def, damage: 0 };
    sim.issueOrders('custom-a', { order: 'retreat' });
    const dreadnought = sim.ships.find(ship => ship.role === 'dreadnought')!;
    const fleet = sim.fleets.get('custom-b')!;
    fleet.focusTargetId = dreadnought.id;
    fleet.decisionTimer = 100;
    for (const ship of sim.ships) ship.aiTimer = 0;
    sim.step();
    for (const screen of sim.ships.filter(ship => ship.role === 'reaper_destroyer')) {
      expect(sim.getShip(screen.targetId!)?.role).toBe('cruiser');
    }
    const capital = sim.ships.find(ship => ship.role === 'reaper_capital')!;
    expect(capital.targetId).toBe(dreadnought.id);
  });

  it('uses the escort closing speed without towing it behind a slow capital', () => {
    const sim = new BattleSimulation(buildCustomBattle({
      seed: 5, rulesId: 'canon_me3', environment: 'deep_space', startingDistanceKm: 80, maxDuration: 240,
      sideA: { faction: 'alliance', name: 'Withdrawing cruiser', formation: 'line_abreast', counts: { alliance_cruiser: 1 } },
      sideB: { faction: 'reaper', name: 'Capital and pressure screen', formation: 'line_abreast', counts: { reaper_capital: 1, reaper_destroyer: 1 } },
    }));
    const cruiser = sim.ships.find(ship => ship.role === 'cruiser')!;
    const capital = sim.ships.find(ship => ship.role === 'reaper_capital')!;
    const destroyer = sim.ships.find(ship => ship.role === 'reaper_destroyer')!;
    cruiser.pos.y = 8;
    cruiser.prevPos = { ...cruiser.pos };
    sim.fleets.get(cruiser.fleetId)!.anchor.y = 8;
    for (const ship of sim.ships) for (const weapon of ship.weapons) weapon.def = { ...weapon.def, damage: 0 };
    sim.issueOrders(cruiser.fleetId, { order: 'retreat' });
    let peakScreenSpeed = 0;
    for (let i = 0; i < Math.round(180 / SIM_DT); i++) {
      sim.step();
      peakScreenSpeed = Math.max(peakScreenSpeed, Math.hypot(destroyer.vel.x, destroyer.vel.y, destroyer.vel.z));
    }
    expect(sim.finished).toBe(false);
    expect(cruiser.escaped).toBe(false);
    expect(peakScreenSpeed).toBeGreaterThan(capital.maxSpeed * 1.5);
    expect(sim.events.some(event => event.type === 'weapon_fired' && event.shipId === destroyer.id && event.targetId === cruiser.id && event.kind === 'reaper_beam' && event.t > 120)).toBe(true);
    expect(destroyer.withdrawing).toBe(false);
    expect(destroyer.escaped).toBe(false);
  });
});
