import { describe, expect, it } from 'vitest';
import { buildCustomBattle } from '@/scenarios';
import { BattleSimulation, SIM_DT } from '@/simulation/battle';
import type { BattleLike } from '@/simulation/battleLike';
import { RemoteBattle } from '@/simulation/remoteBattle';
import { SimWorkerCore, transferables, type FromWorker, type ToWorker } from '@/simulation/simWorkerCore';

/**
 * The interface can be given a battle that is simulated in a worker. Here the worker's side (`SimWorkerCore`) and
 * the drawing thread's side (`RemoteBattle`) are joined without a real worker: every message in either direction
 * goes through `structuredClone`, as `postMessage` would, and answers arrive only when the test delivers them.
 */
function config(seed = 42) {
  return buildCustomBattle({
    seed, rulesId: 'prime_apex', environment: 'deep_space', startingDistanceKm: 40, maxDuration: 200,
    sideA: { faction: 'alliance', name: 'Fifth Fleet', formation: 'line_abreast', counts: { alliance_dreadnought: 3, alliance_carrier: 1, alliance_cruiser: 6, alliance_frigate: 8 } },
    sideB: { faction: 'reaper', name: 'Reapers', formation: 'strike_wedge', counts: { reaper_capital: 3, reaper_destroyer: 8 } },
  });
}

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

/** A remote battle joined to a worker core. `deliver` hands over the answers produced so far, like a message turn. */
function joined(seed = 42) {
  const core = new SimWorkerCore();
  const outbox: FromWorker[] = [];
  const sent: ToWorker[] = [];
  const remote = new RemoteBattle(config(seed), message => {
    sent.push(message);
    const answer = core.handle(structuredClone(message));
    if (answer) outbox.push(structuredClone(answer, { transfer: transferables(answer) }));
  }, SIM_DT);
  const deliver = () => { for (const answer of outbox.splice(0)) remote.receive(answer); };
  return { remote, sent, deliver };
}

describe('a battle simulated in a worker', () => {
  it('has its ships on the first frame, before the worker has answered anything', () => {
    const { remote } = joined();
    const inline = new BattleSimulation(config());
    expect(remote.ships.length).toBe(inline.ships.length);
    expect(canonical(remote.ships)).toEqual(canonical(inline.ships));
    expect(canonical(remote.events)).toEqual(canonical(inline.events));
    // It can stand in wherever the interface takes a battle.
    const battle: BattleLike = remote;
    expect(battle.getShip(inline.ships[0].id)?.name).toBe(inline.ships[0].name);
    expect(() => remote.step()).toThrow();
  });

  it('driven a frame at a time, is the same battle as the simulation stepped inline, orders included', () => {
    const { remote, deliver } = joined();
    const inline = new BattleSimulation(config());
    const fleetId = [...inline.fleets.values()].find(f => f.spec.side === 'A')!.spec.id;
    const heard: string[] = [];
    remote.onEvent = event => heard.push(event.type);
    let frames = 0, orderedAtTick = -1, alphaSum = 0, alphaCount = 0;
    while (!remote.finished && frames < 12000) {
      // 60 frames a second; the worker's answers arrive between frames.
      const alpha = remote.advance(1 / 60, 0.2);
      alphaSum += alpha; alphaCount++;
      deliver();
      frames++;
      if (orderedAtTick < 0 && remote.tick >= 200) {
        orderedAtTick = remote.tick;
        remote.issueOrders(fleetId, { order: 'hold_formation' });
        // Shown on this thread at once, before the worker has seen it.
        expect(remote.fleets.get(fleetId)!.orders.order).toBe('hold_formation');
      }
    }
    expect(remote.finished).toBe(true);
    // The order reached the worker's simulation after the tick it was one ahead by: replay that inline.
    expect(orderedAtTick).toBeGreaterThanOrEqual(200);
    let appliedAt = -1;
    for (const tick of [orderedAtTick, orderedAtTick + 1, orderedAtTick + 2]) {
      const candidate = new BattleSimulation(config());
      while (candidate.tick < tick) candidate.step();
      candidate.issueOrders(fleetId, { order: 'hold_formation' });
      while (!candidate.finished) candidate.step();
      if (JSON.stringify(canonical(candidate.ships)) === JSON.stringify(canonical(remote.ships))) { appliedAt = tick; break; }
    }
    // At most two ticks (a tenth of a second) after the frame the order was given on.
    expect(appliedAt).toBeGreaterThanOrEqual(orderedAtTick);
    const replay = new BattleSimulation(config());
    while (replay.tick < appliedAt) replay.step();
    replay.issueOrders(fleetId, { order: 'hold_formation' });
    while (!replay.finished) replay.step();
    expect(remote.tick).toBe(replay.tick);
    expect(canonical(remote.ships)).toEqual(canonical(replay.ships));
    expect(canonical(remote.fleets)).toEqual(canonical(replay.fleets));
    expect(canonical(remote.events)).toEqual(canonical(replay.events));
    expect(canonical(remote.result)).toEqual(canonical(replay.result));
    expect(heard).toEqual(replay.events.slice(replay.events.length - heard.length).map(event => event.type));
    // Real time was kept: a tick every three frames at 60 frames a second, and the picture moved between ticks.
    expect(frames).toBeGreaterThan(remote.tick * 2.9);
    expect(frames).toBeLessThan(remote.tick * 3.1 + 10);
    expect(alphaSum / alphaCount).toBeGreaterThan(0.3);
    expect(alphaSum / alphaCount).toBeLessThan(0.7);
  });

  it('answers battery queries from the worker\'s simulation, and stays put while paused', () => {
    const { remote, deliver, sent } = joined();
    const inline = new BattleSimulation(config());
    const fleetId = [...inline.fleets.values()].find(f => f.spec.side === 'A')!.spec.id;
    const dreadnought = inline.ships.find(s => s.role === 'dreadnought')!;
    remote.primaryBatteryStatus(dreadnought.id);
    for (let frame = 0; frame < 900; frame++) { remote.advance(1 / 60, 0.2); deliver(); }
    while (inline.tick < remote.tick) inline.step();
    // The mirror is one applied tick behind the worker at most; the statuses it holds are those of the tick it shows.
    expect(remote.fleetBatteryStatus(fleetId)).toEqual(inline.fleetBatteryStatus(fleetId));
    expect(remote.primaryBatteryStatus(dreadnought.id)).toEqual(inline.primaryBatteryStatus(dreadnought.id));
    const tick = remote.tick, requests = sent.length;
    for (let frame = 0; frame < 120; frame++) { remote.advance(0, 0.2); deliver(); }
    expect(remote.tick).toBe(tick);
    // Paused, it asks for nothing more than the one tick it keeps in hand.
    expect(sent.length).toBeLessThanOrEqual(requests + 1);
  });

  it('a slow worker costs smoothness, not frames: the picture holds and then catches up without a spiral', () => {
    const { remote, deliver } = joined();
    for (let frame = 0; frame < 300; frame++) { remote.advance(1 / 60, 0.2); deliver(); }
    const before = remote.tick;
    // The worker answers nothing for two seconds of frames.
    for (let frame = 0; frame < 120; frame++) expect(remote.advance(1 / 60, 0.2)).toBeLessThanOrEqual(1);
    expect(remote.tick).toBeLessThanOrEqual(before + 1);
    expect(remote.accumulator).toBeLessThanOrEqual(0.2 + SIM_DT + 1e-9);
    for (let frame = 0; frame < 60; frame++) { deliver(); remote.advance(1 / 60, 0.2); }
    // It resumes at real time; it does not try to repay the two seconds.
    expect(remote.tick).toBeGreaterThan(before + 15);
    expect(remote.tick).toBeLessThan(before + 1 + 5 + 22);
  });
});
