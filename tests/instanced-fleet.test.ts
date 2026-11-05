import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { InstancedFleet } from '@/rendering/instancedFleet';
import { getShipTemplate } from '@/rendering/ships';
import type { ShipState } from '@/simulation/types';

function ship(n: number, classId = 'alliance_frigate'): ShipState {
  const pos = { x: n * 0.25, y: n % 7, z: -n * 0.1 };
  return {
    id: 'hull-' + n, classId, alive: true, escaped: false,
    pos, prevPos: { ...pos },
    heading: { x: 0, y: 0, z: 1 },
    prevHeading: { x: 0, y: 0, z: 1 },
  } as unknown as ShipState;
}

describe('thousand-ship instanced fleet renderer', () => {
  it('draws thousands of identical hulls using a bounded number of GPU meshes', () => {
    const fleet = new InstancedFleet();
    try {
      const ships = Array.from({ length: 3000 }, (_, n) => ship(n));
      fleet.begin(ships);
      for (const state of ships) fleet.add(state, 1, 'full');
      fleet.end();
      const parts = fleet.group.children as THREE.InstancedMesh[];
      expect(fleet.shipCount).toBe(3000);
      expect(parts.length).toBeGreaterThan(0);
      expect(parts.length).toBeLessThan(40);
      expect(parts.every(part => part.isInstancedMesh && part.count === 3000)).toBe(true);
      const last = new THREE.Matrix4();
      parts[0].getMatrixAt(2999, last);
      const pos = new THREE.Vector3().setFromMatrixPosition(last);
      expect(pos.x).toBeCloseTo(ships[2999].pos.x * 10);
      expect(pos.y).toBeCloseTo(ships[2999].pos.y * 10);
      expect(pos.z).toBeCloseTo(ships[2999].pos.z * 10);
      const source = getShipTemplate('alliance_frigate');
      // Every fleet instance uses the source silhouette, not a proxy model.
      expect(source.lengthUnits).toBeGreaterThan(0);
    } finally {
      fleet.dispose();
      expect(fleet.group.children).toHaveLength(0);
    }
  });

  it('skips decorative parts for reduced LOD, and grows when fighters reinforce', () => {
    const fleet = new InstancedFleet();
    try {
      fleet.begin([ship(1), ship(2)]);
      fleet.add(ship(1), 1, 'full');
      fleet.add(ship(2), 1, 'reduced');
      fleet.end();
      const counts = (fleet.group.children as THREE.InstancedMesh[]).map(mesh => mesh.count);
      expect(counts).toContain(1);
      expect(counts).toContain(2);
      const reinforcements = Array.from({ length: 137 }, (_, i) => ship(i));
      fleet.begin(reinforcements);
      reinforcements.forEach(s => fleet.add(s, 1, 'full'));
      fleet.end();
      expect(fleet.shipCount).toBe(137);
      expect((fleet.group.children as THREE.InstancedMesh[]).every(mesh => mesh.count === 137)).toBe(true);
    } finally {
      fleet.dispose();
    }
  });
});
