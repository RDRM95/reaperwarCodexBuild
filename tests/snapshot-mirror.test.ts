import { describe, expect, it } from 'vitest';
import { buildCustomBattle } from '@/scenarios';
import { BattleSimulation } from '@/simulation/battle';
import { SimMirror, SnapshotEncoder, SHIP_STRIDE } from '@/simulation/snapshot';
import type { BattleEvent } from '@/simulation/types';

/**
 * The simulation is to run in a Web Worker, with the drawing thread holding a mirror that is updated from one
 * snapshot a tick. The mirror is only useful if it is the battle: every field the interface might read must equal
 * the real one. Each snapshot here goes through `structuredClone`, which is what `postMessage` does to it.
 */

/** A value with its keys in order and unset keys dropped, so objects built in different ways compare equal. */
function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value instanceof Map) return canonical([...value.entries()]);
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(value as object).sort()) {
      const item = (value as Record<string, unknown>)[key];
      if (item !== undefined) out[key] = canonical(item);
    }
    return out;
  }
  return value;
}

function battle(seed: number, rulesId: string, reinforcementsAt?: number): BattleSimulation {
  const config = buildCustomBattle({
    seed, rulesId, environment: 'deep_space', startingDistanceKm: 40, maxDuration: 200,
    sideA: { faction: 'alliance', name: 'Fifth Fleet', formation: 'line_abreast', counts: { alliance_dreadnought: 2, alliance_carrier: 2, alliance_cruiser: 6, alliance_frigate: 10 } },
    sideB: { faction: 'reaper', name: 'Reapers', formation: 'strike_wedge', counts: { reaper_capital: 3, reaper_destroyer: 10 } },
  });
  // A second Alliance wave that arrives during the battle: its ships do not exist when the mirror starts.
  if (reinforcementsAt !== undefined) config.fleets.push({ ...config.fleets[0], id: 'second-wave', name: 'Second wave', arrivalTime: reinforcementsAt });
  return new BattleSimulation(config);
}

describe('a mirrored battle', () => {
  it.each([[42, 'prime_apex', undefined], [7, 'reaper_hardcore', 12], [3, 'canon_me3', undefined]] as const)(
    'equals the simulation field for field, every 20 ticks and at the end (seed %i, %s)', (seed, rulesId, reinforcementsAt) => {
      const sim = battle(seed, rulesId, reinforcementsAt);
      const encoder = new SnapshotEncoder(sim);
      const mirror = new SimMirror(sim.config);
      const heard: BattleEvent[] = [];
      mirror.onEvent = event => heard.push(event);
      mirror.apply(structuredClone(encoder.encode()));
      const first = mirror.ships[0], startCount = mirror.ships.length;
      let spawnedLater = 0, sawProjectiles = 0, sawMissiles = 0, sawFlashes = 0, compared = 0;
      for (let tick = 1; tick <= 1600 && !sim.finished; tick++) {
        sim.step();
        const snapshot = structuredClone(encoder.encode());
        if (tick > 1) spawnedLater += snapshot.spawned.length;
        mirror.apply(snapshot);
        sawProjectiles += mirror.projectiles.length; sawMissiles += mirror.missiles.length; sawFlashes += mirror.flashes.length;
        if (tick % 20 !== 0 && !sim.finished) continue;
        compared++;
        expect(mirror.tick).toBe(sim.tick);
        expect(mirror.time).toBe(sim.time);
        expect(mirror.finished).toBe(sim.finished);
        expect(mirror.ships.length).toBe(sim.ships.length);
        for (let i = 0; i < sim.ships.length; i++) expect(canonical(mirror.ships[i]), `${sim.ships[i].id} at tick ${tick}`).toEqual(canonical(sim.ships[i]));
        expect(canonical(mirror.projectiles)).toEqual(canonical(sim.projectiles));
        expect(canonical(mirror.missiles)).toEqual(canonical(sim.missiles));
        expect(canonical(mirror.flashes)).toEqual(canonical(sim.flashes));
        expect(canonical(mirror.fleets)).toEqual(canonical(sim.fleets));
      }
      expect(canonical(mirror.events)).toEqual(canonical(sim.events));
      expect(heard).toEqual(mirror.events);
      expect(canonical(mirror.result)).toEqual(canonical(sim.result));
      // The comparison covered a real battle: ships appeared after the start, and shots, missiles and flashes flew.
      expect(compared).toBeGreaterThan(20);
      expect(spawnedLater).toBeGreaterThan(0);
      expect(mirror.ships.length).toBeGreaterThan(startCount);
      expect(sawProjectiles).toBeGreaterThan(0);
      expect(sawMissiles).toBeGreaterThan(0);
      expect(sawFlashes).toBeGreaterThan(0);
      expect(sim.ships.some(s => !s.alive)).toBe(true);
      // Objects the interface holds stay the same objects for the whole battle.
      expect(mirror.ships[0]).toBe(first);
      expect(mirror.getShip(first.id)).toBe(first);
    });

  it('a snapshot is plain data: numbers in typed arrays, nothing shared with the simulation', () => {
    const sim = battle(42, 'prime_apex');
    const encoder = new SnapshotEncoder(sim);
    encoder.encode();
    for (let i = 0; i < 200; i++) sim.step();
    const snapshot = encoder.encode();
    expect(snapshot.ships).toBeInstanceOf(Float64Array);
    expect(snapshot.ships.length).toBe(sim.ships.length * SHIP_STRIDE);
    // Only ships that appeared since the previous snapshot travel whole; everything else is rows of numbers.
    expect(snapshot.spawned.length).toBeLessThan(sim.ships.length);
    const clone = structuredClone(snapshot);
    expect(clone.ships).not.toBe(snapshot.ships);
    expect(Array.from(clone.ships)).toEqual(Array.from(snapshot.ships));
    // Events are sent once: a second snapshot with no step in between has none.
    expect(encoder.encode().events).toHaveLength(0);
  });

  it('the encoder leaves the simulation untouched: a battle with snapshots ends exactly like one without', () => {
    const plain = battle(42, 'prime_apex'), observed = battle(42, 'prime_apex');
    const encoder = new SnapshotEncoder(observed);
    for (let tick = 0; tick < 600; tick++) { plain.step(); observed.step(); encoder.encode(); }
    expect(canonical(observed.ships)).toEqual(canonical(plain.ships));
    expect(observed.events.length).toBe(plain.events.length);
  });
});
