import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { MAX_BREAKUP_PIECES, collectBreakupPieces } from '@/rendering/breakup';
import { captureReaperRig, selectReaperRigDetail } from '@/rendering/reaperMotion';
import { instantiateShip } from '@/rendering/ships';

/** Direct child meshes: what the death sequence used to take, and all it took. */
const flatPieces = (group: THREE.Object3D): number => group.children.filter(c => (c as THREE.Mesh).isMesh).length;
const materialsOf = (o: THREE.Object3D): Set<THREE.Material> => {
  const out = new Set<THREE.Material>();
  o.traverse((c) => { const m = c as THREE.Mesh; if (m.isMesh) out.add(m.material as THREE.Material); });
  return out;
};

describe('hull breakup pieces', () => {
  it('a Reaper breaks into its limbs, mandibles and armour instead of vanishing', () => {
    for (const [classId, limbs] of [['reaper_capital', 6], ['harbinger', 6], ['reaper_destroyer', 4]] as const) {
      const built = instantiateShip(classId);
      // Before: the flat rule found nothing to fling for a Reaper (its meshes sit under one model root).
      expect(flatPieces(built.group)).toBe(0);
      const before = materialsOf(built.group);
      const pieces = collectBreakupPieces(built.group);
      expect(pieces.length).toBeGreaterThanOrEqual(limbs + 4);
      expect(pieces.length).toBeLessThanOrEqual(MAX_BREAKUP_PIECES);
      expect(pieces.filter(p => p.userData.reaperRig === 'shoulder').length).toBe(limbs);
      expect(pieces.some(p => p.name === 'carapace')).toBe(true);
      // Hidden stand-in limbs are never pieces, and no piece keeps a material shared with the fleet.
      expect(pieces.some(p => p.name.startsWith('reaper-static'))).toBe(false);
      for (const piece of pieces) for (const m of materialsOf(piece)) expect(before.has(m)).toBe(false);
      // No piece sits inside another.
      for (const a of pieces) for (const b of pieces) if (a !== b) { let p = a.parent; while (p) { expect(p).not.toBe(b); p = p.parent; } }
    }
  });

  it('a Reaper showing its static limbs breaks into those, not the hidden articulated ones', () => {
    const built = instantiateShip('reaper_capital');
    selectReaperRigDetail(captureReaperRig(built.group, 'breakup'), false);
    const pieces = collectBreakupPieces(built.group);
    expect(pieces.some(p => p.name === 'reaper-static-arms')).toBe(true);
    expect(pieces.some(p => p.userData.reaperRig === 'shoulder')).toBe(false);
  });

  it('an ordinary hull still breaks into its merged meshes', () => {
    const built = instantiateShip('alliance_dreadnought');
    const flat = flatPieces(built.group);
    expect(flat).toBeGreaterThan(0);
    const pieces = collectBreakupPieces(built.group);
    expect(pieces.length).toBe(flat);
    for (const piece of pieces) expect((piece as THREE.Mesh).isMesh).toBe(true);
  });

  it('the cap keeps the largest pieces', () => {
    const built = instantiateShip('reaper_capital');
    const pieces = collectBreakupPieces(built.group, 5);
    expect(pieces.length).toBe(5);
    expect(pieces.some(p => p.name === 'carapace')).toBe(true);
  });
});
