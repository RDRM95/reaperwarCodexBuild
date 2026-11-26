import { describe, expect, it } from 'vitest';
import { WEAPONS } from '@/data/weapons';
import { buildCustomBattle, buildScenario } from '@/scenarios';
import { OPENING_SCREEN_DEPTH_LIMIT, OPENING_SCREEN_LEAD, formationLineZ, holdsFormation, openingSlot } from '@/simulation/ai';
import { BattleSimulation } from '@/simulation/battle';
import { BATTLESPACE_SCALE } from '@/simulation/constants';
import {
  OPENING_HOLD_SECONDS, OPENING_HOLD_UNDER_FIRE, OPENING_SETTLE_SECONDS, OPENING_SHARE, OPENING_STAGGER_SECONDS, OpeningVolleyCoordinator, isOpeningBattery, openingStagger,
} from '@/simulation/volleys';
import { measureOpening } from '../scripts/opening-engagement';

/**
 * Owner's brief, 26 Nov 2026 ("Fleet combat and weapons visual overhaul"), sections 1 and 2: conventional fleets
 * closed too far before opening fire; give their mass accelerators an opening-fire range advantage over the
 * standard Reaper beam and a coordinated first volley, without reducing Reaper damage or survivability.
 *
 * Measured before (three seeds each): at the Battle of Earth the Reapers fired first, at 3.4 s from 55 km, and the
 * allied line answered at 12.1 s from 33 km with no main-battery round in the air before the Reapers' first shot;
 * five of 46 hulls fired in its first three seconds. The same at the Final Battle of Earth (5.2 s against 12.8 s).
 * A frigate screen ran 40 km ahead of its dreadnoughts in the first ten seconds, so the Reapers met the screen
 * while the gun line was over 100 km off.
 */
describe('conventional guns out-range the Reaper beam', () => {
  it('by class: a dreadnought well beyond it, a cruiser beyond it, a frigate inside it', () => {
    const beam = WEAPONS.reaper_capital_beam.range;
    expect(beam).toBe(54); // unchanged
    expect(WEAPONS.reaper_destroyer_beam.range).toBe(36);
    for (const id of ['alliance_dn_main', 'turian_dn_main', 'asari_dn_main', 'salarian_dn_main', 'geth_dn_main', 'ascension_main', 'apex_hyper_ma'])
      expect(WEAPONS[id].range, id).toBeGreaterThanOrEqual(beam * 1.29);
    for (const id of ['alliance_cruiser_main', 'turian_cruiser_main', 'asari_cruiser_main', 'salarian_cruiser_main', 'geth_cruiser_main', 'cerberus_cruiser_main'])
      { expect(WEAPONS[id].range, id).toBeGreaterThan(beam); expect(WEAPONS[id].range, id).toBeLessThan(WEAPONS.alliance_dn_main.range); }
    for (const id of ['alliance_frigate_main', 'cerberus_frigate_main', 'stg_frigate_main']) expect(WEAPONS[id].range, id).toBeLessThan(beam);
    // The guns built to kill capital ships reach further still, in the order of their weight.
    const ladder = ['alliance_dn_main', 'omaha_spinal', 'cerberus_hades_spinal', 'aegis_nova_command', 'valkyrie_nova', 'kronos_lance'].map((id) => WEAPONS[id].range);
    expect([...ladder].sort((a, b) => a - b)).toEqual(ladder);
    // Nothing else about a gun changed: damage, reload and round speed are as they were.
    expect(WEAPONS.alliance_dn_main).toMatchObject({ damage: 1000, cooldown: 4, projectileSpeed: 30 });
    expect(WEAPONS.reaper_capital_beam).toMatchObject({ damage: 1900, cooldown: 9.2 });
  });
});

describe('the fleet comes on as a fleet', () => {
  it('a hull ahead of the gun line is drawn in to it; the line and everything behind it stay where they were', () => {
    const line = 3;
    expect(openingSlot({ x: 1, y: 2, z: line }, line)).toEqual({ x: 1, y: 2, z: line });
    expect(openingSlot({ x: 1, y: 2, z: line - 9 }, line)).toEqual({ x: 1, y: 2, z: line - 9 });
    expect(openingSlot({ x: 1, y: 2, z: line + OPENING_SCREEN_LEAD }, line).z).toBeCloseTo(line + OPENING_SCREEN_LEAD, 9);
    const far = openingSlot({ x: 1, y: 2, z: line + 40 }, line);
    expect(far.x).toBe(1); expect(far.y).toBe(2);
    expect(far.z).toBeGreaterThan(line + OPENING_SCREEN_LEAD);
    expect(far.z).toBeLessThanOrEqual(line + OPENING_SCREEN_LEAD + OPENING_SCREEN_DEPTH_LIMIT + 1e-9);
    // Order is kept: of two hulls ahead of the line the one that was further ahead still is.
    expect(openingSlot({ x: 0, y: 0, z: line + 6 }, line).z).toBeGreaterThan(openingSlot({ x: 0, y: 0, z: line + 4 }, line).z);
  });

  it('deploys with its screen within a few kilometres of its foremost dreadnought, no hull in another’s place, and Reapers as they were', () => {
    const sim = new BattleSimulation(buildScenario('battle_of_earth', 'canon_me3', 1));
    const fleet = sim.fleets.get('alliance-5th')!, mine = sim.ships.filter((s) => s.fleetId === fleet.spec.id && s.role !== 'fighter');
    expect(holdsFormation(fleet)).toBe(true);
    const lineZ = formationLineZ(mine);
    const forward = (s: (typeof mine)[number]): number => (s.pos.x - fleet.anchor.x) * fleet.heading.x + (s.pos.z - fleet.anchor.z) * fleet.heading.z;
    // Its formation puts frigates 25 km (10 units) ahead of the dreadnoughts; they stand within 4 units of the line.
    const slotLead = Math.max(...mine.map((s) => s.slot.z)) - lineZ;
    expect(slotLead).toBeGreaterThan(8);
    expect(Math.max(...mine.map(forward)) - lineZ).toBeLessThan(OPENING_SCREEN_LEAD + OPENING_SCREEN_DEPTH_LIMIT + 0.5);
    for (let i = 0; i < mine.length; i++) for (let j = 0; j < i; j++) {
      const a = mine[i], b = mine[j];
      expect(Math.hypot(a.pos.x - b.pos.x, a.pos.y - b.pos.y, a.pos.z - b.pos.z), `${a.id} and ${b.id}`).toBeGreaterThanOrEqual(a.radiusKm + b.radiusKm);
    }
    // A Reaper fleet does not hold a formation for anyone.
    const reapers = sim.fleets.get('reaper-sol')!;
    expect(holdsFormation(reapers)).toBe(false);
    for (const s of sim.ships.filter((x) => x.fleetId === 'reaper-sol')) expect(s.openingSlot).toBeUndefined();
  });

  it('holds that order until it has opened or been hit, then lets its screen go', () => {
    const sim = new BattleSimulation(buildScenario('battle_of_earth', 'canon_me3', 1));
    const fleet = sim.fleets.get('alliance-5th')!;
    const lead = (): number => {
      const mine = sim.ships.filter((s) => s.fleetId === fleet.spec.id && s.alive && s.role !== 'fighter');
      const z = (s: (typeof mine)[number]): number => (s.pos.x - fleet.anchor.x) * fleet.heading.x + (s.pos.z - fleet.anchor.z) * fleet.heading.z;
      const dreadnoughts = mine.filter((s) => s.role === 'dreadnought'), frigates = mine.filter((s) => s.role === 'frigate');
      return Math.max(...frigates.map(z)) - Math.max(...dreadnoughts.map(z));
    };
    let worst = 0;
    while (!fleet.opened && sim.time < 60) { sim.step(); if (!fleet.opened) worst = Math.max(worst, lead()); }
    expect(fleet.opened).toBe(true);
    expect(fleet.openedAt).toBeCloseTo(sim.time, 6);
    // Before: the leading frigate was 40 km (16 units) ahead of the leading dreadnought ten seconds in.
    expect(worst).toBeLessThan(6);
    while (sim.time < fleet.openedAt! + 25) sim.step();
    expect(lead()).toBeGreaterThan(8);
  });
});

describe('the opening volley', () => {
  const battery = (dreadnoughts: number, km = 60) => {
    const sim = new BattleSimulation(buildCustomBattle({ seed: 3, rulesId: 'canon_me3', environment: 'deep_space', startingDistanceKm: km, maxDuration: 200,
      sideA: { faction: 'alliance', name: 'A', formation: 'line_abreast', counts: { alliance_dreadnought: dreadnoughts } },
      sideB: { faction: 'reaper', name: 'B', formation: 'line_abreast', counts: { reaper_capital: 1 } } } as never));
    const ships = sim.ships.filter((s) => s.side === 'A');
    return { sim, ships, gun: (i: number) => ships[i].weapons.find((w) => w.def.id === 'alliance_dn_main')! };
  };

  it('is for the forward spinal mass accelerators of dreadnoughts and cruisers: not frigates, Reapers, fighters, broadsides, beams or point defence', () => {
    const sim = new BattleSimulation(buildScenario('battle_of_earth', 'canon_me3', 1));
    while (!sim.ships.some((s) => s.role === 'fighter')) sim.step();
    const kinds = new Map<string, boolean>();
    // A class may carry a gun both forward and on a side mount: what matters is whether any mount of it opens.
    for (const ship of sim.ships) for (const w of ship.weapons) { const key = `${ship.role} ${w.def.id}`; kinds.set(key, (kinds.get(key) ?? false) || isOpeningBattery(ship, w)); }
    expect(kinds.get('dreadnought alliance_dn_main')).toBe(true);
    expect(kinds.get('cruiser alliance_cruiser_main')).toBe(true);
    // A frigate's gun is a 30-degree mount, not a spinal one, and reaches 40 km: the screen is no part of the volley.
    expect(kinds.get('frigate alliance_frigate_main')).toBe(false);
    for (const [key, opening] of kinds) if (/broadside|gardian|torpedo|thanix|reaper|fighter|oculus/.test(key)) expect(opening, key).toBe(false);
  });

  it('holds from the first gun that bears until most bear, and each gun then fires at its own moment within the stagger', () => {
    const { ships, gun } = battery(5), c = new OpeningVolleyCoordinator(), fleet = ships[0].fleetId, guns = () => 5;
    expect(Math.ceil(OPENING_SHARE * 5)).toBe(3);
    // One gun bears, then two: held.
    expect(c.canFire(10, fleet, ships[0], gun(0), false, guns)).toBe(false);
    expect(c.holding(10, fleet, ships[0], gun(0))).toBe(true);
    expect(c.canFire(10.05, fleet, ships[0], gun(0), false, guns)).toBe(false);
    expect(c.canFire(10.05, fleet, ships[1], gun(1), false, guns)).toBe(false);
    expect(c.released).toHaveLength(0);
    // Three bear in one tick: released.
    for (let i = 0; i < 3; i++) c.canFire(10.1, fleet, ships[i], gun(i), false, guns);
    expect(c.released).toEqual([{ fleetId: fleet, weaponId: 'alliance_dn_main', t: 10.1, ready: 3, guns: 5 }]);
    // Every gun, including two that had no solution at the release, fires at release plus its own moment.
    for (let i = 0; i < 5; i++) {
      const own = openingStagger(ships[i].id, gun(i).index);
      expect(own).toBeGreaterThanOrEqual(0); expect(own).toBeLessThan(OPENING_STAGGER_SECONDS);
      if (own > 0.06) expect(c.canFire(10.1 + own - 0.05, fleet, ships[i], gun(i), false, guns)).toBe(false);
      expect(c.canFire(10.1 + own + 0.001, fleet, ships[i], gun(i), false, guns)).toBe(true);
      // And is never held again.
      expect(c.canFire(30, fleet, ships[i], gun(i), false, guns)).toBe(true);
      expect(c.holding(30, fleet, ships[i], gun(i))).toBe(false);
    }
    // Not one switch: the five moments are five different ones.
    expect(new Set(ships.map((s, i) => openingStagger(s.id, gun(i).index).toFixed(3))).size).toBe(5);
    expect(c.released).toHaveLength(1);
  });

  it('a gun that cannot bear holds nobody: the battery opens when no more guns come to bear, and at the latest after the hold', () => {
    const { ships, gun } = battery(5), fleet = ships[0].fleetId;
    // One gun of five bears and no other ever does: released once it has stopped growing.
    const settled = new OpeningVolleyCoordinator();
    let t = 0;
    while (!settled.canFire(t, fleet, ships[0], gun(0), false, () => 5) && t < 20) t += 0.05;
    expect(settled.released[0].t).toBeCloseTo(OPENING_SETTLE_SECONDS, 1);
    expect(settled.released[0]).toMatchObject({ ready: 1, guns: 5 });
    // Guns keep coming to bear one at a time, never reaching most of a large battery: the hold is the limit.
    const slow = new OpeningVolleyCoordinator();
    let released = -1;
    for (let tick = 0; tick < 400 && released < 0; tick++) {
      const time = tick * 0.05, bearing = 1 + Math.floor(time);
      for (let i = 0; i < Math.min(5, bearing); i++) slow.canFire(time, fleet, ships[i], gun(i), false, () => 40);
      if (slow.released.length) released = time;
    }
    expect(released).toBeGreaterThan(OPENING_SETTLE_SECONDS);
    expect(released).toBeLessThanOrEqual(OPENING_HOLD_SECONDS + 0.051);
    // A fleet that has been hit does not wait.
    const struck = new OpeningVolleyCoordinator();
    struck.canFire(0, fleet, ships[0], gun(0), true, () => 40);
    let at = 0;
    while (!struck.released.length && at < 5) { at += 0.05; struck.canFire(at, fleet, ships[0], gun(0), true, () => 40); }
    expect(at).toBeLessThanOrEqual(OPENING_HOLD_UNDER_FIRE + 0.051);
    // The player's own release opens a battery at once, and asking whether a gun is held changes nothing.
    const manual = new OpeningVolleyCoordinator();
    expect(manual.holding(0, fleet, ships[0], gun(0))).toBe(false);
    manual.canFire(0, fleet, ships[0], gun(0), false, () => 40);
    manual.open(0.05, fleet, gun(0));
    for (let i = 0; i < 5; i++) expect(manual.canFire(0.05, fleet, ships[i], gun(i), false, () => 40)).toBe(true);
  });

  it('in a battle: the line fires together, before the Reaper can answer, then keeps firing as it always did', () => {
    const { sim, ships } = battery(6, 110);
    const fired = (): { t: number; shipId: string }[] => sim.events.filter((e) => e.type === 'weapon_fired' && e.weaponId === 'alliance_dn_main').map((e) => ({ t: e.t, shipId: e.type === 'weapon_fired' ? e.shipId : '' }));
    while (sim.time < 60 && !sim.finished) sim.step();
    const shots = fired(), first = shots[0].t, release = sim.openingVolleys.released[0];
    expect(release).toMatchObject({ weaponId: 'alliance_dn_main', guns: 6 });
    expect(release.ready).toBeGreaterThanOrEqual(Math.ceil(OPENING_SHARE * 6));
    // All six within the stagger of the release, each once, at more than one moment.
    const volley = shots.filter((s) => s.t <= release.t + OPENING_STAGGER_SECONDS + 0.051);
    expect(new Set(volley.map((s) => s.shipId)).size).toBe(ships.length);
    expect(volley.length).toBe(ships.length);
    expect(new Set(volley.map((s) => s.t.toFixed(2))).size).toBeGreaterThan(2);
    expect(first).toBeGreaterThanOrEqual(release.t - 1e-9);
    // Before the Reaper's beam, which has 20 km less reach.
    const beam = sim.events.find((e) => e.type === 'weapon_fired' && e.kind === 'reaper_beam' && e.weaponId === 'reaper_capital_beam');
    expect(beam === undefined || beam.t > release.t + 1).toBe(true);
    // Sustained fire: each gun fires again a reload later, without waiting on any other.
    const later = shots.filter((s) => s.t > release.t + OPENING_STAGGER_SECONDS + 0.051 && s.t < release.t + 12);
    expect(new Set(later.map((s) => s.shipId)).size).toBe(ships.length);
  });

  it('the allied line fires first in the standard battles, from beyond the beam’s reach, and canon still ends as it did', () => {
    for (const [scenario, rules, winner] of [['battle_of_earth', 'canon_me3', 'B'], ['final_battle_of_earth', 'canon_me3', 'B'], ['battle_of_earth', 'prime_apex', 'A']] as const) {
      const o = measureOpening(new BattleSimulation(buildScenario(scenario, rules, 1)), 400);
      // Measured (seed 1): the allied line opens 2.6 to 4.4 s before the first Reaper beam, from 70 to 74 km.
      expect(o.first.A!.t, scenario).toBeLessThan(o.first.B!.t - 1.5);
      expect(o.first.A!.km, scenario).toBeGreaterThan(WEAPONS.reaper_capital_beam.range + 8);
      expect(o.first.B!.km, scenario).toBeLessThanOrEqual(WEAPONS.reaper_capital_beam.range + 1.5);
      expect(o.beforeReply, scenario).toBeGreaterThanOrEqual(2);
      expect(o.winner, `${scenario} ${rules}`).toBe(winner);
    }
  });

  it('is deterministic: the same battle twice gives the same events', () => {
    const run = (): string => { const sim = new BattleSimulation(buildScenario('battle_of_earth', 'prime_apex', 9)); while (sim.time < 40) sim.step(); return JSON.stringify([sim.events.length, sim.openingVolleys.released, sim.ships.map((s) => [s.pos.x, s.pos.z, s.hull])]); };
    expect(run()).toBe(run());
    expect(BATTLESPACE_SCALE).toBe(0.4);
  });
});
