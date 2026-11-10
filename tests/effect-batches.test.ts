import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { FragmentBatch, SparkBatch } from '@/rendering/effectBatches';

/**
 * Sparks and debris fragments were one draw call each. These batches draw each kind in one instanced call; the
 * tests pin the bookkeeping that the picture depends on (what is written where, and how many instances are drawn).
 */
describe('spark batch', () => {
  it('draws exactly the sparks pushed since begin, with their position, size, colour and opacity', () => {
    const batch = new SparkBatch(new THREE.Texture(), true, 8);
    batch.begin();
    expect(batch.push(1, 2, 3, 4, 0.5, 0.25, 0.125, 0.75)).toBe(true);
    expect(batch.push(-1, -2, -3, 0.5, 1, 1, 1, 1)).toBe(true);
    batch.commit();
    const geometry = batch.mesh.geometry;
    expect(geometry.instanceCount).toBe(2);
    expect(Array.from(geometry.getAttribute('centre').array.slice(0, 8))).toEqual([1, 2, 3, 4, -1, -2, -3, 0.5]);
    expect(Array.from(geometry.getAttribute('tint').array.slice(0, 8))).toEqual([0.5, 0.25, 0.125, 0.75, 1, 1, 1, 1]);
    batch.begin();
    batch.commit();
    expect(geometry.instanceCount).toBe(0);
    batch.dispose();
  });

  it('refuses sparks beyond its capacity instead of writing past its buffers', () => {
    const batch = new SparkBatch(new THREE.Texture(), true, 2);
    batch.begin();
    expect(batch.push(0, 0, 0, 1, 1, 1, 1, 1)).toBe(true);
    expect(batch.push(0, 0, 0, 1, 1, 1, 1, 1)).toBe(true);
    expect(batch.push(9, 9, 9, 9, 9, 9, 9, 9)).toBe(false);
    expect(batch.count).toBe(2);
    expect(batch.mesh.geometry.getAttribute('centre').array).toHaveLength(8);
    batch.dispose();
  });

  it('blends as the sprites it replaces did: additive, no depth write, never culled as one object', () => {
    const tested = new SparkBatch(new THREE.Texture()), through = new SparkBatch(new THREE.Texture(), false);
    for (const batch of [tested, through]) {
      expect(batch.mesh.material.blending).toBe(THREE.AdditiveBlending);
      expect(batch.mesh.material.transparent).toBe(true);
      expect(batch.mesh.material.depthWrite).toBe(false);
      expect(batch.mesh.material.toneMapped).toBe(true);
      expect(batch.mesh.frustumCulled).toBe(false);
    }
    expect(tested.mesh.material.depthTest).toBe(true);
    expect(through.mesh.material.depthTest).toBe(false);
    // The shader keeps the renderer's logarithmic depth, tone mapping and output colour space.
    for (const chunk of ['logdepthbuf_vertex', 'logdepthbuf_fragment', 'tonemapping_fragment', 'colorspace_fragment']) {
      expect(tested.mesh.material.vertexShader + tested.mesh.material.fragmentShader).toContain(`#include <${chunk}>`);
    }
    tested.dispose(); through.dispose();
  });
});

describe('fragment batch', () => {
  const matrixAt = (batch: FragmentBatch, i: number) => { const m = new THREE.Matrix4(); batch.mesh.getMatrixAt(i, m); return m.elements[12]; };

  it('grows instead of dropping fragments, keeping those already written, as one mesh in the scene', () => {
    const parent = new THREE.Group(), geometry = new THREE.BoxGeometry(), material = new THREE.MeshStandardMaterial();
    const batch = new FragmentBatch(geometry, material, parent, 2);
    batch.begin();
    for (let i = 0; i < 5; i++) batch.push(new THREE.Matrix4().makeTranslation(i + 1, 0, 0));
    batch.commit();
    expect(batch.count).toBe(5);
    expect(batch.capacity).toBe(8);
    expect(batch.mesh.count).toBe(5);
    expect([0, 1, 2, 3, 4].map(i => matrixAt(batch, i))).toEqual([1, 2, 3, 4, 5]);
    expect(parent.children).toEqual([batch.mesh]);
    expect(batch.mesh.geometry).toBe(geometry);
    expect(batch.mesh.material).toBe(material);
    batch.begin();
    batch.commit();
    expect(batch.mesh.count).toBe(0);
    batch.dispose();
    expect(parent.children).toHaveLength(0);
    geometry.dispose(); material.dispose();
  });
});
