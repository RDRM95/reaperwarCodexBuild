import { describe, expect, it } from 'vitest';
import { distance, length, sub, v3 } from '@/core/vec3';
import { buildCustomBattle } from '@/scenarios';
import { BattleSimulation } from '@/simulation/battle';
import { beamContactLocal, glanceMultiplier, spreadProjectileAim, worldHullContact } from '@/simulation/impactGeometry';

function fixture() {
  const sim = new BattleSimulation(buildCustomBattle({
    seed: 95, rulesId: 'canon_me3', environment: 'deep_space', startingDistanceKm: 25,
    sideA: {faction:'alliance',name:'Trajectory test',formation:'capital_column',
      counts:{alliance_dreadnought:1}},
    sideB: {faction:'reaper',name:'Impact target',formation:'capital_column',
      counts:{reaper_capital:1}}
  }));
  return {sim,attacker:sim.ships.find(s=>s.side==='A')!,target:sim.ships.find(s=>s.side==='B')!};
}
describe('localised ballistic and beam contact geometry',()=>{
  it('spreads accurate slugs across the projected target disc without generating misses outside the silhouette',()=>{
    const {attacker,target}=fixture();
    const aim=target.pos;
    const p1=spreadProjectileAim(aim,attacker.pos,target,1,0);
    const p2=spreadProjectileAim(aim,attacker.pos,target,2,0);
    expect(distance(p1,p2)).toBeGreaterThan(0.01);
    expect(distance(p1,aim)).toBeLessThanOrEqual(target.radiusKm*.7+1e-6);
    expect(distance(p2,aim)).toBeLessThanOrEqual(target.radiusKm*.7+1e-6);
    expect(spreadProjectileAim(aim,attacker.pos,target,1,0)).toEqual(p1);
  });
  it('attaches a Reaper beam to a real rotating hull contact rather than pinning to the centre',()=>{
    const {attacker,target}=fixture();
    const local=beamContactLocal(attacker,target,7,2);
    const before=worldHullContact(target,local);
    const delta=sub(before,target.pos);
    expect(length(delta)).toBeCloseTo(target.radiusKm,6);
    expect(length(delta)).toBeGreaterThan(0);
    target.heading=v3(1,0,0);
    const after=worldHullContact(target,local);
    expect(distance(before,after)).toBeGreaterThan(.1);
    expect(length(sub(after,target.pos))).toBeCloseTo(target.radiusKm,6);
  });
  it('reduces shallow-angle hull grazes but not a direct kinetic impact',()=>{
    const {target}=fixture();
    const forward=v3(0,0,1);
    expect(glanceMultiplier(forward,v3(target.pos.x,target.pos.y,target.pos.z+target.radiusKm),target)).toBe(1);
    const glance=glanceMultiplier(forward,v3(target.pos.x+target.radiusKm,target.pos.y,target.pos.z),target);
    expect(glance).toBeGreaterThanOrEqual(.58);
    expect(glance).toBeLessThan(.8);
    expect(glanceMultiplier(forward,target.pos,target)).toBe(1);
  });
  it('updates the actual active beam endpoint as the target moves between simulation ticks',()=>{
    const {sim,attacker,target}=fixture();
    const beamShip=target;const beamTarget=attacker;
    const beam=beamShip.weapons.find(w=>w.def.kind==='reaper_beam')!;
    expect(beam).toBeDefined();
    beam.beamRemaining=.30;beam.beamHit=true;beam.beamTargetId=beamTarget.id;
    beam.beamLocalHit=beamContactLocal(beamShip,beamTarget,13,beam.index);
    beam.beamGlance=.85;
    beam.def={...beam.def,damage:0};
    sim.step();
    expect(beam.beamEnd).toBeDefined();
    const first=beam.beamEnd!;
    expect(distance(first,beamTarget.pos)).toBeGreaterThan(.01);
    const initialLocal=beam.beamLocalHit!;
    beamTarget.pos=v3(beamTarget.pos.x+5,beamTarget.pos.y+1,beamTarget.pos.z);
    const next=worldHullContact(beamTarget,initialLocal);
    expect(distance(first,next)).toBeGreaterThan(4);
  });
});
