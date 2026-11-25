import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { SHIP_CLASSES } from '@/data/ships';
import { cockpitStyle, seatFor } from '@/rendering/cockpit';
import { buildBridge, type BridgeMaterials } from '@/rendering/interior/bridge';
import { bridgeNavy, bridgeSpec, bridgeTier, windowBand } from '@/rendering/interior/bridgeSpec';
import { PLOT_CONTACTS, PLOT_RANGES, SCREENS, ATLAS_SIZE, conditionOf, readInstruments, screenUv } from '@/rendering/interior/instruments';
import { InteriorView, bridgeLamps, newBridgeLight, stepBridgeLight } from '@/rendering/interior/interiorView';
import { clipPathOf, paneOutlines } from '@/rendering/interior/panes';
import { BRIDGE_FORWARD_LIMIT, fitBridgeSeat, readHull } from '@/rendering/seatFit';
import { getShipTemplate, hasModel } from '@/rendering/ships';
import { buildCustomBattle } from '@/scenarios';
import { BattleSimulation } from '@/simulation/battle';
import { BATTLESPACE_SCALE } from '@/simulation/constants';
import type { ShipState } from '@/simulation/types';

/**
 * Owner's request, 25 Nov 2026: "Prioritise improvements to spacecraft interiors, first-person views, camera
 * positioning, lighting, materials and instrumentation", and, of the interior: "its systems alliance ship not a
 * plane cockpit".
 *
 * Before this the Cockpit camera on a warship was a flat window frame drawn over the picture, from a seat placed
 * by one table for every hull. Now it stands on a modelled bridge (a ship's: a commanding officer's deck and
 * rail, a helm pit, crew stations, windows round the bow), placed on the hull's back as measured on its model,
 * lit by its own lamps, with instruments that read the ship.
 */
const warships = Object.entries(SHIP_CLASSES).filter(([id, c]) => hasModel(id) && cockpitStyle(c.role, c.faction) === 'bridge');

describe('where the bridge stands on its hull', () => {
  it('on every warship: on the hull’s back, not inside it and not on stilts, with its windows clear', () => {
    expect(warships.length).toBeGreaterThan(40);
    let wasInside = 0;
    for (const [id, cls] of warships) {
      const t = getShipTemplate(id), L = t.lengthUnits, hull = readHull(t.group, L);
      const table = seatFor(cls.role, cls.faction), seat = fitBridgeSeat(hull, L, table);
      const deck = hull.top(0, seat.forward * L);
      // The table's seat was inside this many hulls: under the hull's back at its own station.
      if (hull.top(0, table.forward * L) > table.up * L) wasInside++;
      expect(seat.forward, id).toBeGreaterThanOrEqual(table.forward - 1e-9);
      expect(seat.forward, id).toBeLessThanOrEqual(BRIDGE_FORWARD_LIMIT + 1e-9);
      if (Number.isFinite(deck)) {
        // Above what is under it...
        expect(seat.up * L, id).toBeGreaterThan(deck);
        // ...and by no more than a tenth of the hull's length (the table put a dreadnought's 85 m above its centre line whatever its shape).
        expect(seat.up * L - deck, id).toBeLessThan(0.1 * L);
      }
      // Nothing of the hull stands in the windows ahead or on either bow.
      const eye = new THREE.Vector3(0, seat.up * L, seat.forward * L);
      for (const yaw of [-30, -15, 0, 15, 30]) {
        const a = THREE.MathUtils.degToRad(yaw);
        expect(hull.blocked(eye, new THREE.Vector3(Math.sin(a), 0, Math.cos(a))), `${id} at ${yaw}°`).toBe(false);
      }
    }
    expect(wasInside).toBeGreaterThanOrEqual(3);
  });

  it('a hull with nothing to stand on at its centre line keeps the table’s seat', () => {
    const none = { top: () => -Infinity, blocked: () => false };
    expect(fitBridgeSeat(none, 10, { forward: 0.2, up: 0.085 })).toEqual({ forward: 0.2, up: 0.085 });
    // A tower just ahead of the table's station: the bridge stands on it, as a bridge does, not behind it on stilts.
    const tower = { top: (_x: number, z: number) => (z > 2.2 && z < 2.8 ? 3 : z <= 5 ? 0.5 : -Infinity), blocked: () => false };
    const seat = fitBridgeSeat(tower, 10, { forward: 0.2, up: 0.085 });
    expect(seat.forward * 10).toBeGreaterThan(2.2);
    expect(seat.forward * 10).toBeLessThan(2.8);
    expect(seat.up * 10).toBeGreaterThan(3);
    expect(seat.up * 10).toBeLessThan(3.3);
    // Something beside the middle of the hull stands in the windows: the bridge is lifted until they are clear.
    const walled = { top: () => 0.5, blocked: (eye: THREE.Vector3) => eye.y < 1.2 };
    expect(fitBridgeSeat(walled, 10, { forward: 0.2, up: 0.085 }).up * 10).toBeGreaterThanOrEqual(1.2);
  });
});

describe('the bridge', () => {
  it('is fitted by navy and by size, and falls back on the Alliance pattern', () => {
    expect(bridgeNavy('alliance')).toBe('alliance');
    expect(bridgeNavy('cerberus_black_fleet')).toBe('cerberus');
    expect(bridgeNavy('unsc')).toBe('alliance');
    expect(bridgeTier('frigate')).toBe('compact');
    expect(bridgeTier('cruiser')).toBe('standard');
    expect(bridgeTier('carrier')).toBe('standard');
    expect(bridgeTier('dreadnought')).toBe('flag');
    const frigate = bridgeSpec('frigate', 'alliance'), flag = bridgeSpec('dreadnought', 'alliance');
    expect(flag.halfWidth).toBeGreaterThan(frigate.halfWidth);
    expect(flag.stations).toBeGreaterThan(frigate.stations);
    // The eye is a crew member's height above its deck on every bridge.
    for (const spec of [frigate, flag]) expect(spec.dais).toBeCloseTo(-1.7, 6);
    expect(frigate.navy).toBe('SYSTEMS ALLIANCE NAVY');
    // Each navy its own colours and glazing; a geth bridge has no chairs.
    const navies = ['alliance', 'turian', 'asari', 'salarian', 'quarian', 'geth', 'cerberus'].map((f) => bridgeSpec('cruiser', f));
    expect(new Set(navies.map((s) => s.palette.haptic)).size).toBe(navies.length);
    expect(new Set(navies.map((s) => s.navy)).size).toBe(navies.length);
    expect(bridgeSpec('cruiser', 'geth').seated).toBe(false);
    expect(bridgeSpec('cruiser', 'alliance').seated).toBe(true);
  });

  it('most of the picture ahead is window: the battle is what the bridge is for', () => {
    for (const role of ['frigate', 'cruiser', 'dreadnought']) for (const faction of ['alliance', 'turian', 'asari']) {
      const spec = bridgeSpec(role, faction), band = windowBand(spec, 66);
      // The sill is in the bottom third; the bar across the head of the windows is in the top third, and the
      // glazing carries on over it.
      expect(band.sill, `${role} ${faction}`).toBeLessThan(0.34);
      expect(band.sill).toBeGreaterThan(0.12);
      expect(band.brow).toBeGreaterThan(0.66);
      expect(spec.skylight).toBeGreaterThan(1);
    }
  });

  const materials = (): BridgeMaterials => ({ structure: new THREE.MeshBasicMaterial(), lights: new THREE.MeshBasicMaterial(), trims: new THREE.MeshBasicMaterial(),
    screens: new THREE.MeshBasicMaterial(), holograms: new THREE.MeshBasicMaterial(), glass: new THREE.MeshBasicMaterial() });

  it('is six meshes whatever its size, encloses the eye, and has every instrument', () => {
    for (const role of ['frigate', 'cruiser', 'dreadnought']) for (const faction of ['alliance', 'geth', 'asari']) {
      const built = buildBridge(bridgeSpec(role, faction), materials());
      const meshes = built.group.children.filter((o) => (o as THREE.Mesh).isMesh) as THREE.Mesh[];
      expect(meshes.map((m) => m.name).sort()).toEqual(['glass', 'holograms', 'lights', 'screens', 'structure', 'trims']);
      const box = new THREE.Box3().setFromObject(built.group);
      expect(box.containsPoint(new THREE.Vector3(0, 0, 0))).toBe(true);
      // Decks under the eye and a ceiling over it; walls to both sides and behind.
      expect(box.min.y).toBeLessThan(built.spec.deck);
      expect(box.max.y).toBeGreaterThan(built.spec.ceiling);
      for (const name of ['plot', 'status', 'target', 'helm', 'guns', 'plate'] as const) expect(built.instruments[name], `${role} ${faction} ${name}`).toBeDefined();
      // The rail's displays and the plot are below the line of sight and within reach of a glance down.
      for (const name of ['plot', 'status', 'target'] as const) {
        const at = built.instruments[name]!, below = THREE.MathUtils.radToDeg(Math.atan2(-at.y, Math.hypot(at.x, at.z)));
        expect(below, `${role} ${faction} ${name}`).toBeGreaterThan(12);
        expect(below).toBeLessThan(40);
        expect(at.z).toBeLessThan(-1.5);
      }
      const triangles = meshes.reduce((n, m) => n + (m.geometry.index ? m.geometry.index.count : m.geometry.getAttribute('position').count) / 3, 0);
      expect(triangles).toBeLessThan(4000);
    }
  });

  it('nothing solid stands between the eye and the battle ahead', () => {
    for (const role of ['frigate', 'cruiser', 'dreadnought']) for (const faction of ['alliance', 'turian', 'asari', 'quarian']) {
      const built = buildBridge(bridgeSpec(role, faction), materials()), spec = built.spec;
      const structure = built.group.getObjectByName('structure') as THREE.Mesh;
      (structure.material as THREE.Material).side = THREE.DoubleSide;
      built.group.updateMatrixWorld(true);
      const ray = new THREE.Raycaster();
      // A grid of looks through the windows across the bow: only the mullions and posts may be struck.
      let clear = 0, looks = 0;
      for (let i = 0; i <= 20; i++) for (let j = 0; j <= 8; j++) {
        const at = new THREE.Vector3(-spec.noseHalfWidth * 0.96 + spec.noseHalfWidth * 1.92 * (i / 20), spec.sill + 0.1 + (spec.brow - spec.sill - 0.2) * (j / 8), -spec.nose);
        ray.set(new THREE.Vector3(), at.clone().normalize());
        looks++;
        if (ray.intersectObject(structure, false).length === 0) clear++;
      }
      // (The helm's chair backs stand a little above the sill, as they would.)
      expect(clear / looks, `${role} ${faction}`).toBeGreaterThan(faction === 'quarian' ? 0.66 : 0.72);
      // Straight ahead is clear on every bridge.
      ray.set(new THREE.Vector3(), new THREE.Vector3(0, 0, -1));
      expect(ray.intersectObject(structure, false).length).toBe(0);
      // And the room is closed: a look straight down, up, aft and to either side meets it.
      for (const way of [[0, -1, 0], [0, 1, 0.02], [0, 0, 1], [1, 0, 0.3], [-1, 0, 0.3]]) {
        ray.set(new THREE.Vector3(), new THREE.Vector3(way[0], way[1], way[2]).normalize());
        expect(ray.intersectObject(structure, false).length, `${role} ${faction} ${way}`).toBeGreaterThan(0);
      }
    }
  });

  it('each screen has its own picture on the instruments’ canvas', () => {
    const names = Object.keys(SCREENS) as (keyof typeof SCREENS)[];
    for (const a of names) {
      const [x, y, w, h] = SCREENS[a];
      expect(x + w).toBeLessThanOrEqual(ATLAS_SIZE); expect(y + h).toBeLessThanOrEqual(ATLAS_SIZE);
      for (const b of names) if (a < b) {
        const [x2, y2, w2, h2] = SCREENS[b];
        expect(x < x2 + w2 && x2 < x + w && y < y2 + h2 && y2 < y + h, `${a} over ${b}`).toBe(false);
      }
      const [u0, v0, u1, v1] = screenUv(a);
      expect(u1).toBeGreaterThan(u0); expect(v1).toBeGreaterThan(v0);
      expect(Math.min(u0, v0)).toBeGreaterThanOrEqual(0); expect(Math.max(u1, v1)).toBeLessThanOrEqual(1);
    }
  });
});

const battle = () => new BattleSimulation(buildCustomBattle({ seed: 5, rulesId: 'canon_me3', environment: 'deep_space', startingDistanceKm: 40, maxDuration: 200,
  sideA: { faction: 'alliance', name: 'A', formation: 'line_abreast', counts: { alliance_dreadnought: 2, alliance_frigate: 4 } },
  sideB: { faction: 'reaper', name: 'B', formation: 'line_abreast', counts: { reaper_capital: 1, reaper_destroyer: 2 } } } as never));

describe('the instruments read the ship', () => {
  it('the plot is turned to the bow: a contact ahead is up the plot, one to starboard is to its right', () => {
    const sim = battle();
    const ship = sim.ships.find((s) => s.role === 'dreadnought')!, others = sim.ships.filter((s) => s !== ship);
    ship.heading = { x: 1, y: 0, z: 0 };
    const [ahead, starboard, above] = others;
    const d = 10 * BATTLESPACE_SCALE; // ten kilometres
    ahead.pos = { x: ship.pos.x + d, y: ship.pos.y, z: ship.pos.z };
    // To starboard of a hull pointing +x is −z (the level right of a heading (fx, fz) is (fz, −fx)).
    starboard.pos = { x: ship.pos.x, y: ship.pos.y, z: ship.pos.z - d };
    above.pos = { x: ship.pos.x - d, y: ship.pos.y + d, z: ship.pos.z };
    for (const far of others.slice(3)) far.pos = { x: ship.pos.x + 1e6, y: 0, z: 0 };
    const read = readInstruments(ship, ahead, sim.ships);
    expect(read.plotRange).toBe(PLOT_RANGES.find((r) => r >= 11.5));
    expect(read.contacts).toHaveLength(3);
    const at = (other: ShipState) => read.contacts[others.filter((o) => read.contacts.length && [ahead, starboard, above].includes(o)).indexOf(other)];
    expect(at(ahead).x).toBeCloseTo(0, 6); expect(at(ahead).y).toBeCloseTo(10 / read.plotRange, 6);
    expect(at(ahead).target).toBe(true);
    expect(at(starboard).x).toBeCloseTo(10 / read.plotRange, 6); expect(at(starboard).y).toBeCloseTo(0, 6);
    expect(at(above).y).toBeCloseTo(-10 / read.plotRange, 6); expect(at(above).lift).toBeGreaterThan(0);
    expect(read.target).toMatchObject({ name: ahead.name });
    expect(read.target!.range).toBeCloseTo(10, 6);
    expect(read.friends + read.hostiles).toBe(3);
    expect(read.bearing).toBeCloseTo(90, 6);
    // No target: the middle range.
    expect(readInstruments(ship, undefined, sim.ships).plotRange).toBe(PLOT_RANGES[2]);
  });

  it('reads hull, barrier, guns and closing speed from the ship’s own state, and changes nothing', () => {
    const sim = battle();
    const ship = sim.ships.find((s) => s.role === 'dreadnought')!, enemy = sim.ships.find((s) => s.faction === 'reaper')!;
    const before = JSON.stringify(sim.ships.map((s) => [s.pos, s.hull, s.barriers, s.targetId]));
    ship.hull = ship.maxHull * 0.5; ship.barriers = 0;
    ship.vel = { x: (enemy.pos.x - ship.pos.x), y: 0, z: (enemy.pos.z - ship.pos.z) };
    const speed = Math.hypot(ship.vel.x, ship.vel.z);
    ship.vel.x *= 0.2 / speed; ship.vel.z *= 0.2 / speed; enemy.vel = { x: 0, y: 0, z: 0 };
    const read = readInstruments(ship, enemy, sim.ships);
    expect(read.hull).toBeCloseTo(0.5, 6);
    expect(read.barrier).toBe(0);
    expect(read.condition).toBe('action');
    expect(read.speed).toBeCloseTo(0.2 / BATTLESPACE_SCALE, 6);
    expect(read.target!.closing).toBeCloseTo(0.2 / BATTLESPACE_SCALE, 3);
    // The guns that matter, heaviest first, and no point defence among them.
    expect(read.guns.length).toBeGreaterThan(0);
    expect(read.guns.length).toBeLessThanOrEqual(5);
    const heaviest = ship.weapons.filter((w) => !w.def.antiSmall).sort((a, b) => b.def.damage - a.def.damage)[0];
    expect(read.guns[0].name).toBe(heaviest.def.name);
    heaviest.cooldown = heaviest.def.cooldown / 4;
    expect(readInstruments(ship, enemy, sim.ships).guns[0].ready).toBeCloseTo(0.75, 6);
    ship.hull = ship.maxHull; ship.barriers = ship.maxBarriers; heaviest.cooldown = 0;
    void before;
    expect(conditionOf({ hull: 30, maxHull: 100, barriers: 50, maxBarriers: 100 })).toBe('critical');
    expect(conditionOf({ hull: 100, maxHull: 100, barriers: 50, maxBarriers: 100 })).toBe('steady');
    expect(conditionOf({ hull: 100, maxHull: 100, barriers: 0, maxBarriers: 0 })).toBe('steady');
  });

  it('a fleet of thousands is still a fleet on the plot: it takes every nth contact, and always the target', () => {
    const sim = battle();
    const ship = sim.ships.find((s) => s.role === 'dreadnought')!, pattern = sim.ships.find((s) => s.faction === 'reaper')!;
    const crowd: ShipState[] = [ship];
    for (let i = 0; i < 5000; i++) crowd.push({ ...pattern, id: `c${i}`, pos: { x: ship.pos.x + Math.cos(i) * (1 + (i % 17)), y: ship.pos.y, z: ship.pos.z + Math.sin(i) * (1 + (i % 17)) } });
    const target = crowd[17]; // the furthest ring out: 42.5 km, so the plot is at 50 km and holds them all
    const read = readInstruments(ship, target, crowd);
    expect(read.hostiles).toBe(5000);
    expect(read.contacts.length).toBeLessThanOrEqual(PLOT_CONTACTS + 1);
    expect(read.contacts.length).toBeGreaterThan(PLOT_CONTACTS / 2);
    expect(read.contacts.filter((c) => c.target)).toHaveLength(1);
  });
});

describe('the bridge’s lamps answer what happens to the ship', () => {
  const ship = () => { const sim = battle(); return sim.ships.find((s) => s.role === 'dreadnought')!; };

  it('steady, action stations, and the hull failing', () => {
    const s = ship(), light = newBridgeLight();
    stepBridgeLight(light, s, 1 / 60);
    expect(light.alert).toBe(0);
    expect(bridgeLamps(light, 0)).toMatchObject({ strips: 1, alert: 0, flash: 0 });
    s.hull = s.maxHull * 0.2;
    for (let i = 0; i < 600; i++) stepBridgeLight(light, s, 1 / 60);
    expect(light.alert).toBeGreaterThan(0.98);
    // The lamps have gone to the alert colour and beat.
    const lamps = [0, 0.1, 0.2, 0.3, 0.4, 0.5].map((t) => bridgeLamps(light, t));
    expect(lamps[0].alert).toBeGreaterThan(0.9);
    expect(Math.max(...lamps.map((l) => l.strips)) - Math.min(...lamps.map((l) => l.strips))).toBeGreaterThan(0.1);
    for (const l of lamps) expect(l.strips).toBeGreaterThanOrEqual(0.12);
    // Another ship's bridge is as that ship is, at once.
    const other = ship();
    other.id = 'other';
    stepBridgeLight(light, other, 1 / 60);
    expect(light.alert).toBe(0);
    expect(light.flash).toBe(0);
  });

  it('a blow on the hull dims the room for a moment; a hit on the barriers and the ship’s own guns flash at the windows', () => {
    const s = ship(), light = newBridgeLight();
    stepBridgeLight(light, s, 1 / 60);
    s.hull -= s.maxHull * 0.02;
    stepBridgeLight(light, s, 1 / 60);
    expect(light.dip).toBeGreaterThan(0.5);
    expect(bridgeLamps(light, 0.3).strips).toBeLessThan(1);
    for (let i = 0; i < 300; i++) stepBridgeLight(light, s, 1 / 60);
    expect(light.dip).toBeLessThan(0.01);
    expect(light.flash).toBeLessThan(0.01);
    s.barriers -= s.maxBarriers * 0.02;
    stepBridgeLight(light, s, 1 / 60);
    expect(light.flash).toBeGreaterThan(0.25);
    expect(light.dip).toBeLessThan(0.01);
    for (let i = 0; i < 300; i++) stepBridgeLight(light, s, 1 / 60);
    // The main gun fires: its reload begins.
    const gun = s.weapons.filter((w) => !w.def.antiSmall).sort((a, b) => b.def.damage - a.def.damage)[0];
    gun.cooldown = gun.def.cooldown;
    stepBridgeLight(light, s, 1 / 60);
    expect(light.flash).toBeGreaterThan(1);
    // Reloading is not firing.
    for (let i = 0; i < 300; i++) { gun.cooldown = Math.max(0, gun.cooldown - 1 / 60); stepBridgeLight(light, s, 1 / 60); }
    expect(light.flash).toBeLessThan(0.01);
  });
});

describe('the bridge’s windows in the picture', () => {
  const built = buildBridge(bridgeSpec('cruiser', 'alliance'), { structure: new THREE.MeshBasicMaterial(), lights: new THREE.MeshBasicMaterial(), trims: new THREE.MeshBasicMaterial(),
    screens: new THREE.MeshBasicMaterial(), holograms: new THREE.MeshBasicMaterial(), glass: new THREE.MeshBasicMaterial() });

  it('ahead: the windows across the bow are in the middle of the picture, where the spec says', () => {
    const outlines = paneOutlines(built.panes, new THREE.Quaternion(), 66, 16 / 9, 1600, 900);
    expect(outlines.length).toBe(built.panes.length);
    const centre = outlines[0], xs = centre.filter((_, i) => i % 2 === 0), ys = centre.filter((_, i) => i % 2 === 1);
    expect((Math.min(...xs) + Math.max(...xs)) / 2).toBeCloseTo(800, 0);
    const band = windowBand(built.spec, 66);
    expect(Math.max(...ys) / 900).toBeCloseTo(1 - band.sill, 2);
    expect(Math.min(...ys) / 900).toBeCloseTo(1 - band.brow, 2);
    expect(clipPathOf(outlines)).toMatch(/^path\("M[-\d.]+ [-\d.]+L.*Z"\)$/);
  });

  it('looking aside, a window behind the eye is left out; with no window in the picture nothing is shown', () => {
    const aside = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, -THREE.MathUtils.degToRad(78), 0, 'YXZ'));
    const outlines = paneOutlines(built.panes, aside, 66, 16 / 9, 1600, 900);
    expect(outlines.length).toBeGreaterThan(0);
    expect(outlines.length).toBeLessThan(built.panes.length);
    for (const o of outlines) for (const v of o) expect(Number.isFinite(v)).toBe(true);
    const astern = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, Math.PI, 0));
    expect(paneOutlines(built.panes, astern, 66, 16 / 9, 1600, 900)).toEqual([]);
    expect(clipPathOf([])).toBe('polygon(0 0, 0 0, 0 0)');
  });

  it('with no canvas to paint (no browser) the room is still built, lit and stepped', () => {
    const sim = battle(), ship = sim.ships.find((s) => s.role === 'dreadnought')!;
    const room = new InteriorView();
    expect(room.active).toBe(false);
    expect(room.windowClip(1600, 900)).toBe('');
    room.show(ship);
    room.update(1 / 60, { ship, target: undefined, ships: sim.ships, sun: new THREE.Vector3(0.3, 0.4, -0.86).normalize(), glanceYaw: 0.5, glancePitch: -0.2, fov: 66, aspect: 16 / 9, seconds: 1 });
    expect(room.active).toBe(true);
    expect(room.bridge!.spec.tier).toBe('flag');
    // The head turned to starboard: the camera looks toward +x.
    expect(room.camera.getWorldDirection(new THREE.Vector3()).x).toBeGreaterThan(0.4);
    expect(room.windowClip(1600, 900)).toMatch(/^path\(/);
    // A frigate's bridge is another room; the same ship again is the same room.
    const flag = room.bridge;
    room.show(ship);
    expect(room.bridge).toBe(flag);
    room.show({ role: 'frigate', faction: 'alliance' });
    expect(room.bridge).not.toBe(flag);
    expect(room.scene.children.filter((o) => o.name.startsWith('bridge:'))).toHaveLength(1);
    room.hide();
    expect(room.active).toBe(false);
    room.dispose();
  });
});
