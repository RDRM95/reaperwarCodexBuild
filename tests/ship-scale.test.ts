import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { SHIP_CLASSES, SHIP_CLASS_LIST } from '@/data/ships';
import { LENGTH_TOLERANCE, fitToLength, getShipTemplate, hasModel } from '@/rendering/ships';
import { buildDestinyAscension } from '@/rendering/ships/asari';
import { buildTurianDreadnought } from '@/rendering/ships/turian';

/**
 * Size and scale. Owner's request, 16 Nov 2026: "check size and scale of ships for canon accuracy".
 *
 * What the audit found (before this change, every class with a model measured):
 *   - catalogue lengths agree with canon wherever canon states one, except the Marathon-class cruiser (1,170 m
 *     here; Halo sources give 1,192 m);
 *   - twelve hulls were drawn 3 to 7 % longer than their catalogue length (the turian cruiser 599 m for 560, the
 *     Cerberus dreadnought 962 m for 900) and the Destiny Ascension 14 % shorter (1,372 m for 1,600);
 *   - fighters are drawn at twice their catalogue length. That is left as it is and pinned here so it is on record.
 */
const drawnLength = (classId: string) => { const t = getShipTemplate(classId); return { units: new THREE.Box3().setFromObject(t.group).getSize(new THREE.Vector3()).z, stated: t.lengthUnits }; };
const modelled = SHIP_CLASS_LIST.filter(c => hasModel(c.id));

describe('every model is the length it states', () => {
  it.each(modelled.map(c => [c.id] as const))('%s', id => {
    const { units, stated } = drawnLength(id);
    // A piloted fighter's exhaust discs stand proud of its nozzles; its own tests hold it to within four parts in a hundred.
    const tolerance = SHIP_CLASSES[id].role === 'fighter' && id !== 'reaper_oculus' ? 0.04 : LENGTH_TOLERANCE;
    expect(Math.abs(units - stated) / stated).toBeLessThanOrEqual(tolerance + 1e-9);
  });

  it('and the length it states is its catalogue length: once for a hull, twice for a fighter', () => {
    for (const cls of modelled) {
      const stated = getShipTemplate(cls.id).lengthUnits * 100;
      // Fighters are drawn at twice their catalogue length so that they can be seen beside a kilometre of dreadnought.
      // The Oculus is the exception: it is drawn at its own 16 m.
      const factor = cls.role === 'fighter' && cls.id !== 'reaper_oculus' ? 2 : 1;
      expect(stated / (cls.lengthM.value * factor), cls.id).toBeCloseTo(1, 3);
    }
  });

  it('fitting keeps a hull’s proportions, markers and parts', () => {
    for (const build of [buildDestinyAscension, buildTurianDreadnought]) {
      const raw = build(), box = (g: THREE.Object3D) => new THREE.Box3().setFromObject(g).getSize(new THREE.Vector3());
      const before = box(raw.group), muzzle = raw.muzzle!.clone(), engines = raw.engineNodes.map(n => n.clone()), parts = raw.group.children.length;
      const k = raw.lengthUnits / before.z;
      expect(Math.abs(k - 1)).toBeGreaterThan(0.04);
      const fitted = fitToLength(raw), after = box(fitted.group);
      expect(after.z).toBeCloseTo(fitted.lengthUnits, 6);
      expect(after.x / after.z).toBeCloseTo(before.x / before.z, 6);
      expect(after.y / after.z).toBeCloseTo(before.y / before.z, 6);
      expect(fitted.muzzle!.distanceTo(muzzle.multiplyScalar(k))).toBeLessThan(1e-6);
      fitted.engineNodes.forEach((n, i) => expect(n.distanceTo(engines[i].multiplyScalar(k))).toBeLessThan(1e-6));
      expect(fitted.group.children).toHaveLength(parts);
      // A hull already the right length is left alone.
      const again = box(fitToLength(fitted).group);
      expect(again.z).toBe(after.z);
    }
  });
});

describe('lengths against canon', () => {
  const length = (id: string) => SHIP_CLASSES[id].lengthM.value;
  it('the lengths canon states are the catalogue’s', () => {
    // Mass Effect codex: a Reaper capital ship is two kilometres long, a destroyer 160 m.
    expect(length('reaper_capital')).toBe(2000);
    expect(length('reaper_destroyer')).toBe(160);
    // Halo: Infinity 5,694 m, CCS-class battlecruiser 1,782 m, CAS-class assault carrier 5,346.7 m, Marathon-class 1,192 m.
    expect(length('unsc_infinity')).toBe(5694);
    expect(length('covenant_ccs')).toBe(1782);
    expect(length('covenant_cas')).toBe(5347);
    expect(length('unsc_marathon')).toBe(1192);
  });

  it('what canon says only by comparison holds', () => {
    // A Sovereign is twice the length of any Council dreadnought, the Destiny Ascension included.
    for (const id of ['alliance_dreadnought', 'turian_dreadnought', 'asari_dreadnought', 'salarian_dreadnought']) expect(length('reaper_capital')).toBeGreaterThan(length(id) * 2);
    expect(length('reaper_capital')).toBeGreaterThan(length('destiny_ascension'));
    // The Destiny Ascension is the largest Council dreadnought; the geth dreadnought is larger than the others.
    for (const id of ['alliance_dreadnought', 'turian_dreadnought', 'asari_dreadnought', 'salarian_dreadnought', 'geth_dreadnought']) expect(length('destiny_ascension')).toBeGreaterThan(length(id));
    for (const id of ['alliance_dreadnought', 'turian_dreadnought', 'asari_dreadnought', 'salarian_dreadnought']) expect(length('geth_dreadnought')).toBeGreaterThan(length(id));
    // The SR-2 is larger than the SR-1; a frigate is a fraction of a cruiser, a cruiser of a dreadnought.
    expect(length('alliance_frigate_thanix')).toBeGreaterThan(length('alliance_normandy_sr1'));
    expect(length('alliance_frigate')).toBeLessThan(length('alliance_cruiser') / 2);
    expect(length('alliance_cruiser')).toBeLessThan(length('alliance_dreadnought'));
    // A destroyer is frigate-sized.
    expect(Math.abs(length('reaper_destroyer') - length('alliance_frigate'))).toBeLessThan(30);
  });
});
