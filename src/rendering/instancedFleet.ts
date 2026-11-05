import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { ShipState } from '@/simulation/types';
import { KM } from './geometry';
import { DETAIL_MESH_NAMES, type LodLevel } from './lod';
import { getShipTemplate } from './ships';

interface Part { mesh: THREE.InstancedMesh; detail: boolean; }
interface Batch { capacity: number; parts: Part[]; }

/**
 * A ship keeps its individual simulation state; the GPU draws repeated hull
 * parts in class/material batches instead of thousands of scene-graph clones.
 * Detailed heroes (camera subjects and nearby ships) remain separate.
 */
export class InstancedFleet {
  readonly group = new THREE.Group();
  private readonly batches = new Map<string, Batch>();
  private readonly pos = new THREE.Vector3();
  private readonly dir = new THREE.Vector3();
  private readonly quat = new THREE.Quaternion();
  private readonly matrix = new THREE.Matrix4();
  private readonly forward = new THREE.Vector3(0, 0, 1);
  private readonly unitScale = new THREE.Vector3(1, 1, 1);
  /** Count of ships submitted in the most recent render frame. */
  shipCount = 0;

  private createBatch(classId: string, capacity: number): Batch {
    const template = getShipTemplate(classId);
    template.group.updateMatrixWorld(true);
    type Group = {
      geometries: THREE.BufferGeometry[];
      material: THREE.Material | THREE.Material[];
      detail: boolean;
      name: string;
    };
    const grouped = new Map<string, Group>();
    let separate = 0;

    template.group.traverse(obj => {
      const source = obj as THREE.Mesh;
      if (!source.isMesh) return;
      const geometry = source.geometry.clone();
      geometry.applyMatrix4(source.matrixWorld);
      const detail = DETAIL_MESH_NAMES.has(source.name);
      const material = source.material;
      const attrs = Object.entries(geometry.attributes)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([name, attribute]) => name + ':' + attribute.itemSize + ':' +
          attribute.normalized + ':' + attribute.constructor.name).join('|');
      // mergeGeometries needs identical attributes/index usage. Do not merge
      // morph targets or multiple-material groups with single-material parts.
      const incompatible = Array.isArray(material) || Object.keys(geometry.morphAttributes).length > 0;
      const key = incompatible ? 'separate:' + separate++
        : material.uuid + ':' + detail + ':' + Boolean(geometry.index) + ':' + attrs;
      let group = grouped.get(key);
      if (!group) {
        group = { geometries: [], material, detail, name: source.name };
        grouped.set(key, group);
      }
      group.geometries.push(geometry);
    });

    const parts: Part[] = [];
    for (const group of grouped.values()) {
      let geometries = group.geometries;
      if (geometries.length > 1) {
        const merged = mergeGeometries(geometries, false);
        if (merged) {
          for (const geometry of geometries) geometry.dispose();
          geometries = [merged];
        }
      }
      for (const geometry of geometries) {
        const mesh = new THREE.InstancedMesh(geometry, group.material, capacity);
        mesh.name = 'fleet-' + classId + '-' + group.name;
        mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        // Individual ships are CPU-frustum-culled before entering the batch.
        mesh.frustumCulled = false;
        mesh.count = 0;
        this.group.add(mesh);
        parts.push({ mesh, detail: group.detail });
      }
    }
    return { parts, capacity };
  }

  begin(ships: readonly ShipState[]): void {
    const counts = new Map<string, number>();
    for (const ship of ships) {
      if (ship.alive && !ship.escaped)
        counts.set(ship.classId, (counts.get(ship.classId) ?? 0) + 1);
    }
    for (const [classId, count] of counts) {
      const old = this.batches.get(classId);
      if (old && old.capacity >= count) continue;
      if (old) this.disposeBatch(old);
      const capacity = Math.max(32, 2 ** Math.ceil(Math.log2(count)));
      this.batches.set(classId, this.createBatch(classId, capacity));
    }
    this.shipCount = 0;
    for (const batch of this.batches.values())
      for (const { mesh } of batch.parts) mesh.count = 0;
  }

  add(ship: ShipState, alpha: number, lod: LodLevel): void {
    const batch = this.batches.get(ship.classId);
    if (!batch) throw new Error('Missing instance batch: ' + ship.classId);
    this.pos.set(
      (ship.prevPos.x + (ship.pos.x - ship.prevPos.x) * alpha) * KM,
      (ship.prevPos.y + (ship.pos.y - ship.prevPos.y) * alpha) * KM,
      (ship.prevPos.z + (ship.pos.z - ship.prevPos.z) * alpha) * KM,
    );
    this.dir.set(
      ship.prevHeading.x + (ship.heading.x - ship.prevHeading.x) * alpha,
      ship.prevHeading.y + (ship.heading.y - ship.prevHeading.y) * alpha,
      ship.prevHeading.z + (ship.heading.z - ship.prevHeading.z) * alpha,
    ).normalize();
    this.quat.setFromUnitVectors(this.forward, this.dir);
    this.matrix.compose(this.pos, this.quat, this.unitScale);
    for (const { mesh, detail } of batch.parts) {
      if (lod === 'reduced' && detail) continue;
      const slot = mesh.count++;
      if (slot >= batch.capacity) throw new Error('GPU ship batch exceeded its capacity');
      mesh.setMatrixAt(slot, this.matrix);
    }
    this.shipCount++;
  }

  end(): void {
    for (const batch of this.batches.values()) {
      for (const { mesh } of batch.parts) {
        mesh.visible = mesh.count > 0;
        if (mesh.count > 0) mesh.instanceMatrix.needsUpdate = true;
      }
    }
  }

  private disposeBatch(batch: Batch): void {
    for (const { mesh } of batch.parts) {
      this.group.remove(mesh);
      mesh.geometry.dispose();
      mesh.dispose();
    }
  }

  dispose(): void {
    for (const batch of this.batches.values()) this.disposeBatch(batch);
    this.batches.clear();
  }
}
