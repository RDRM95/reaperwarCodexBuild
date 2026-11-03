import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { buildPastCycleCruiser, buildPastCycleDreadnought, buildPlayerCivCruiser, buildPlayerCivDreadnought, buildProtheanCruiser, buildProtheanDreadnought, buildSkynetHarvester, buildSkynetHunter } from '@/rendering/ships/auHumanity';

const entries = [
  ['prothean cruiser', buildProtheanCruiser, 10], ['prothean capital', buildProtheanDreadnought, 22],
  ['past-cycle cruiser', buildPastCycleCruiser, 9], ['past-cycle capital', buildPastCycleDreadnought, 15],
  ['player cruiser', buildPlayerCivCruiser, 7], ['player capital', buildPlayerCivDreadnought, 12],
  ['machine hunter', buildSkynetHunter, 3.2], ['machine capital', buildSkynetHarvester, 12],
] as const;

describe('original AU ship stand-ins', () => {
  it.each(entries)('%s has catalogue-sized finite geometry and attached markers', (_, build, length) => {
    const ship = build(), box = new THREE.Box3().setFromObject(ship.group), size = box.getSize(new THREE.Vector3());
    expect(size.z).toBeCloseTo(length, 5); expect(ship.lengthUnits).toBe(length);
    expect(size.x).toBeGreaterThan(length * 0.15); expect(size.x).toBeLessThan(length);
    expect(size.y).toBeGreaterThan(length * 0.06); expect(size.y).toBeLessThan(length * 0.5);
    expect(ship.group.children).toHaveLength(5); expect(ship.engineNodes.length).toBeGreaterThanOrEqual(3);
    for (const marker of [...ship.engineNodes, ship.muzzle!]) expect(box.clone().expandByScalar(length * 0.003).containsPoint(marker)).toBe(true);
    for (const engine of ship.engineNodes) expect(engine.z).toBeLessThan(-length * 0.30);
    for (const object of ship.group.children) {
      const geometry = (object as THREE.Mesh).geometry;
      expect(geometry.attributes.position.count).toBeLessThan(10000);
      for (const attribute of ['position', 'normal']) expect(Array.from(geometry.attributes[attribute].array).every(Number.isFinite)).toBe(true);
    }
  });

  it('keeps four recognizable silhouette and engine-palette families', () => {
    const builds = [buildProtheanCruiser(), buildPastCycleCruiser(), buildPlayerCivCruiser(), buildSkynetHunter()];
    const widths = builds.map(ship => new THREE.Box3().setFromObject(ship.group).getSize(new THREE.Vector3()).x / ship.lengthUnits);
    expect(new Set(widths.map(n => n.toFixed(3))).size).toBe(4);
    expect(widths[1]).toBeGreaterThan(widths[2] * 1.3);
    expect(new Set(builds.map(ship => ship.glowColor)).size).toBe(4);
  });
});
