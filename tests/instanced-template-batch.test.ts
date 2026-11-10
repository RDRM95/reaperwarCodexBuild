import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { InstancedFleet } from '@/rendering/instancedFleet';
import { getShipTemplate } from '@/rendering/ships';
import { buildReaperAscendant } from '@/rendering/ships/reaper';
import type { ShipState } from '@/simulation/types';

/** Vertices of a template split by what it shows and what it keeps hidden (stand-in layers). */
function templateVertices(classId: string): { shown: number; hidden: number } {
  const template = getShipTemplate(classId);
  let shown = 0;
  let hidden = 0;
  template.group.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if (!mesh.isMesh) return;
    let visible = true;
    for (let o: THREE.Object3D | null = mesh; o && o !== template.group; o = o.parent) if (!o.visible) visible = false;
    const n = mesh.geometry.attributes.position.count;
    if (visible) shown += n;
    else hidden += n;
  });
  return { shown, hidden };
}

function batchVertices(classId: string): number {
  const fleet = new InstancedFleet();
  const ship = { classId, alive: true, escaped: false } as unknown as ShipState;
  fleet.begin([ship]);
  let total = 0;
  for (const child of fleet.group.children) {
    const mesh = child as THREE.InstancedMesh;
    if (mesh.isInstancedMesh && mesh.name.startsWith('instanced-' + classId + '-')) total += mesh.geometry.attributes.position.count;
  }
  return total;
}

describe('instanced batches merge only what the template shows', () => {
  it('a Reaper template keeps its static stand-in limbs hidden, and the batch leaves them out', () => {
    for (const classId of ['reaper_capital', 'harbinger', 'reaper_destroyer']) {
      const { shown, hidden } = templateVertices(classId);
      expect(hidden, `${classId} carries hidden stand-in layers`).toBeGreaterThan(0);
      expect(batchVertices(classId), `${classId} batch vertices`).toBe(shown);
    }
  });

  it('a template without hidden layers is merged whole', () => {
    const { shown, hidden } = templateVertices('alliance_dreadnought');
    expect(hidden).toBe(0);
    expect(batchVertices('alliance_dreadnought')).toBe(shown);
  });
});

describe('Ascendant render length', () => {
  it('is the catalogue 30 km (300 units), not 36', () => {
    const built = buildReaperAscendant();
    expect(built.lengthUnits).toBeCloseTo(300, 6);
    const bounds = new THREE.Box3().setFromObject(built.group);
    expect(bounds.max.z - bounds.min.z).toBeGreaterThan(285);
    expect(bounds.max.z - bounds.min.z).toBeLessThan(315);
  });
});
