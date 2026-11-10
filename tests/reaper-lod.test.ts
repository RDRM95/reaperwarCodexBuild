import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { getShipClass } from '@/data/ships';
import { InstancedFleet } from '@/rendering/instancedFleet';
import { isLodDetail } from '@/rendering/lod';
import { captureReaperRig, selectReaperRigDetail } from '@/rendering/reaperMotion';
import { applyShipLod, captureLodDetails } from '@/rendering/shipLod';
import { instantiateShip } from '@/rendering/ships';
import type { ShipState } from '@/simulation/types';

const CLASS_IDS = ['reaper_capital', 'harbinger', 'reaper_destroyer', 'reaper_ascendant'] as const;
// Independently measured at PR #29 geometry ee3cc80; complete structural layers
// and both optics, excluding decorative overlays and running lights.
const REDUCED_VERTICES = { reaper_capital: 25151, harbinger: 24671, reaper_destroyer: 18143, reaper_ascendant: 25607 };
const objectsNamed = (root: THREE.Object3D, name: string): THREE.Object3D[] => {
  const matches: THREE.Object3D[] = [];
  root.traverse(object => { if (object.name === name) matches.push(object); });
  return matches;
};
const renderState = (classId: string): ShipState => ({
  id: `lod-${classId}`, classId, alive: true, escaped: false,
  role: getShipClass(classId).role,
  pos: { x: 3, y: 2, z: -4 }, prevPos: { x: 2, y: 2, z: -4 },
  vel: { x: 1, y: 0, z: 0 },
  heading: { x: 0, y: 0, z: 1 }, prevHeading: { x: 0, y: 0, z: 1 },
  engineThrust: .4,
} as ShipState);

describe('Reaper structural identity survives reduced LOD', () => {
  it.each(CLASS_IDS)('%s keeps its armour and aperture in a reduced GPU batch', classId => {
    const fleet = new InstancedFleet(), ship = renderState(classId);
    const before = structuredClone(ship);
    try {
      fleet.begin([ship]);
      fleet.add(ship, .5, 'reduced');
      fleet.end();
      const parts = fleet.group.children as THREE.InstancedMesh[];
      const apertures = parts.filter(part => part.name === `instanced-${classId}-eye`);
      expect(apertures.length, 'both optics survive separately from running lights').toBe(2);
      expect(apertures.every(part => part.count === 1 && part.visible)).toBe(true);
      const shownVertices = parts.filter(part => part.visible && part.count > 0)
        .reduce((count, part) => count + part.geometry.attributes.position.count, 0);
      expect(shownVertices, 'complete carapace and limbs survive material merging').toBe(REDUCED_VERTICES[classId]);
      const overlays = parts.filter(part => part.name === `instanced-${classId}-plates`);
      expect(overlays.length).toBeGreaterThan(0);
      expect(overlays.every(part => part.count === 0 && !part.visible)).toBe(true);
      const seams = parts.filter(part => part.name.endsWith('-reaper-arm-seam'));
      expect(seams.length).toBeGreaterThan(0);
      expect(seams.every(part => part.count === 0 && !part.visible)).toBe(true);
      // Drawing a different representation cannot feed into physical state.
      expect(ship).toEqual(before);
      fleet.begin([ship]); fleet.add(ship, .5, 'full'); fleet.end();
      expect(seams.every(part => part.count === 1 && part.visible)).toBe(true);
    } finally { fleet.dispose(); }
  });

  it('retains the existing non-Reaper detail policy', () => {
    expect(isLodDetail('plates', 'cruiser')).toBe(true);
    expect(isLodDetail('eye', 'fighter')).toBe(true);
    expect(isLodDetail('lights', 'reaper_capital')).toBe(true);
    expect(isLodDetail('plates', 'reaper_capital')).toBe(false);
    expect(isLodDetail('eye', 'reaper_destroyer')).toBe(false);
    expect(isLodDetail('plates', 'reaper_capital', true)).toBe(true);
    expect(isLodDetail('carapace', 'reaper_capital', true)).toBe(false);
    expect(isLodDetail('reaper-joint', 'reaper_capital')).toBe(false);
  });
});

describe('nested hero details and independent mechanical visibility', () => {
  it('reduces decorative overlays when a model supplies a dedicated structural carapace', () => {
    const root = new THREE.Group(), model = new THREE.Group(); root.add(model);
    const carapace = new THREE.Object3D(); carapace.name = 'carapace'; model.add(carapace);
    const plates = new THREE.Object3D(); plates.name = 'plates'; model.add(plates);
    const eye = new THREE.Object3D(); eye.name = 'eye'; model.add(eye);
    const details = captureLodDetails(root, 'reaper_capital');
    applyShipLod(root, details, 'reduced');
    expect(carapace.visible).toBe(true);
    expect(eye.visible).toBe(true);
    expect(plates.visible).toBe(false);
    applyShipLod(root, details, 'full');
    expect(plates.visible).toBe(true);
  });
  it.each(CLASS_IDS)('%s reduces and restores nested details without moving mounts or resizing the hull', classId => {
    const built = instantiateShip(classId), role = getShipClass(classId).role;
    const details = captureLodDetails(built.group, role);
    const rig = captureReaperRig(built.group, 'hero-lod');
    const seams = objectsNamed(built.group, 'reaper-arm-seam');
    const armour = objectsNamed(built.group, 'carapace');
    const overlays = objectsNamed(built.group, 'plates');
    const aperture = objectsNamed(built.group, 'eye');
    const size = new THREE.Box3().setFromObject(built.group).getSize(new THREE.Vector3());
    const muzzle = built.muzzle!.clone(), engines = built.engineNodes.map(point => point.clone());
    expect(seams.length).toBeGreaterThan(0);
    expect(armour.length).toBeGreaterThan(0);
    expect(overlays.length).toBeGreaterThan(0);
    expect(seams.every(part => part.parent !== built.group)).toBe(true);

    applyShipLod(built.group, details, 'reduced');
    selectReaperRigDetail(rig, true, 'reduced');
    expect(seams.every(part => !part.visible)).toBe(true);
    expect(armour.every(part => part.visible)).toBe(true);
    expect(overlays.every(part => !part.visible)).toBe(true);
    expect(aperture.every(part => part.visible)).toBe(true);
    expect(rig.staticMeshes.every(part => !part.visible)).toBe(true);

    // Moving outside articulation range selects the cheap limb stand-ins.
    // This must not accidentally switch reduced running lights back on.
    selectReaperRigDetail(rig, false, 'reduced');
    expect(objectsNamed(built.group, 'reaper-static-arms').every(part => part.visible)).toBe(true);
    expect(objectsNamed(built.group, 'reaper-static-seams').every(part => !part.visible)).toBe(true);
    applyShipLod(built.group, details, 'full');
    selectReaperRigDetail(rig, false, 'full');
    expect(seams.every(part => part.visible)).toBe(true);
    expect(overlays.every(part => part.visible)).toBe(true);
    expect(objectsNamed(built.group, 'reaper-static-seams').every(part => part.visible)).toBe(true);

    applyShipLod(built.group, details, 'point');
    expect(built.group.visible).toBe(false);
    applyShipLod(built.group, details, 'full');
    selectReaperRigDetail(rig, true, 'full');
    expect(built.group.visible).toBe(true);
    expect(seams.every(part => part.visible)).toBe(true);
    expect(rig.staticMeshes.every(part => !part.visible)).toBe(true);
    expect(new THREE.Box3().setFromObject(built.group).getSize(new THREE.Vector3())).toEqual(size);
    expect(built.muzzle).toEqual(muzzle);
    expect(built.engineNodes).toEqual(engines);
  });

  it('preserves deliberately hidden nested decorations and does not override a rig visibility owner', () => {
    const root = new THREE.Group(), nested = new THREE.Group(); root.add(nested);
    const light = new THREE.Object3D(); light.name = 'lights'; light.visible = false; nested.add(light);
    const window = new THREE.Object3D(); window.name = 'windows'; nested.add(window);
    const staticArms = new THREE.Object3D(); staticArms.name = 'reaper-static-arms'; staticArms.visible = false; nested.add(staticArms);
    const details = captureLodDetails(root, 'reaper_capital');
    applyShipLod(root, details, 'reduced');
    expect(window.visible).toBe(false);
    staticArms.visible = true;
    applyShipLod(root, details, 'full');
    expect(light.visible).toBe(false);
    expect(window.visible).toBe(true);
    expect(staticArms.visible).toBe(true);
  });
});
