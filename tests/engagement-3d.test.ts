import { describe, expect, it } from 'vitest';
import { distance, sub, v3, dot, normalize } from '@/core/vec3';
import { buildCustomBattle } from '@/scenarios';
import { BattleSimulation } from '@/simulation/battle';
import { sampleGeometry, type GeometrySample } from '@/simulation/engagementGeometry';
import { ATTACK_SWING, assignAttackBearings, swingAmount, swingStation } from '@/simulation/manoeuvre';

/**
 * Fleets used to fight as two sheets in one plane (thickness 0.03 to 0.10 of their width, firing lines 4° to 11°
 * off the horizontal, measured on the build before this change). Engaging hulls now take attack bearings round
 * their targets: over, under and round the flanks, by an angle their class allows.
 */
const DEG = Math.PI / 180;
const line = (count: number, width = 20) => Array.from({ length: count }, (_, i) => ({ id: `s${String(i).padStart(2, '0')}`, lateral: count === 1 ? 0 : -width / 2 + width * i / (count - 1) }));

describe('attack bearings', () => {
  it('classes that manoeuvre get a bearing within their limits; carriers and fighters keep their stations', () => {
    expect(assignAttackBearings('carrier', line(4)).size).toBe(0);
    expect(assignAttackBearings('fighter', line(4)).size).toBe(0);
    for (const role of ['dreadnought', 'cruiser', 'frigate', 'reaper_capital', 'reaper_destroyer'] as const) {
      const bearings = assignAttackBearings(role, line(12));
      expect(bearings.size).toBe(12);
      for (const bearing of bearings.values()) {
        expect(bearing.swing).toBeGreaterThanOrEqual(ATTACK_SWING[role]![0] - 1e-9);
        expect(bearing.swing).toBeLessThanOrEqual(ATTACK_SWING[role]![1] + 1e-9);
        expect(Math.hypot(bearing.right, bearing.up)).toBeCloseTo(1, 9);
      }
    }
  });

  it('a class swings as far as its job needs: a firing line least, a screen most', () => {
    const most = (role: keyof typeof ATTACK_SWING) => ATTACK_SWING[role]![1];
    expect(most('dreadnought')).toBeLessThan(most('cruiser'));
    expect(most('cruiser')).toBeLessThan(most('frigate'));
    expect(most('reaper_capital')).toBeLessThan(most('reaper_destroyer'));
    // A dreadnought's spinal gun stays on one firing line: its swing is a step, not a flank.
    expect(most('dreadnought')).toBeLessThanOrEqual(15 * DEG);
    // A frigate can get round the beam of its target.
    expect(most('frigate')).toBeGreaterThan(90 * DEG);
  });

  it('the middle of a line goes over or under; the wings go round their own side', () => {
    const members = line(11);
    const bearings = assignAttackBearings('cruiser', members);
    const centre = bearings.get('s05')!, left = bearings.get('s00')!, right = bearings.get('s10')!;
    expect(Math.abs(centre.up)).toBeGreaterThan(0.9);
    expect(left.right).toBeLessThan(-0.9);
    expect(right.right).toBeGreaterThan(0.9);
    // Every hull on the port half breaks to port and every hull on the starboard half to starboard: no crossing.
    for (const member of members) if (Math.abs(member.lateral) > 1e-6) expect(Math.sign(bearings.get(member.id)!.right)).toBe(Math.sign(member.lateral));
    // Outer hulls flank wider than inner ones.
    expect(right.swing).toBeGreaterThan(centre.swing);
  });

  it('neighbours never share a bearing, and both above and below are used', () => {
    const members = line(16);
    const bearings = assignAttackBearings('frigate', members);
    const ups = [...bearings.values()].map(b => Math.sign(b.up));
    expect(ups.filter(u => u > 0).length).toBeGreaterThanOrEqual(6);
    expect(ups.filter(u => u < 0).length).toBeGreaterThanOrEqual(6);
    for (let i = 0; i + 1 < members.length; i++) {
      const a = bearings.get(members[i].id)!, b = bearings.get(members[i + 1].id)!;
      expect(Math.abs(a.swing - b.swing) + Math.abs(a.right - b.right) + Math.abs(a.up - b.up)).toBeGreaterThan(0.05);
    }
  });

  it('depends only on deployment geometry, not on the order hulls are listed in', () => {
    const members = line(9);
    const forward = assignAttackBearings('reaper_destroyer', members);
    const backward = assignAttackBearings('reaper_destroyer', [...members].reverse());
    for (const member of members) expect(backward.get(member.id)).toEqual(forward.get(member.id));
  });
});

describe('swinging a station round its target', () => {
  const target = v3(0, 0, 20), station = v3(3, 0.5, 4);
  it('keeps the range and turns by the bearing', () => {
    const swung = swingStation(station, target, { swing: 40 * DEG, right: 0, up: 1 }, 1);
    expect(distance(swung, target)).toBeCloseTo(distance(station, target), 9);
    const cos = dot(normalize(sub(swung, target)), normalize(sub(station, target)));
    expect(Math.acos(cos) / DEG).toBeCloseTo(40, 6);
    expect(swung.y).toBeGreaterThan(station.y + 5);
    // Half the amount is half the angle; none leaves the station where it was.
    const half = swingStation(station, target, { swing: 40 * DEG, right: 0, up: 1 }, 0.5);
    expect(Math.acos(dot(normalize(sub(half, target)), normalize(sub(station, target)))) / DEG).toBeCloseTo(20, 6);
    expect(swingStation(station, target, { swing: 40 * DEG, right: 0, up: 1 }, 0)).toEqual(station);
  });

  it('right is the attacker\'s right as it faces the target, below is below', () => {
    const fromSouth = swingStation(v3(0, 0, 0), v3(0, 0, 10), { swing: 30 * DEG, right: 1, up: 0 }, 1);
    expect(fromSouth.x).toBeGreaterThan(4.9);
    expect(Math.abs(fromSouth.y)).toBeLessThan(1e-9);
    const under = swingStation(v3(0, 0, 0), v3(0, 0, 10), { swing: 30 * DEG, right: 0, up: -1 }, 1);
    expect(under.y).toBeLessThan(-4.9);
  });

  it('opens as the hull closes: none at twice its range, all of it by 1.15 times', () => {
    expect(swingAmount(40, 20)).toBe(0);
    expect(swingAmount(60, 20)).toBe(0);
    expect(swingAmount(23, 20)).toBe(1);
    expect(swingAmount(10, 20)).toBe(1);
    let previous = 0;
    for (let d = 40; d >= 23; d -= 1) { const a = swingAmount(d, 20); expect(a).toBeGreaterThanOrEqual(previous); previous = a; }
  });
});

describe('a battle in three dimensions', () => {
  const run = (seed: number): { samples: GeometrySample[]; sim: BattleSimulation } => {
    const sim = new BattleSimulation(buildCustomBattle({
      seed, rulesId: 'prime_apex', environment: 'deep_space', startingDistanceKm: 60, maxDuration: 100,
      sideA: { faction: 'alliance', name: 'Alliance line', formation: 'line_abreast', counts: { alliance_dreadnought: 6, alliance_cruiser: 18, alliance_frigate: 30 } },
      sideB: { faction: 'reaper', name: 'Reaper pressure', formation: 'strike_wedge', counts: { reaper_capital: 8, reaper_destroyer: 30 } },
    }));
    const samples: GeometrySample[] = [];
    let next = 0;
    while (!sim.finished && sim.time < 90) {
      sim.step();
      if (sim.time >= next) { next += 5; samples.push(...sampleGeometry(sim)); }
    }
    return { samples, sim };
  };
  const mean = (samples: GeometrySample[], side: string, key: 'thickness' | 'elevationDeg' | 'steepShare' | 'abaftShare' | 'overlaps') => {
    const rows = samples.filter(s => s.side === side && s.time >= 40);
    return rows.reduce((sum, row) => sum + row[key], 0) / rows.length;
  };

  // Measured on this battle before the change / after it (seed 42, from 40 s on):
  //   Alliance thickness 0.079 / 0.279, firing-line elevation 11.3° / 25.8°, share steeper than 15° 0.27 / 0.65;
  //   Reaper thickness 0.058 / 0.324, elevation 4.5° / 18.7°, share steeper than 15° 0.04 / 0.46.
  it.each([42, 7])('both fleets fight in depth, with steep firing lines and attackers off the beam (seed %i)', seed => {
    const { samples, sim } = run(seed);
    for (const side of ['A', 'B']) {
      expect(mean(samples, side, 'thickness')).toBeGreaterThan(0.2);
      expect(mean(samples, side, 'overlaps')).toBe(0);
    }
    expect(mean(samples, 'A', 'elevationDeg')).toBeGreaterThan(18);
    expect(mean(samples, 'B', 'elevationDeg')).toBeGreaterThan(13);
    expect(mean(samples, 'A', 'steepShare')).toBeGreaterThan(0.45);
    expect(mean(samples, 'B', 'steepShare')).toBeGreaterThan(0.3);
    // Attackers get abaft their targets' beams: 0.07 and 0.05 of the Alliance before attack bearings. With them the
    // share swings widely from seed to seed (0.15 to 0.56 over eight seeds, mean 0.29; 0.31 since hulls give way
    // earlier on converging courses, with these two seeds at 0.26 and 0.19), so each seed is held well clear of the
    // old figure and not to one seed's value.
    expect(mean(samples, 'A', 'abaftShare')).toBeGreaterThan(0.12);
    // It starts as a formation: the first sample is still a sheet.
    expect(samples.find(s => s.side === 'A')!.thickness).toBeLessThan(0.1);
    // Guns still take part: every dreadnought and Reaper capital fired, and nearly every cruiser and destroyer.
    const fired = (role: string) => sim.ships.filter(s => s.role === role && s.stats.shotsFired > 0).length / sim.ships.filter(s => s.role === role).length;
    expect(fired('dreadnought')).toBe(1);
    expect(fired('reaper_capital')).toBe(1);
    expect(fired('cruiser')).toBeGreaterThanOrEqual(0.85);
    expect(fired('reaper_destroyer')).toBeGreaterThanOrEqual(0.95);
  });

  it('is reproducible: the same seed gives the same positions', () => {
    const a = run(42).sim, b = run(42).sim;
    expect(a.ships.map(s => [s.pos.x, s.pos.y, s.pos.z])).toEqual(b.ships.map(s => [s.pos.x, s.pos.y, s.pos.z]));
  });
});
