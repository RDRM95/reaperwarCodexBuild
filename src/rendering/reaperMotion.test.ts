import { describe, expect, it } from 'vitest';
import { buildHarbinger, buildReaperCapital, buildReaperDestroyer } from './ships/reaper';
import { animateReaperRig, captureReaperRig } from './reaperMotion';
import type { ShipState } from '@/simulation/types';

function mockShip(role: 'reaper_capital'|'reaper_destroyer'): ShipState {
  return {
    faction:'reaper',role,maxSpeed:1,
    vel:{x:.4,y:0,z:0},targetId:'hostile-ship',
    weapons:[{ cooldown:.25,beamRemaining:0,def:{kind:'reaper_beam',antiSmall:false,damage:1700} }]
  } as unknown as ShipState;
}

describe('rigid mechanical Reaper articulation',()=>{
  for(const [name,build,expected] of [
    ['capital',buildReaperCapital,6],['destroyer',buildReaperDestroyer,4],['Harbinger',buildHarbinger,6]
  ] as const) {
    it(name+' uses separate articulated limbs without changing the ship root',()=>{
      const built=build();
      const rig=captureReaperRig(built.group,'test-'+name);
      expect(rig.shoulders).toHaveLength(expected);
      expect(rig.elbows).toHaveLength(expected);
      expect(rig.mandibles).toHaveLength(5);
      expect(rig.shutters).toHaveLength(4);
      const root=built.group.position.clone();
      const scale=built.group.scale.clone();
      const ship=mockShip(expected===4?'reaper_destroyer':'reaper_capital');
      animateReaperRig(rig,ship,0,1/60);
      const first=rig.shoulders.map(p=>p.rotation.x);
      animateReaperRig(rig,ship,8,1/60);
      const second=rig.shoulders.map(p=>p.rotation.x);
      expect(second.some((v,i)=>Math.abs(v-first[i])>0.0001)).toBe(true);
      expect(rig.shutters.some(s=>Number(s.userData.open)>.11)).toBe(true);
      expect(built.group.position).toEqual(root);
      expect(built.group.scale).toEqual(scale);
      // Rigid joints move as transform groups, not deformable mesh vertices.
      expect(rig.shoulders[0].children.some(c=>c.type==='Mesh')).toBe(true);
    });
  }
});
