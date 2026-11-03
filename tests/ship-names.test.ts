import { describe, expect, it } from 'vitest';
import { Rng } from '@/core/rng';
import { getShipClass, SHIP_CLASS_LIST } from '@/data/ships';
import { getPreset } from '@/timelines/presets';
import { BattleSimulation, SIM_DT } from '@/simulation/battle';
import { ShipNameGenerator } from '@/simulation/shipNames';
import type { BattleConfig, FleetSpec } from '@/simulation/types';

function fleet(id: string, classId: string, count: number, extra: Partial<FleetSpec> = {}): FleetSpec {
  const faction = getShipClass(classId).faction, hostile = faction === 'reaper';
  return { id, name: id, faction, side: hostile ? 'B' : 'A',
    ships: [{ classId, count }], formation: 'line_abreast', position: { x: 0, y: 0, z: hostile ? 1000 : -1000 },
    heading: { x: 0, y: 0, z: hostile ? -1 : 1 }, ...extra };
}

function config(fleets: FleetSpec[]): BattleConfig {
  return { id: 'named-deployment', name: 'Named deployment', scenarioId: 'custom', seed: 73, rules: getPreset('multiverse_crossover'),
    fleets, environment: 'deep_space', maxDuration: 30, perspectiveSide: 'A', objective: 'Inspect names without changing combat.' };
}

describe('faction-appropriate deterministic vessel names', () => {
  it('deploys hundreds of unique named vessels across the original and crossover factions', () => {
    const classes: string[] = [], factions = new Set<string>();
    for (const ship of SHIP_CLASS_LIST) if (ship.faction !== 'reaper' && ship.role !== 'fighter' && !factions.has(ship.faction)) {
      factions.add(ship.faction); classes.push(ship.id);
    }
    const sim = new BattleSimulation(config([...classes.map((id, index) => fleet(`fleet-${index}`, id, 24)), fleet('hostiles', 'reaper_capital', 8)]));
    expect(sim.ships.length).toBeGreaterThan(250);
    const named = sim.ships.filter(ship => ship.faction !== 'reaper');
    expect(new Set(named.map(ship => ship.name)).size).toBe(named.length);
    for (const ship of named) {
      expect(ship.name.trim().length).toBeGreaterThan(3);
      expect(ship.name).not.toMatch(/\s\d+$/);
    }
    expect(named.find(ship => ship.faction === 'alliance')!.name).toMatch(/^SSV /);
    expect(named.find(ship => ship.faction === 'turian')!.name).toMatch(/^PFS /);
    expect(named.find(ship => ship.faction === 'unsc')!.name).toMatch(/^UNSC /);
    expect(named.find(ship => ship.faction === 'covenant')!.name).toMatch(/Reverence|Mercy|Grace|Pilgrim/);
    expect(named.find(ship => ship.faction === 'imperium')!.name).toMatch(/Invictus|Terra|Martyr|Sol/);
    expect(named.find(ship => ship.faction === 'chaos')!.name).toMatch(/Bitter|Blasphemy|Wound|Cinders/);
    expect(sim.ships.find(ship => ship.faction === 'reaper')!.name).toMatch(/\s01$/);
  });

  it('preserves explicit names, reserves later arrivals, and retains unique signature vessels', () => {
    const first = new ShipNameGenerator().assign({ faction: 'alliance', role: 'frigate' });
    const pending = fleet('later', 'alliance_frigate', 1, { arrivalTime: 0.1, ships: [{ classId: 'alliance_frigate', count: 1, names: [first] }] });
    const sim = new BattleSimulation(config([
      fleet('ordinary', 'alliance_frigate', 3), pending,
      fleet('named', 'alliance_frigate_thanix', 1, { ships: [{ classId: 'alliance_frigate_thanix', count: 1, names: ['SSV Normandy SR-2'] }] }),
      fleet('asari', 'destiny_ascension', 1, { ships: [{ classId: 'destiny_ascension', count: 1, names: ['Destiny Ascension'] }] }),
      fleet('omaha', 'alliance_omaha', 1),
      fleet('boss', 'harbinger', 1, { ships: [{ classId: 'harbinger', count: 1, names: ['Harbinger'] }] }),
    ]));
    expect(sim.ships.some(ship => ship.name === first)).toBe(false);
    for (let i = 0; i < 3; i++) sim.step();
    expect(sim.ships.find(ship => ship.fleetId === 'later')!.name).toBe(first);
    for (const name of ['SSV Normandy SR-2', 'Destiny Ascension', 'SSV Omaha', 'Harbinger']) expect(sim.ships.some(ship => ship.name === name)).toBe(true);
    expect(new Set(sim.ships.map(ship => ship.name)).size).toBe(sim.ships.length);
  });

  it('names launched fighters and reinforcements from one shared reservation book', () => {
    const reservedCallsign = new ShipNameGenerator().assign({ faction: 'alliance', role: 'fighter' });
    const sim = new BattleSimulation(config([
      fleet('carrier', 'alliance_carrier', 1, { initialOrder: { order: 'hold_formation' } }),
      fleet('arrivals', 'alliance_fighter', 1, { arrivalTime: 4, ships: [{ classId: 'alliance_fighter', count: 1, names: [reservedCallsign] }] }),
      fleet('hostiles', 'reaper_capital', 1),
    ]));
    for (let i = 0; i < 12 / SIM_DT; i++) sim.step();
    const fighters = sim.ships.filter(ship => ship.role === 'fighter');
    expect(fighters).toHaveLength(25);
    expect(fighters.filter(ship => ship.carrierId)).toHaveLength(24);
    expect(fighters.find(ship => ship.fleetId === 'arrivals')!.name).toBe(reservedCallsign);
    expect(new Set(fighters.map(ship => ship.name)).size).toBe(fighters.length);
    for (const fighter of fighters) expect(fighter.name).not.toMatch(/\s\d+$/);
  });

  it('has word-based overflow for thousands of names and keeps future faction styles usable', () => {
    const generator = new ShipNameGenerator(), again = new ShipNameGenerator();
    const rng = new Rng(19), before = rng.getState();
    const requests = Array.from({ length: 5000 }, () => ({ faction: 'unsc', role: 'cruiser' as const }));
    const names = requests.map(request => generator.assign(request));
    expect(new Set(names).size).toBe(names.length);
    expect(names).toEqual(requests.map(request => again.assign(request)));
    expect(names.every(name => !/\d/.test(name))).toBe(true);
    for (const faction of ['prothean', 'past_cycle', 'player_civ', 'skynet', 'future_civilisation']) {
      const name = generator.assign({ faction, role: 'dreadnought' });
      expect(name.trim().length).toBeGreaterThan(4); expect(name).not.toMatch(/\d/);
    }
    expect(rng.getState()).toBe(before);
  });

  it('avoids visible case/spacing aliases while preserving the explicit display name', () => {
    const explicit = '  ssv   arcadia  ';
    const generator = new ShipNameGenerator([explicit]);
    expect(generator.assign({ faction: 'alliance', role: 'frigate' })).not.toBe('SSV Arcadia');
    expect(generator.assign({ faction: 'alliance', role: 'frigate', explicitName: explicit })).toBe(explicit);
    expect(generator.assign({ faction: 'future_civilisation', role: 'cruiser' })).not.toMatch(/\d/);
  });

  it('leaves IDs, RNG, movement, weapon states and statistics identical when only names differ', () => {
    const original = config([fleet('allied', 'alliance_carrier', 1), fleet('escort', 'alliance_cruiser', 2), fleet('hostiles', 'reaper_capital', 1)]);
    const explicit = structuredClone(original);
    for (const f of explicit.fleets) for (const group of f.ships) group.names = Array.from({ length: group.count }, (_, i) => `Chosen ${f.id} ${String.fromCharCode(65 + i)}`);
    const a = new BattleSimulation(original), b = new BattleSimulation(explicit);
    expect(a.rng.getState()).toBe(b.rng.getState());
    for (let i = 0; i < 6 / SIM_DT; i++) { a.step(); b.step(); }
    const mechanics = (sim: BattleSimulation) => sim.ships.map(({ name: _name, ...ship }) => ship);
    expect(a.rng.getState()).toBe(b.rng.getState());
    expect(mechanics(a)).toEqual(mechanics(b));
    expect(a.events.filter(event => event.type === 'weapon_fired')).toEqual(b.events.filter(event => event.type === 'weapon_fired'));
  });
});
