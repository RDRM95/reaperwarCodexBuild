import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { measureShip, visibleMeshBounds } from '@/references/shipDimensions';
import { getShipTemplate } from '@/rendering/ships';

describe('measured ship scale', () => {
  it('measures visible geometry through nested transforms without counting hidden stand-ins', () => {
    const root = new THREE.Group(), nested = new THREE.Group();
    nested.scale.set(2, 3, 4); nested.position.set(1, 2, 3); root.add(nested);
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(2, 2, 2)); nested.add(mesh);
    const hidden = new THREE.Group(); hidden.visible = false; root.add(hidden);
    hidden.add(new THREE.Mesh(new THREE.BoxGeometry(1000, 1000, 1000)));
    const bounds = visibleMeshBounds(root);
    expect(bounds.min.toArray()).toEqual([-1, -1, -1]);
    expect(bounds.max.toArray()).toEqual([3, 5, 7]);
    expect(nested.scale.toArray()).toEqual([2, 3, 4]);
  });

  it('retains the actual capital/destroyer length ratio and authored template transforms', () => {
    const template = getShipTemplate('reaper_capital');
    const scale = template.group.scale.clone(), position = template.group.position.clone();
    const capital = measureShip('reaper_capital'), destroyer = measureShip('reaper_destroyer');
    expect(capital.lengthMetres).toBeCloseTo(2000, 3);
    expect(destroyer.lengthMetres).toBeCloseTo(160, 3);
    expect(capital.lengthMetres / destroyer.lengthMetres).toBeCloseTo(12.5, 3);
    expect(template.group.scale).toEqual(scale); expect(template.group.position).toEqual(position);
  });

  it('fits the complete Trident mesh to its catalogue length and keeps both drives on their nozzles', () => {
    const measured = measureShip('alliance_fighter'), template = getShipTemplate('alliance_fighter');
    expect(measured.catalogueMetres).toBe(18);
    expect(measured.lengthMetres).toBeCloseTo(18, 4);
    expect(measured.declaredMetres).toBe(18);
    const bounds = visibleMeshBounds(template.group);
    expect(bounds.min.z).toBeCloseTo(-.09, 5); expect(bounds.max.z).toBeCloseTo(.09, 5);
    const engines = template.group.getObjectByName('engine') as THREE.Mesh;
    const points = engines.geometry.getAttribute('position');
    for (const drive of template.engineNodes) {
      const nearest = new THREE.Vector3(); let distance = Infinity;
      for (let i = 0; i < points.count; i++) distance = Math.min(distance, nearest.fromBufferAttribute(points, i).distanceTo(drive));
      expect(distance).toBeLessThan(.012);
      expect(drive.z).toBeLessThan(0);
    }
    expect(template.engineNodes[0].x).toBeCloseTo(-template.engineNodes[1].x, 6);
    expect(.3 * template.glowScales![0]).toBeCloseTo(template.lengthUnits * .11, 6);
  });
});
