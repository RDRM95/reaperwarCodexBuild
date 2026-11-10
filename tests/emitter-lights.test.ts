import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { EMITTER_FALL_S, EMITTER_LIGHT_COUNT, EMITTER_RISE_S, EmitterLightPool, easeEmitterCharge, emitterLight, emitterTarget, pickEmitters, type EmitterCandidate } from '@/rendering/emitterLights';

const candidate = (id: string, charge: number, distance: number, size = 20): EmitterCandidate =>
  ({ id, charge, distanceSq: distance * distance, position: new THREE.Vector3(distance, 0, 0), size, color: 0xff4a20 });

describe('Reaper emitter lights', () => {
  it('the glow rises quickly, fades slowly and settles exactly', () => {
    let c = 0;
    for (let t = 0; t < EMITTER_RISE_S; t += 1 / 60) c = easeEmitterCharge(c, 1, 1 / 60);
    expect(c).toBeGreaterThan(0.9);
    let fall = 1;
    for (let t = 0; t < EMITTER_RISE_S; t += 1 / 60) fall = easeEmitterCharge(fall, 0, 1 / 60);
    expect(fall).toBeGreaterThan(0.35); // still fading after the time it took to rise
    for (let t = 0; t < EMITTER_FALL_S * 4; t += 1 / 60) fall = easeEmitterCharge(fall, 0, 1 / 60);
    expect(fall).toBe(0);
    expect(emitterTarget(true, false)).toBe(1);
    expect(emitterTarget(false, true)).toBeGreaterThan(0.3);
    expect(emitterTarget(false, true)).toBeLessThan(1);
    expect(emitterTarget(false, false)).toBe(0);
  });

  it('the brightest, nearest emitters win and the choice never depends on order', () => {
    const cands = [candidate('far-firing', 1, 900), candidate('near-charging', 0.55, 60), candidate('near-firing', 1, 80), candidate('idle', 0.01, 10), candidate('twin-b', 0.5, 300), candidate('twin-a', 0.5, 300)];
    const picked = pickEmitters(cands).map(c => c.id);
    expect(picked).toEqual(['near-firing', 'near-charging']);
    expect(pickEmitters([...cands].reverse()).map(c => c.id)).toEqual(picked);
    expect(pickEmitters([candidate('twin-b', 0.5, 300), candidate('twin-a', 0.5, 300)], 1)[0].id).toBe('twin-a');
    expect(pickEmitters([candidate('idle', 0.01, 10)])).toEqual([]);
  });

  it('light strength scales with the hull so a destroyer and a capital light their own limbs alike', () => {
    // Inverse-square light at a fifth of a hull length: the same irradiance for a 160 m and a 2 km hull.
    const at = (size: number): number => emitterLight(size, 1).intensity / (size * 0.2) ** 2;
    expect(at(1.6)).toBeCloseTo(at(20), 6);
    expect(at(20)).toBeGreaterThan(1.5);
    expect(at(20)).toBeLessThan(6);
    expect(emitterLight(20, 0).intensity).toBe(0);
    expect(emitterLight(20, 1).distance).toBeLessThan(20);
  });

  it('the pool keeps a constant number of lights in the scene and darkens the unused ones', () => {
    const pool = new EmitterLightPool();
    const count = (): number => pool.group.children.filter(o => (o as THREE.PointLight).isPointLight).length;
    expect(count()).toBe(EMITTER_LIGHT_COUNT);
    pool.begin();
    for (let i = 0; i < 6; i++) pool.offer(candidate('r' + i, 1, 50 + i * 10));
    pool.end();
    expect(pool.lit).toBe(EMITTER_LIGHT_COUNT);
    expect(count()).toBe(EMITTER_LIGHT_COUNT);
    pool.begin();
    pool.offer(candidate('only', 0.6, 40));
    pool.end();
    expect(pool.lit).toBe(1);
    pool.begin();
    pool.end();
    expect(pool.lit).toBe(0);
    expect(count()).toBe(EMITTER_LIGHT_COUNT);
  });
});
