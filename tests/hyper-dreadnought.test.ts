import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { SHIP_CLASSES } from '@/data/ships';
import { WEAPONS } from '@/data/weapons';
import { getShipTemplate, hasModel } from '@/rendering/ships';
import { TRACER_AMBER, tracerColour } from '@/rendering/visualWeight';
import { buildCustomBattle, buildScenario } from '@/scenarios';
import { BattleSimulation } from '@/simulation/battle';
import { BATTLESPACE_SCALE as S } from '@/simulation/constants';
import { carriesCapitalRounds, isMagazineMainGun } from '@/simulation/fireControl';
import { isProtectedAuHull } from '@/simulation/reaperHardcore';
import type { BattleEvent, ShipState, WeaponState } from '@/simulation/types';
import { isShipAllowedInRules } from '@/timelines/lore';
import { PRIME_APEX, STRICT_LORE } from '@/timelines/presets';
import { applyRulesToWeapon } from '@/timelines/rules';

/**
 * Hyper-dreadnoughts. Owner's request, 16 Nov 2026: "create hyper dreadnuaghts, ships that are byond super
 * dreadnaughts, and equal to or bigger than reapers with very powerful, capital one shot, barrier deplete, armour
 * destroying teraton yield, using them should be like a nuke, area of effect ... also unique colour due to the speed
 * and nature of the weapon, massive railguns and spinal guns".
 *
 * Two classes: the Alliance Titan (5,200 m, the KRONOS Lance) and the Hierarchy Imperator (4,400 m, twin siege
 * rails). Their rounds carry a blast: every enemy hull near the impact is damaged and loses armour.
 */
const HYPER = ['alliance_titan', 'turian_imperator'] as const;
const battle = (a: Record<string, number>, b: Record<string, number>, rulesId = 'canon_me3', faction = 'alliance', seed = 5) =>
  new BattleSimulation(buildCustomBattle({ seed, rulesId, environment: 'deep_space', startingDistanceKm: 120, maxDuration: 400,
    sideA: { faction, name: 'A', formation: 'line_abreast', counts: a },
    sideB: { faction: 'reaper', name: 'B', formation: 'line_abreast', counts: b } } as never));
const place = (ship: ShipState, x: number, y: number, z: number) => { ship.pos = { x, y, z }; ship.prevPos = { x, y, z }; ship.vel = { x: 0, y: 0, z: 0 }; };
const gunOf = (ship: ShipState, id: string): WeaponState => ship.weapons.find(w => w.def.id === id)!;
/** Strike `target` at its centre with one round of `gun`, as the projectile code does. */
const strike = (sim: BattleSimulation, shooter: ShipState, target: ShipState, gun: WeaponState, share = 1) =>
  (sim as unknown as { applyHit(s: ShipState, t: ShipState, w: WeaponState['def'], d: number, p: ShipState['pos']): void })
    .applyHit(shooter, target, gun.def, gun.def.damage * share, { ...target.pos });

describe('the catalogue', () => {
  it.each(HYPER)('%s is an AU dreadnought longer and tougher than a Sovereign, with a model its own length', id => {
    const cls = SHIP_CLASSES[id], sovereign = SHIP_CLASSES.reaper_capital, valkyrie = SHIP_CLASSES.alliance_valkyrie;
    expect(cls.role).toBe('dreadnought');
    expect(cls.designProvenance.provenance).toBe('AU_MODIFIED');
    expect(cls.lengthM.value).toBeGreaterThan(sovereign.lengthM.value * 2);
    expect(cls.lengthM.value).toBeGreaterThan(valkyrie.lengthM.value * 2);
    expect(cls.hull.value + cls.barriers.value).toBeGreaterThan(sovereign.hull.value + sovereign.barriers.value);
    expect(cls.pointValue).toBeGreaterThan(valkyrie.pointValue);
    expect(isShipAllowedInRules(cls, STRICT_LORE)).toBe(false);
    expect(isShipAllowedInRules(cls, PRIME_APEX)).toBe(true);
    expect(isProtectedAuHull({ classId: id })).toBe(true);
    // The model.
    expect(hasModel(id)).toBe(true);
    const built = getShipTemplate(id), box = new THREE.Box3().setFromObject(built.group), size = box.getSize(new THREE.Vector3());
    expect(built.lengthUnits).toBe(cls.lengthM.value / 100);
    expect(Math.abs(size.z - built.lengthUnits) / built.lengthUnits).toBeLessThan(0.015);
    expect(built.group.children).toHaveLength(5);
    expect(built.engineNodes.length).toBeGreaterThanOrEqual(5);
    for (const marker of [...built.engineNodes, built.muzzle!]) expect(box.clone().expandByScalar(built.lengthUnits * 0.005).containsPoint(marker)).toBe(true);
    for (const engine of built.engineNodes) expect(engine.z).toBeLessThan(-built.lengthUnits * 0.4);
    expect(built.muzzle!.z).toBeGreaterThan(built.lengthUnits * 0.45);
    for (const object of built.group.children) expect((object as THREE.Mesh).geometry.attributes.position.count).toBeLessThan(10000);
  });

  it('the two hulls are different ships: one twin-hulled and slab-sided, one tall and winged', () => {
    const [titan, imperator] = HYPER.map(id => { const b = getShipTemplate(id); return new THREE.Box3().setFromObject(b.group).getSize(new THREE.Vector3()).divideScalar(b.lengthUnits); });
    expect(imperator.x).toBeGreaterThan(titan.x * 1.8);
    expect(imperator.y).toBeGreaterThan(titan.y * 1.5);
  });

  it('the KRONOS Lance is the heaviest round in the catalogue: a magazine gun that the refit leaves alone, with a blast', () => {
    const lance = WEAPONS.kronos_lance, rail = WEAPONS.imperator_siege_rail;
    for (const other of Object.values(WEAPONS)) if (other.id !== lance.id) expect(lance.damage).toBeGreaterThan(other.damage);
    expect(lance.damage).toBeGreaterThan(WEAPONS.valkyrie_nova.damage * 3);
    expect(lance.range).toBeGreaterThan(WEAPONS.reaper_capital_beam.range);
    expect(lance.magazine).toBe(5);
    expect(lance.blast!.radius).toBeGreaterThan(rail.blast!.radius);
    expect(lance.blast!.damage).toBeGreaterThan(rail.blast!.damage);
    // Only these two rounds carry a blast.
    expect(Object.values(WEAPONS).filter(w => w.blast).map(w => w.id).sort()).toEqual(['imperator_siege_rail', 'kronos_lance']);
    for (const [cls, weapon] of [[SHIP_CLASSES.alliance_titan, lance], [SHIP_CLASSES.turian_imperator, rail]] as const) {
      const mounted = applyRulesToWeapon(weapon, cls.faction, cls, PRIME_APEX, WEAPONS);
      expect(mounted.id).toBe(weapon.id);
      // What the rules do to the round they do to its blast.
      expect(mounted.blast!.damage / weapon.blast!.damage).toBeCloseTo(mounted.damage / weapon.damage, 9);
    }
    // A turreted railgun is no spinal gun, and has no magazine.
    expect(WEAPONS.hyper_railgun.arc).toBeGreaterThan(90);
    expect(WEAPONS.hyper_railgun.magazine).toBeUndefined();
    expect(WEAPONS.hyper_railgun.damage).toBeGreaterThan(WEAPONS.omaha_spinal.damage);
  });

  it('in a battle the ship carries its rounds as capital-killing rounds, and its blast is on the battle’s scale', () => {
    const sim = battle({ alliance_titan: 1 }, { reaper_capital: 1 });
    const titan = sim.ships.find(s => s.classId === 'alliance_titan')!, lance = gunOf(titan, 'kronos_lance');
    expect(isMagazineMainGun(lance)).toBe(true);
    expect(carriesCapitalRounds(titan)).toBe(true);
    expect(lance.ammo).toBe(5);
    expect(lance.def.blast!.radius).toBeCloseTo(WEAPONS.kronos_lance.blast!.radius * S, 9);
    expect(titan.weapons.filter(w => w.def.id === 'hyper_railgun')).toHaveLength(4);
  });
});

describe('a KRONOS round', () => {
  const setup = (rulesId = 'canon_me3') => {
    const sim = battle({ alliance_titan: 1, alliance_frigate: 1 }, { reaper_capital: 1, reaper_destroyer: 3 }, rulesId);
    const titan = sim.ships.find(s => s.classId === 'alliance_titan')!, lance = gunOf(titan, 'kronos_lance');
    const capital = sim.ships.find(s => s.role === 'reaper_capital')!, frigate = sim.ships.find(s => s.role === 'frigate')!;
    const [near, far, outside] = sim.ships.filter(s => s.role === 'reaper_destroyer');
    const radius = lance.def.blast!.radius;
    place(titan, 0, 0, 0); place(capital, 0, 0, 30);
    // Distances are from the impact (here the capital's centre) to each hull's plating.
    place(near, near.radiusKm + radius * 0.2, 0, 30);
    place(far, 0, far.radiusKm + radius * 0.8, 30);
    place(outside, 0, 0, 30 + outside.radiusKm + radius * 1.1);
    place(frigate, -(frigate.radiusKm + radius * 0.1), 0, 30);
    const events: BattleEvent[] = []; const prev = sim.onEvent; sim.onEvent = e => { prev?.(e); events.push(e); };
    return { sim, titan, lance, capital, near, far, outside, frigate, radius, events };
  };

  it.each(['canon_me3', 'prime_apex', 'reaper_hardcore'])('under %s destroys a fresh Sovereign with one hit', rulesId => {
    const { sim, titan, lance, capital } = setup(rulesId);
    expect(capital.barriers).toBe(capital.maxBarriers);
    strike(sim, titan, capital, lance);
    expect(capital.alive).toBe(false);
  });

  it('breaks the enemy ships round the impact, less the further off they are, and nothing outside its radius', () => {
    const { sim, titan, lance, near, far, outside, frigate, capital, events, radius } = setup();
    const before = { far: far.barriers, farArmour: far.armour, outside: { ...outside }, frigate: { ...frigate } };
    strike(sim, titan, capital, lance);
    // A destroyer a fifth of the way out is destroyed outright: (0.8)² of the blast is more than its barriers and hull.
    expect(lance.def.blast!.damage * 0.64).toBeGreaterThan(near.maxBarriers + near.maxHull);
    expect(near.alive).toBe(false);
    // One four fifths of the way out takes (0.2)² of it on its barriers, and loses that share of the armour shred.
    expect(far.alive).toBe(true);
    expect(before.far - far.barriers).toBeCloseTo(lance.def.blast!.damage * 0.04, 3);
    expect(far.armour).toBeCloseTo(before.farArmour * (1 - lance.def.blast!.armourShred * 0.04), 6);
    // Outside the radius, and on the firing side, nothing.
    expect(outside.barriers).toBe(before.outside.barriers); expect(outside.hull).toBe(before.outside.hull); expect(outside.armour).toBe(before.outside.armour);
    expect(frigate.barriers).toBe(before.frigate.barriers); expect(frigate.hull).toBe(before.frigate.hull);
    const blast = events.find(e => e.type === 'blast');
    expect(blast).toMatchObject({ type: 'blast', shipId: titan.id, weaponId: 'kronos_lance', radius, caught: 2, destroyed: 1 });
    // The kills are the Titan's.
    expect(titan.stats.kills).toBe(2);
  });

  it('a glancing hit delivers its share of the blast, and a hull that survives the hit loses armour', () => {
    const { sim, titan, lance, far, capital } = setup();
    const before = far.barriers;
    strike(sim, titan, capital, lance, 0.5);
    expect(before - far.barriers).toBeCloseTo(lance.def.blast!.damage * 0.04 * 0.5, 3);
    // The Imperator's round does not destroy a Sovereign; it strips its armour.
    const t = battle({ turian_imperator: 1 }, { reaper_capital: 1 }, 'canon_me3', 'turian');
    const imperator = t.ships.find(s => s.classId === 'turian_imperator')!, rail = gunOf(imperator, 'imperator_siege_rail'), sovereign = t.ships.find(s => s.role === 'reaper_capital')!;
    const armour = sovereign.armour;
    strike(t, imperator, sovereign, rail);
    expect(sovereign.alive).toBe(true);
    expect(sovereign.barriers).toBe(0);
    expect(sovereign.armour).toBeLessThanOrEqual(armour * (1 - rail.def.blast!.armourShred));
    strike(t, imperator, sovereign, rail);
    expect(sovereign.alive).toBe(false);
  });

  it('is fired by the ship itself at a Sovereign, and a miss sets off nothing', () => {
    const { sim, titan, lance, capital, events } = setup('prime_apex');
    titan.heading = { x: 0, y: 0, z: 1 }; titan.targetId = capital.id; lance.cooldown = 0;
    for (let i = 0; i < 200 && !events.some(e => e.type === 'weapon_fired' && e.weaponId === 'kronos_lance'); i++) sim.step();
    const fired = events.find(e => e.type === 'weapon_fired' && e.weaponId === 'kronos_lance');
    expect(fired).toMatchObject({ targetId: capital.id });
    expect(lance.ammo).toBe(4);
    // A round that strikes nothing has no blast: a blast is reported only with a hit.
    for (let i = 0; i < 60; i++) sim.step();
    const hits = events.filter(e => e.type === 'projectile_impact' && e.shipId === titan.id && e.damage > 100000).length;
    expect(events.filter(e => e.type === 'blast').length).toBe(hits);
  });
});

describe('in a fleet action', () => {
  it('a battle with blasts in it is the same battle every time it is run from one seed', () => {
    const log = () => {
      const sim = battle({ alliance_titan: 2, alliance_cruiser: 10, alliance_frigate: 20 }, { reaper_capital: 10, reaper_destroyer: 30 }, 'prime_apex', 'alliance', 45); const out: string[] = [];
      sim.onEvent = e => { if (e.type === 'blast') out.push(`${e.t.toFixed(2)} ${e.shipId} ${e.caught} ${e.destroyed} ${e.pos.x.toFixed(4)}`); else if (e.type === 'ship_destroyed') out.push(`${e.t.toFixed(2)} ${e.shipId}`); };
      while (!sim.finished && sim.time < 130) { sim.step(); if (sim.events.length > 50000) sim.events.length = 0; }
      return out;
    };
    const first = log();
    expect(first.some(line => line.split(' ').length === 5)).toBe(true);
    expect(log()).toEqual(first);
  });

  it('every hyper-dreadnought round is fired at a capital ship while the Reapers have one', () => {
    const sim = new BattleSimulation(buildScenario('apex_titan_line', 'prime_apex', 1)); let atCapitals = 0, atEscorts = 0;
    sim.onEvent = e => {
      if (e.type !== 'weapon_fired' || (e.weaponId !== 'kronos_lance' && e.weaponId !== 'imperator_siege_rail')) return;
      if (sim.getShip(e.targetId)?.role === 'reaper_capital') atCapitals++; else if (sim.ships.some(s => s.role === 'reaper_capital' && s.alive)) atEscorts++;
    };
    while (!sim.finished && sim.time < 140) { sim.step(); if (sim.events.length > 50000) sim.events.length = 0; }
    expect(atEscorts).toBe(0);
    expect(atCapitals).toBeGreaterThanOrEqual(4);
  });
});

describe('the colour of a round', () => {
  it('an ordinary slug is amber; a round with a blast is blue to violet with its speed, the KRONOS round the most violet', () => {
    expect(tracerColour(undefined)).toBe(TRACER_AMBER);
    expect(tracerColour({ ...WEAPONS.valkyrie_nova, projectileSpeed: WEAPONS.valkyrie_nova.projectileSpeed * S })).toBe(TRACER_AMBER);
    const channels = (c: number) => ({ r: c >> 16, g: (c >> 8) & 0xff, b: c & 0xff });
    const lance = channels(tracerColour({ ...WEAPONS.kronos_lance, projectileSpeed: WEAPONS.kronos_lance.projectileSpeed * S }));
    const rail = channels(tracerColour({ ...WEAPONS.imperator_siege_rail, projectileSpeed: WEAPONS.imperator_siege_rail.projectileSpeed * S }));
    for (const c of [lance, rail]) { expect(c.b).toBe(0xff); expect(c.b).toBeGreaterThan(c.r); expect(c.b).toBeGreaterThan(c.g); }
    // More red and less green with speed: toward violet.
    expect(lance.r).toBeGreaterThan(rail.r);
    expect(lance.g).toBeLessThan(rail.g);
    expect(lance).toEqual({ r: 0xc7, g: 0x9b, b: 0xff });
  });
});
