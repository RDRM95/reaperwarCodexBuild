import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { REAPER_STANCE, animateReaperRig, captureReaperRig, type ReaperRig } from '@/rendering/reaperMotion';
import { buildReaperCapital, buildReaperDestroyer } from '@/rendering/ships/reaper';
import type { ShipState } from '@/simulation/types';

/**
 * Limb stances are render state only. Before this, a capital's claw tips travelled about 15 m in a whole idle cycle
 * and engaging or firing changed nothing (measured on the rig: 0.145 units, claw-tip span 5.06 → 5.32 units).
 */
const ship = (role: 'reaper_capital' | 'reaper_destroyer', firing = false): ShipState =>
  ({ role, faction: 'reaper', vel: { x: 0, y: 0, z: 0 }, maxSpeed: 1, targetId: undefined,
    weapons: [{ beamRemaining: firing ? 1 : 0, cooldown: 5, def: { kind: 'reaper_beam', antiSmall: false } }] }) as unknown as ShipState;

/** Forward tip of every lower limb in model space. */
function tips(rig: ReaperRig): THREE.Vector3[] {
  return rig.elbows.map((elbow) => {
    elbow.updateWorldMatrix(true, true);
    const box = new THREE.Box3().setFromObject(elbow);
    return new THREE.Vector3((box.min.x + box.max.x) / 2, (box.min.y + box.max.y) / 2, box.max.z);
  });
}
const span = (points: THREE.Vector3[]): number => {
  let widest = 0;
  for (const a of points) for (const b of points) widest = Math.max(widest, Math.hypot(a.x - b.x, a.y - b.y));
  return widest;
};
function run(rig: ReaperRig, state: ShipState, seconds: number, engaged: boolean, from = 0): number {
  let t = from;
  for (let i = 0; i < seconds * 20; i++) { animateReaperRig(rig, state, t, 0.05, engaged); t += 0.05; }
  return t;
}

describe('Reaper limb stances', () => {
  it('a capital opens its limbs in combat and gathers them again under way', () => {
    const built = buildReaperCapital();
    const rig = captureReaperRig(built.group, 'stance-capital');
    run(rig, ship('reaper_capital'), 2, false);
    const travel = tips(rig);
    const t = run(rig, ship('reaper_capital'), 40, true, 2);
    const combat = tips(rig);
    // The claws spread by more than a kilometre and a half of span in total; every tip moves over 100 m.
    expect(span(combat) - span(travel)).toBeGreaterThan(2);
    for (let i = 0; i < travel.length; i++) expect(combat[i].distanceTo(travel[i])).toBeGreaterThan(1);
    for (const s of rig.stance) expect(s).toBeGreaterThan(0.97);
    run(rig, ship('reaper_capital'), 60, false, t);
    expect(Math.abs(span(tips(rig)) - span(travel))).toBeLessThan(0.3);
    for (const s of rig.stance) expect(s).toBeLessThan(0.03);
  });

  it('the change is heavy: a capital is under a third open after two seconds and each limb runs on its own clock', () => {
    const built = buildReaperCapital();
    const rig = captureReaperRig(built.group, 'stance-pace');
    run(rig, ship('reaper_capital'), 2, true);
    for (const s of rig.stance) expect(s).toBeLessThan(0.55);
    expect(Math.max(...rig.stance)).toBeLessThan(0.6);
    expect(Math.max(...rig.stance) - Math.min(...rig.stance)).toBeGreaterThan(0.03);
    // A destroyer is quicker on its feet than a capital, as its class constants say.
    const destroyer = captureReaperRig(buildReaperDestroyer().group, 'stance-pace');
    run(destroyer, ship('reaper_destroyer'), 2, true);
    expect(Math.min(...destroyer.stance)).toBeGreaterThan(Math.max(...rig.stance));
    expect(REAPER_STANCE.destroyer.seconds).toBeLessThan(REAPER_STANCE.capital.seconds);
  });

  it('firing alone opens the limbs, and the pose is the same for the same rig and inputs', () => {
    const a = captureReaperRig(buildReaperCapital().group, 'stance-fire');
    const b = captureReaperRig(buildReaperCapital().group, 'stance-fire');
    run(a, ship('reaper_capital', true), 30, false);
    run(b, ship('reaper_capital', true), 30, false);
    expect(Math.min(...a.stance)).toBeGreaterThan(0.9);
    const ta = tips(a), tb = tips(b);
    for (let i = 0; i < ta.length; i++) expect(ta[i].distanceTo(tb[i])).toBe(0);
  });

  it('never moves the hull, the emitter or anything outside the limb pivots', () => {
    const built = buildReaperCapital();
    const rig = captureReaperRig(built.group, 'stance-rigid');
    const hull = built.group.getObjectByName('carapace')!;
    hull.updateWorldMatrix(true, false);
    const before = hull.matrixWorld.clone();
    const muzzle = built.muzzle!.clone();
    run(rig, ship('reaper_capital', true), 20, true);
    hull.updateWorldMatrix(true, false);
    expect(hull.matrixWorld.equals(before)).toBe(true);
    expect(built.muzzle!.equals(muzzle)).toBe(true);
  });
});
