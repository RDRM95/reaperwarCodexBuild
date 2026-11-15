import { describe, expect, it } from 'vitest';
import { SHIP_CLASSES } from '@/data/ships';
import { WEAPONS } from '@/data/weapons';
import { buildCustomBattle } from '@/scenarios';
import { chooseTarget } from '@/simulation/ai';
import { BattleSimulation } from '@/simulation/battle';
import { carriesCapitalRounds, isMagazineMainGun, keptForCapitals, weaponTarget } from '@/simulation/fireControl';
import type { ShipState, WeaponState } from '@/simulation/types';
import { HadesVolleyCoordinator, isHadesSpinal } from '@/simulation/volleys';
import { HFY_TERRAN_ASCENDANCY, PRIME_APEX } from '@/timelines/presets';
import { applyRulesToWeapon } from '@/timelines/rules';

/**
 * Capital-killing rounds go to capital ships. Owner's report: "destroyers seem OP? ... the destroyers seem like a
 * distraction, you gotta wait for them all to die to see the capitals die".
 *
 * Measured before this change (100 Sovereigns and 300 destroyers against 416 allied hulls with six Valkyries and
 * ten Aegis command dreadnoughts, seed 45):
 *   - Annihilation: the Valkyries fired twelve NOVA rounds, nine of them at destroyers; the Aegis guns 27 rounds,
 *     25 at destroyers. Two Sovereigns were destroyed, the first at 81 s.
 *   - Prime/Apex: neither gun fired at all. The hyper-mass accelerator refit had replaced both with the fleet's
 *     ordinary accelerator. Eleven Sovereigns were destroyed, the first at 120 s.
 * After it: every one of those rounds is fired at a Sovereign; Annihilation eight Sovereigns destroyed, the first
 * at 49 s; Prime/Apex 35 destroyed, the first at 46 s. The Reapers win all four battles, before and after.
 */
const battle = (a: Record<string, number>, b: Record<string, number>, rulesId = 'reaper_hardcore', seed = 5, startingDistanceKm = 60, faction = 'alliance') =>
  new BattleSimulation(buildCustomBattle({ seed, rulesId, environment: 'deep_space', startingDistanceKm, maxDuration: 400,
    sideA: { faction, name: 'A', formation: 'line_abreast', counts: a },
    sideB: { faction: 'reaper', name: 'B', formation: 'line_abreast', counts: b } } as never));
const place = (ship: ShipState, x: number, y: number, z: number) => { ship.pos = { x, y, z }; ship.prevPos = { x, y, z }; ship.vel = { x: 0, y: 0, z: 0 }; };
const mainGun = (ship: ShipState): WeaponState => ship.weapons.find(w => w.def.kind === 'mass_accelerator' && w.def.antiCapital && w.def.arc <= 20)!;
const byRole = (sim: BattleSimulation, role: string) => sim.ships.find(s => s.role === role)!;

describe('the hyper-mass accelerator refit', () => {
  it.each([PRIME_APEX, HFY_TERRAN_ASCENDANCY])('under $id replaces canon spinal guns and leaves every AU-designed one in place', rules => {
    const kept: string[] = [], replaced: string[] = [];
    for (const cls of Object.values(SHIP_CLASSES)) {
      if (cls.role !== 'dreadnought') continue;
      for (const hardpoint of cls.hardpoints) {
        const weapon = WEAPONS[hardpoint.weaponId];
        if (weapon.kind !== 'mass_accelerator' || !weapon.antiCapital || weapon.arc > 20) continue;
        const mounted = applyRulesToWeapon(weapon, cls.faction, cls, rules, WEAPONS);
        if (weapon.provenance.provenance === 'AU_MODIFIED') { expect(mounted.id).toBe(weapon.id); kept.push(weapon.id); }
        else if (mounted.id !== weapon.id) { expect(mounted.id).toBe('apex_hyper_ma'); replaced.push(weapon.id); }
      }
    }
    // The two that were exempt by name, and the two that were not and lost their guns.
    expect(kept).toEqual(expect.arrayContaining(['omaha_spinal', 'cerberus_hades_spinal', 'valkyrie_nova', 'aegis_nova_command']));
    expect(replaced).toEqual(expect.arrayContaining(['alliance_dn_main', 'turian_dn_main', 'asari_dn_main']));
  });

  it('the Valkyrie goes into a Prime/Apex battle with her NOVA Array, and the Aegis with its command gun', () => {
    const sim = battle({ alliance_valkyrie: 1, alliance_aegis_command: 1, alliance_dreadnought: 1 }, { reaper_capital: 1 }, 'prime_apex');
    const gunOf = (classId: string) => mainGun(sim.ships.find(s => s.classId === classId)!).def;
    expect(gunOf('alliance_valkyrie').id).toBe('valkyrie_nova');
    expect(gunOf('alliance_valkyrie').range).toBeGreaterThan(gunOf('alliance_dreadnought').range);
    expect(gunOf('alliance_aegis_command').id).toBe('aegis_nova_command');
    expect(gunOf('alliance_dreadnought').id).toBe('apex_hyper_ma');
  });
});

describe('rounds kept for capital ships', () => {
  const setup = (b: Record<string, number> = { reaper_capital: 1, reaper_destroyer: 1 }, a: Record<string, number> = { alliance_valkyrie: 1 }) => {
    const sim = battle(a, b);
    const ship = sim.ships.find(s => s.side === 'A' && s.role !== 'fighter')!, fleet = sim.fleets.get(ship.fleetId)!;
    const destroyer = byRole(sim, 'reaper_destroyer'), capital = sim.ships.find(s => s.role === 'reaper_capital');
    return { sim, ship, fleet, gun: mainGun(ship), destroyer, capital };
  };

  it('only a magazine of capital-killing rounds is kept: the NOVA Array, the Aegis gun and the Cerberus HADES gun', () => {
    const sim = battle({ alliance_valkyrie: 1, alliance_aegis_command: 1, alliance_omaha: 1, alliance_dreadnought: 1, alliance_frigate: 1 }, { reaper_capital: 1 });
    const kept = (classId: string) => { const s = sim.ships.find(x => x.classId === classId)!; return [carriesCapitalRounds(s), s.weapons.filter(isMagazineMainGun).map(w => w.def.id)] as const; };
    expect(kept('alliance_valkyrie')).toEqual([true, ['valkyrie_nova']]);
    expect(kept('alliance_aegis_command')).toEqual([true, ['aegis_nova_command']]);
    expect(kept('alliance_omaha')).toEqual([false, []]);
    expect(kept('alliance_dreadnought')).toEqual([false, []]);
    // A frigate's torpedoes have a magazine too, and are not a main gun.
    expect(kept('alliance_frigate')).toEqual([false, []]);
    const cerberus = battle({ cerberus_omaha: 1 }, { reaper_capital: 1 }, 'reaper_hardcore', 5, 60, 'cerberus').ships.find(s => s.classId === 'cerberus_omaha')!;
    expect(cerberus.weapons.filter(isMagazineMainGun).map(w => w.def.id)).toEqual(['cerberus_hades_spinal']);
  });

  it('a round is kept from an escort it would overkill, while the enemy has a capital ship on the field', () => {
    const { ship, fleet, gun, destroyer, capital } = setup();
    expect(gun.def.damage).toBeGreaterThan(destroyer.maxHull + destroyer.maxBarriers);
    expect(keptForCapitals(ship, fleet, gun, destroyer, true)).toBe(true);
    // Never from a capital ship, and from nothing once the enemy has no capital ship left.
    expect(keptForCapitals(ship, fleet, gun, capital!, true)).toBe(false);
    expect(keptForCapitals(ship, fleet, gun, destroyer, false)).toBe(false);
    // Nor from a target the round does not overkill: the Cerberus HADES round against a destroyer.
    const c = battle({ cerberus_omaha: 1 }, { reaper_capital: 1, reaper_destroyer: 1 }, 'reaper_hardcore', 5, 60, 'cerberus');
    const omaha = c.ships.find(s => s.classId === 'cerberus_omaha')!, hades = mainGun(omaha), prey = byRole(c, 'reaper_destroyer');
    expect(hades.def.damage).toBeLessThan(prey.maxHull + prey.maxBarriers);
    expect(keptForCapitals(omaha, c.fleets.get(omaha.fleetId)!, hades, prey, true)).toBe(false);
    // An ordinary dreadnought's gun is never kept.
    const d = battle({ alliance_dreadnought: 1 }, { reaper_capital: 1, reaper_destroyer: 1 });
    const dn = byRole(d, 'dreadnought');
    expect(keptForCapitals(dn, d.fleets.get(dn.fleetId)!, mainGun(dn), byRole(d, 'reaper_destroyer'), true)).toBe(false);
  });

  it('a target the player has named is fired on', () => {
    const { sim, ship, fleet, gun, destroyer } = setup();
    ship.forcedTargetId = destroyer.id;
    expect(keptForCapitals(ship, fleet, gun, destroyer, true)).toBe(false);
    ship.forcedTargetId = undefined;
    sim.issueOrders(fleet.spec.id, { order: 'attack_target', targetId: destroyer.id });
    expect(keptForCapitals(ship, fleet, gun, destroyer, true)).toBe(false);
    sim.issueOrders(fleet.spec.id, { order: 'advance', targetId: undefined });
    expect(keptForCapitals(ship, fleet, gun, destroyer, true)).toBe(true);
    for (const priority of ['reaper_destroyers', 'escorts'] as const) {
      sim.issueOrders(fleet.spec.id, { priority });
      expect(keptForCapitals(ship, fleet, gun, destroyer, true)).toBe(false);
    }
    for (const priority of ['default', 'capitals', 'reaper_capitals', 'fighters'] as const) {
      sim.issueOrders(fleet.spec.id, { priority });
      expect(keptForCapitals(ship, fleet, gun, destroyer, true)).toBe(true);
    }
  });

  it('the gun has no solution on a destroyer dead ahead while a Sovereign is on the field, and has one when none is', () => {
    const solve = (b: Record<string, number>) => {
      const { sim, ship, fleet, gun, destroyer, capital } = setup(b);
      place(ship, 0, 0, 0); ship.heading = { x: 0, y: 0, z: 1 };
      place(destroyer, 0, 0, gun.def.range * 0.5);
      if (capital) place(capital, gun.def.range * 3, 0, 0);
      ship.targetId = destroyer.id;
      const enemies = sim.ships.filter(s => s.side === 'B');
      const onField = () => enemies.some(s => s.role === 'reaper_capital' && s.alive);
      return { ship, fleet, gun, destroyer, capital, enemies, solution: weaponTarget(ship, fleet, gun, id => sim.ships.find(s => s.id === id), enemies, undefined, onField) };
    };
    expect(solve({ reaper_capital: 1, reaper_destroyer: 1 }).solution).toBeUndefined();
    const alone = solve({ reaper_destroyer: 1 });
    expect(alone.solution).toBe(alone.destroyer);
    // With a Sovereign in the arc too, the round goes to it though the ship's own target is the destroyer.
    const both = solve({ reaper_capital: 1, reaper_destroyer: 1 });
    place(both.capital!, 0, 0, both.gun.def.range * 0.8);
    const getShip = (id: string) => both.enemies.find(s => s.id === id);
    expect(weaponTarget(both.ship, both.fleet, both.gun, getShip, both.enemies, undefined, () => true)).toBe(both.capital);
  });
});

describe('a ship with capital-killing rounds hunts capital ships', () => {
  const setup = (a: Record<string, number> = { alliance_valkyrie: 1 }) => {
    const sim = battle(a, { reaper_capital: 2, reaper_destroyer: 1 });
    const ship = sim.ships.find(s => s.side === 'A' && s.role !== 'fighter')!, fleet = sim.fleets.get(ship.fleetId)!;
    const [near, far] = sim.ships.filter(s => s.role === 'reaper_capital'), destroyer = byRole(sim, 'reaper_destroyer');
    const range = mainGun(ship).def.range;
    place(ship, 0, 0, 0); place(destroyer, 0, 0, range * 0.5); place(near, 0, 0, range * 2.5); place(far, 0, 0, range * 4);
    return { sim, ship, fleet, near, far, destroyer, range };
  };

  it('it takes a Sovereign beyond its guns over a destroyer inside them, and the nearer Sovereign of two', () => {
    const { sim, ship, fleet, near, destroyer } = setup();
    expect(chooseTarget(sim, ship, fleet)).toBe(near.id);
    // Even from a destroyer it has locked onto.
    ship.targetId = destroyer.id; ship.targetLockUntil = sim.time + 5;
    expect(chooseTarget(sim, ship, fleet)).toBe(near.id);
  });

  it('an ordinary dreadnought still fights what is in reach', () => {
    const { sim, ship, fleet, destroyer } = setup({ alliance_dreadnought: 1 });
    expect(chooseTarget(sim, ship, fleet)).toBe(destroyer.id);
  });

  it('with its magazine empty, or under a priority that names escorts, it fights what is in reach', () => {
    const spent = setup();
    for (const w of spent.ship.weapons) if (isMagazineMainGun(w)) w.ammo = 0;
    expect(chooseTarget(spent.sim, spent.ship, spent.fleet)).toBe(spent.destroyer.id);
    const ordered = setup();
    ordered.sim.issueOrders(ordered.fleet.spec.id, { priority: 'reaper_destroyers' });
    expect(chooseTarget(ordered.sim, ordered.ship, ordered.fleet)).toBe(ordered.destroyer.id);
  });

  it('a commanded target comes first, and with no capital ship on the field it fights the destroyer', () => {
    const { sim, ship, fleet, near, far, destroyer } = setup();
    sim.issueOrders(fleet.spec.id, { order: 'attack_target', targetId: destroyer.id });
    expect(chooseTarget(sim, ship, fleet)).toBe(destroyer.id);
    sim.issueOrders(fleet.spec.id, { order: 'advance', targetId: undefined });
    near.alive = false; far.alive = false;
    expect(chooseTarget(sim, ship, fleet)).toBe(destroyer.id);
  });
});

describe('in battle', () => {
  const roundsFired = (sim: BattleSimulation, seconds: number) => {
    const at = { capitals: 0, escorts: 0 };
    while (!sim.finished && sim.time < seconds) sim.step();
    for (const e of sim.events) {
      if (e.type !== 'weapon_fired' || (e.weaponId !== 'valkyrie_nova' && e.weaponId !== 'aegis_nova_command')) continue;
      if (sim.ships.find(s => s.id === e.targetId)?.role === 'reaper_capital') at.capitals++; else at.escorts++;
    }
    return at;
  };

  it.each(['reaper_hardcore', 'prime_apex'])('under %s no NOVA or Aegis round is fired at a destroyer while a Sovereign is on the field', rulesId => {
    const sim = battle({ alliance_valkyrie: 2, alliance_aegis_command: 4, alliance_cruiser: 20, alliance_frigate: 40 }, { reaper_capital: 20, reaper_destroyer: 60 }, rulesId, 45, 120);
    const at = roundsFired(sim, 150);
    expect(sim.ships.some(s => s.role === 'reaper_capital' && s.alive)).toBe(true);
    expect(at.escorts).toBe(0);
    expect(at.capitals).toBeGreaterThanOrEqual(4);
  });

  it('against destroyers alone the rounds are fired at destroyers', () => {
    const sim = battle({ alliance_valkyrie: 1, alliance_aegis_command: 2, alliance_cruiser: 6 }, { reaper_destroyer: 6 }, 'reaper_hardcore', 45, 60);
    const at = roundsFired(sim, 120);
    expect(at.capitals).toBe(0);
    expect(at.escorts).toBeGreaterThanOrEqual(2);
  });
});

describe('salvo timing', () => {
  const guns = () => {
    const sim = battle({ alliance_dreadnought: 1, alliance_omaha: 1, alliance_valkyrie: 1 }, { reaper_capital: 1 }, 'prime_apex');
    const of = (classId: string) => { const ship = sim.ships.find(s => s.classId === classId)!; return { ship, gun: mainGun(ship) }; };
    return { fleetId: of('alliance_dreadnought').ship.fleetId, line: of('alliance_dreadnought'), omaha: of('alliance_omaha'), valkyrie: of('alliance_valkyrie') };
  };

  it('each kind of gun keeps its own cycle: an Omaha in the fleet does not slow the hyper-mass accelerators', () => {
    const { fleetId, line, omaha } = guns();
    expect(isHadesSpinal(line.ship, line.gun) && isHadesSpinal(omaha.ship, omaha.gun)).toBe(true);
    expect(omaha.gun.def.cooldown).toBeGreaterThan(line.gun.def.cooldown * 1.5);
    const c = new HadesVolleyCoordinator();
    // The Omaha asks first. One clock for the fleet would have had its period.
    expect(c.canFire(0, fleetId, omaha.ship, omaha.gun)).toBe(false);
    expect(c.canFire(0, fleetId, line.ship, line.gun)).toBe(false);
    expect(c.canFire(0.6, fleetId, line.ship, line.gun)).toBe(true);
    const next = 0.6 + line.gun.def.cooldown * 1.05 + 0.5;
    expect(c.canFire(next, fleetId, line.ship, line.gun)).toBe(true);
    // The Omaha's own next window is one of its own cycles on, not one of theirs.
    expect(c.canFire(next, fleetId, omaha.ship, omaha.gun)).toBe(false);
    expect(c.canFire(0.6 + omaha.gun.def.cooldown * 1.05 + 0.5, fleetId, omaha.ship, omaha.gun)).toBe(true);
  });

  it('a gun with a magazine of capital-killing rounds fires when it bears, without waiting for a salvo', () => {
    const { fleetId, valkyrie } = guns();
    expect(valkyrie.gun.def.id).toBe('valkyrie_nova');
    expect(isHadesSpinal(valkyrie.ship, valkyrie.gun)).toBe(false);
    const c = new HadesVolleyCoordinator();
    for (const t of [0, 0.3, 7, 20]) expect(c.canFire(t, fleetId, valkyrie.ship, valkyrie.gun)).toBe(true);
    expect(c.secondsUntilRelease(5, fleetId, valkyrie.ship, valkyrie.gun)).toBe(0);
  });
});
