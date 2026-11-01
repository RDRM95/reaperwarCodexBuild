import { describe, expect, it } from 'vitest';
import { distance, length, sub, v3 } from '@/core/vec3';
import { buildCustomBattle } from '@/scenarios';
import { BattleSimulation, SIM_DT } from '@/simulation/battle';
import { slotToWorld } from '@/simulation/formations';
import type { ShipState } from '@/simulation/types';
import { shipEngagementRange } from '@/simulation/ai';

/** Keep real firing, arcs and movement active without attrition ending a control experiment. */
function harmless(sim: BattleSimulation): void {
  for (const ship of sim.ships) for (const weapon of ship.weapons) weapon.def = { ...weapon.def, damage: 0 };
}

function engagement(classId = 'alliance_dreadnought', count = 1, enemyCount = 1) {
  const faction = classId.startsWith('cerberus') ? 'cerberus' : 'alliance';
  const sim = new BattleSimulation(buildCustomBattle({
    seed: 42, rulesId: 'prime_apex', environment: 'deep_space', startingDistanceKm: 90, maxDuration: 600,
    sideA: { faction, name: 'Gunnery line', formation: 'line_abreast', counts: { [classId]: count } },
    sideB: { faction: 'reaper', name: 'Target line', formation: 'line_abreast', counts: { reaper_capital: enemyCount } },
  }));
  harmless(sim);
  sim.issueOrders('custom-b', { order: 'hold_formation' });
  return sim;
}

function advance(sim: BattleSimulation, seconds: number): void {
  const ticks = Math.round(seconds / SIM_DT);
  for (let i = 0; i < ticks; i++) sim.step();
  expect(sim.finished).toBe(false);
}

function primaryRange(ship: ShipState): number {
  return Math.max(...ship.weapons.filter(w => w.def.antiCapital && w.def.arc < 180).map(w => w.def.range));
}

describe('disciplined fleet combat regressions', () => {
  it('an exhausted fighter closes to its remaining cannon range instead of using an empty torpedo range', () => {
    const sim = engagement('alliance_fighter');
    const fighter = sim.ships.find(s => s.role === 'fighter')!;
    const cannon = fighter.weapons.find(w => w.def.kind === 'mass_accelerator')!;
    const loadedRange = shipEngagementRange(fighter);
    for (const weapon of fighter.weapons) if (weapon.ammo !== undefined) weapon.ammo = 0;
    expect(shipEngagementRange(fighter)).toBe(cannon.def.range);
    expect(shipEngagementRange(fighter)).toBeLessThan(loadedRange);
  });

  it.each(['retreat', 'withdraw'] as const)('Reapers reject initial and issued %s orders, keep firing and never escape', order => {
    const cfg = buildCustomBattle({
      seed: 7, rulesId: 'canon_me3', environment: 'deep_space', startingDistanceKm: 24, maxDuration: 300,
      sideA: { faction: 'alliance', name: 'Defenders', formation: 'line_abreast', counts: { alliance_dreadnought: 1 } },
      sideB: { faction: 'reaper', name: 'Pressure', formation: 'line_abreast', counts: { reaper_capital: 1, harbinger: 1 } },
    });
    cfg.fleets.find(f => f.side === 'B')!.initialOrder = { order };
    const sim = new BattleSimulation(cfg);
    harmless(sim);
    sim.issueOrders('custom-a', { order: 'hold_formation' });
    const reapers = sim.ships.filter(s => s.faction === 'reaper');
    for (const ship of reapers) { ship.hull = ship.maxHull * 0.05; ship.barriers = 0; }
    const starts = reapers.map(s => ({ ...s.pos }));
    advance(sim, 20);
    sim.issueOrders('custom-b', { order });
    advance(sim, 120);
    expect(['retreat', 'withdraw']).not.toContain(sim.fleets.get('custom-b')!.orders.order);
    for (const [i, ship] of reapers.entries()) {
      expect(ship.withdrawing).toBe(false);
      expect(ship.escaped).toBe(false);
      expect(ship.alive).toBe(true);
      expect(ship.stats.shotsFired).toBeGreaterThan(0);
      // Starts within beam range: no defensive run away from a stationary foe.
      expect(distance(ship.pos, sim.ships[0].pos)).toBeLessThanOrEqual(distance(starts[i], sim.ships[0].pos) + 0.25);
    }
    expect(sim.events.some(e => e.type === 'ship_withdrawing' && reapers.some(s => s.id === e.shipId))).toBe(false);
  });

  it.each(['alliance_dreadnought', 'cerberus_dreadnought', 'alliance_omaha'])('%s settles at spinal range and sustains fire without orbiting', classId => {
    const sim = engagement(classId);
    const ship = sim.ships.find(s => s.side === 'A')!;
    const target = sim.ships.find(s => s.side === 'B')!;
    const range = primaryRange(ship);
    const spinal = ship.weapons.find(w => w.def.antiCapital && w.def.arc < 90 && w.def.kind === 'mass_accelerator')!;
    expect(spinal).toBeDefined();
    advance(sim, 300);
    const ranges: number[] = [];
    let path = 0;
    let previous = { ...ship.pos };
    const shotsBefore = ship.stats.shotsFired;
    for (let i = 0; i < Math.round(60 / SIM_DT); i++) {
      sim.step();
      path += distance(previous, ship.pos);
      previous = { ...ship.pos };
      ranges.push(distance(ship.pos, target.pos));
    }
    expect(Math.min(...ranges) / range).toBeGreaterThan(0.68);
    expect(Math.max(...ranges) / range).toBeLessThan(0.98);
    expect(Math.max(...ranges) - Math.min(...ranges)).toBeLessThan(range * 0.04);
    expect(path).toBeLessThan(ship.lengthKm * 0.75);
    expect(length(ship.vel)).toBeLessThan(ship.maxSpeed * 0.03);
    expect(ship.stats.shotsFired).toBeGreaterThan(shotsBefore);
    expect(sim.events.some(e => e.type === 'weapon_fired' && e.shipId === ship.id && e.weaponId === spinal.def.id && e.t > 300)).toBe(true);
  });

  it('capital line rotates toward an off-axis threat and keeps assigned spacing', () => {
    const sim = engagement('alliance_dreadnought', 5);
    const target = sim.ships.find(s => s.side === 'B')!;
    const hostile = sim.fleets.get(target.fleetId)!;
    hostile.anchor = v3(13, 0, 12);
    target.pos = { ...hostile.anchor };
    target.prevPos = { ...target.pos };
    advance(sim, 360);
    const fleet = sim.fleets.get('custom-a')!;
    const line = sim.ships.filter(s => s.side === 'A');
    const positions = line.map(s => ({ ...s.pos }));
    advance(sim, 60);
    for (const [i, ship] of line.entries()) {
      expect(distance(ship.pos, slotToWorld(fleet.anchor, fleet.heading, ship.slot))).toBeLessThan(1.2);
      expect(distance(ship.pos, positions[i])).toBeLessThan(0.5);
      expect(length(ship.vel)).toBeLessThan(ship.maxSpeed * 0.04);
      expect(ship.stats.shotsFired).toBeGreaterThan(0);
      expect(distance(ship.pos, target.pos) / primaryRange(ship)).toBeGreaterThan(0.65);
    }
    for (let i = 0; i < line.length; i++) for (let j = i + 1; j < line.length; j++) {
      expect(length(sub(line[i].pos, line[j].pos))).toBeGreaterThan(line[i].radiusKm + line[j].radiusKm);
    }
  });

  it('target commitment survives a new fleet preference, while an explicit ship command takes effect immediately', () => {
    const sim = engagement('alliance_dreadnought', 1, 2);
    // Bring both enemies into sensor and gun range, ensuring this checks commitment rather than detection.
    const ship = sim.ships.find(s => s.side === 'A')!;
    const enemies = sim.ships.filter(s => s.side === 'B');
    for (const enemy of enemies) enemy.pos.z = ship.pos.z + primaryRange(ship) * 0.8;
    const fleet = sim.fleets.get(ship.fleetId)!;
    ship.aiTimer = 0;
    sim.step();
    const original = ship.targetId!;
    expect(original).toBeTruthy();
    const alternative = enemies.find(s => s.id !== original)!;
    fleet.focusTargetId = alternative.id;
    fleet.decisionTimer = 100;
    for (let i = 0; i < 40; i++) {
      ship.aiTimer = 0;
      sim.step();
      expect(ship.targetId).toBe(original);
    }
    sim.orderShipsAttack([ship.id], alternative.id);
    expect(ship.targetId).toBe(alternative.id);
    advance(sim, 2);
    expect(ship.targetId).toBe(alternative.id);
  });

  it('abandons an unreachable focus for an enemy already in its firing envelope', () => {
    const sim = new BattleSimulation(buildCustomBattle({
      seed: 42, rulesId: 'prime_apex', environment: 'deep_space', startingDistanceKm: 60, maxDuration: 300,
      sideA: { faction: 'alliance', name: 'Line', formation: 'line_abreast', counts: { alliance_dreadnought: 1 } },
      sideB: { faction: 'reaper', name: 'Threats', formation: 'line_abreast', counts: { reaper_capital: 1, reaper_destroyer: 1 } },
    }));
    harmless(sim);
    sim.issueOrders('custom-a', { order: 'hold_formation' });
    sim.issueOrders('custom-b', { order: 'hold_formation' });
    const ship = sim.ships.find(s => s.side === 'A')!;
    const distant = sim.ships.find(s => s.role === 'reaper_capital')!;
    const reachable = sim.ships.find(s => s.role === 'reaper_destroyer')!;
    distant.pos = v3(ship.pos.x, ship.pos.y, ship.pos.z + primaryRange(ship) * 1.8);
    reachable.pos = v3(ship.pos.x, ship.pos.y, ship.pos.z + primaryRange(ship) * 0.8);
    ship.targetId = distant.id;
    ship.targetLockUntil = 5;
    ship.aiTimer = 0;
    const fleet = sim.fleets.get(ship.fleetId)!;
    fleet.focusTargetId = distant.id;
    fleet.decisionTimer = 100;
    advance(sim, 2);
    expect(ship.targetId).toBe(reachable.id);
  });

  it('keeps a large mixed battle firing across successive windows with real losses', () => {
    const sim = new BattleSimulation(buildCustomBattle({
      seed: 42, rulesId: 'prime_apex', environment: 'deep_space', startingDistanceKm: 60, maxDuration: 150,
      sideA: { faction: 'alliance', name: 'Combined arms', formation: 'line_abreast', counts: { alliance_dreadnought: 18, alliance_cruiser: 36, alliance_frigate: 36 } },
      sideB: { faction: 'reaper', name: 'Pressure', formation: 'strike_wedge', counts: { reaper_capital: 6, reaper_destroyer: 24 } },
    }));
    expect(sim.ships).toHaveLength(120);
    for (let i = 0; i < Math.round(90 / SIM_DT) && !sim.finished; i++) sim.step();
    expect(sim.time).toBeGreaterThan(60);
    for (const start of [0, 30, 60]) {
      const fire = sim.events.filter(e => e.type === 'weapon_fired' && e.t >= start && e.t < start + 30);
      expect(fire.length).toBeGreaterThan(0);
      for (const side of ['A', 'B']) {
        expect(fire.some(e => e.type === 'weapon_fired' && sim.getShip(e.shipId)?.side === side &&
          (e.kind === 'mass_accelerator' || e.kind === 'reaper_beam'))).toBe(true);
      }
    }
    expect(sim.events.some(e => e.type === 'ship_destroyed')).toBe(true);
    for (const ship of sim.ships) for (const axis of ['x', 'y', 'z'] as const) {
      expect(Number.isFinite(ship.pos[axis])).toBe(true);
    }
  });

  it('a damaged capital brakes at a held station instead of continually crossing it', () => {
    const sim = engagement();
    sim.issueOrders('custom-a', { order: 'hold_formation' });
    const ship = sim.ships.find(s => s.side === 'A')!;
    const station = { ...ship.pos };
    ship.pos.x -= 8;
    ship.vel = v3(ship.maxSpeed, 0, 0);
    ship.subsystems.engines = 0.25;
    advance(sim, 180);
    expect(distance(ship.pos, station)).toBeLessThan(0.15);
    expect(length(ship.vel)).toBeLessThan(0.003);
    const settled = { ...ship.pos };
    advance(sim, 60);
    expect(distance(ship.pos, settled)).toBeLessThan(0.05);
  });
});
