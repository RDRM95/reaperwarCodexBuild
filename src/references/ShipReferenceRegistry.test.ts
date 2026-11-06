import { describe, expect, it } from 'vitest';
import { ShipReferenceRegistry, auditShipReferences } from './ShipReferenceRegistry';
import { buildShipQAAudit } from './shipQA';

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
