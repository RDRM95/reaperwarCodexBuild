import { describe, expect, it } from 'vitest';
import { ShipReferenceRegistry, auditShipReferences } from './ShipReferenceRegistry';
import { buildShipQAAudit } from './shipQA';
import { buildReaperCapital, buildReaperDestroyer } from '@/rendering/ships/reaper';
import { captureReaperRig, animateReaperRig } from '@/rendering/reaperMotion';
import type { ShipState } from '@/simulation/types';

describe('ship reference pack provenance + geometry QA',()=>{
  it('retains every supplied reference and all P0 priorities',()=>{
    const rows=[...ShipReferenceRegistry.values()];
    expect(rows).toHaveLength(43);
    expect(rows.filter(r=>r.build_priority==='P0')).toHaveLength(13);
    expect(rows.filter(r=>r.apex_original)).toHaveLength(7);
    expect(rows.every(r=>Object.isFrozen(r)&&Object.isFrozen(r.primary_source_ids))).toBe(true);
    expect(rows.find(r=>r.id==='REP-001')?.length_m).toBe(2000);
    expect(rows.find(r=>r.id==='REP-003')?.length_m).toBe(160);
  });
  it('never labels a procedural mesh as approved official model',()=>{
    const audit=auditShipReferences();
    expect(audit).toHaveLength(43);
    expect(audit.every(a=>a.actualGameMesh===false&&a.approval==='not_reviewed')).toBe(true);
    expect(audit.find(a=>a.reference.id==='ALL-001')?.modelAvailable).toBe(true);
    const sr1=buildShipQAAudit().find(row=>row.registryId==='ALL-001');
    expect(sr1?.modelStatus).toBe('procedural_unverified');
    expect(sr1?.referenceLengthM).toBeNull();
    expect(sr1?.thrusters).toBe(4);
    expect(sr1?.approval).toBe('not_reviewed');
  });
  it('reports scale deltas, hardpoint locations and actual modelling gaps',()=>{
    const rows=buildShipQAAudit();
    expect(rows).toHaveLength(43);
    expect(rows.some(r=>r.modelStatus==='missing')).toBe(true);
    expect(rows.some(r=>r.modelStatus==='procedural_unverified')).toBe(true);
    expect(rows.filter(r=>r.priority==='P0').every(r=>r.approval==='not_reviewed')).toBe(true);
    const reaper=rows.find(r=>r.registryId==='REP-001');
    expect(reaper?.referenceLengthM).toBe(2000);
    expect(reaper?.hardpoints.length).toBeGreaterThan(0);
  });
});

describe('mechanical Reaper articulation',()=>{
  it('uses independent shoulders, elbows and mandibles while leaving ship position unchanged',()=>{
    for (const [build,expected] of [[buildReaperCapital,6],[buildReaperDestroyer,4]] as const){
      const built=build();
      const rig=captureReaperRig(built.group,'reaper-visual-test');
      expect(rig.shoulders).toHaveLength(expected);
      expect(rig.elbows).toHaveLength(expected);
      expect(rig.mandibles).toHaveLength(5);
      expect(rig.shutters).toHaveLength(4);
      const ship={
        role:expected===4?'reaper_destroyer':'reaper_capital',
        faction:'reaper',targetId:'contact',maxSpeed:1,
        vel:{x:.5,y:0,z:0},weapons:[{
          def:{kind:'reaper_beam',antiSmall:false},cooldown:.25,beamRemaining:0
        }],
      } as unknown as ShipState;
      const pos=built.group.position.clone();
      animateReaperRig(rig,ship,0,1/60);
      const start=rig.shoulders[0].rotation.x;
      animateReaperRig(rig,ship,5,1/60);
      expect(rig.shoulders[0].rotation.x).not.toBeCloseTo(start,5);
      expect(built.group.position.equals(pos)).toBe(true);
    }
  });
});
