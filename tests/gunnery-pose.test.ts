import {describe,expect,it} from 'vitest';
import * as THREE from 'three';
import {gunneryFrame,primaryGunneryMount} from '@/rendering/gunnery';
import {weaponFlashPose} from '@/rendering/weaponFlash';
import {buildCustomBattle} from '@/scenarios';
import {BattleSimulation} from '@/simulation/battle';
import {KM} from '@/rendering/geometry';

function fixture(){
 const sim=new BattleSimulation(buildCustomBattle({seed:42,rulesId:'prime_apex',environment:'deep_space',startingDistanceKm:60,
 sideA:{faction:'alliance',name:'Mount',formation:'line_abreast',counts:{alliance_dreadnought:1}},
 sideB:{faction:'reaper',name:'Contact',formation:'line_abreast',counts:{reaper_capital:1}}}));
 const ship=sim.ships[0];return {sim,ship,weapon:primaryGunneryMount(ship)!};
}

describe('rigid main-battery optics',()=>{
 it('shares the visible muzzle and rotation, including pitch and bank',()=>{
  const {ship,weapon}=fixture();const group=new THREE.Group();
  group.position.set(20,30,40);group.rotation.set(.7,.4,.1);
  const muzzle=new THREE.Vector3(0,-1,8);
  const flash=weaponFlashPose(group,muzzle,weapon);
  const frame=gunneryFrame(ship,weapon,.5,{group,muzzle});
  const clearance=Math.max(.18,ship.radiusKm*KM*.2);
  expect(frame.position.distanceTo(flash.position.clone().addScaledVector(flash.direction,clearance))).toBeLessThan(1e-10);
  expect(frame.aim.clone().sub(frame.position).normalize().distanceTo(flash.direction)).toBeLessThan(1e-10);
 });
 it('interpolates barrel rotation between ticks without following AI targets',()=>{
  const {ship,weapon}=fixture();ship.prevPos={x:0,y:0,z:0};ship.pos={x:1,y:2,z:3};
  ship.prevHeading={x:0,y:0,z:1};ship.heading={x:0,y:.8,z:.6};
  const heading=new THREE.Vector3(0,.4,.8).normalize();
  const frame=gunneryFrame(ship,weapon,.5);const direction=frame.aim.clone().sub(frame.position).normalize();
  expect(direction.distanceTo(heading)).toBeLessThan(1e-10);
  ship.targetId='different-contact';expect(gunneryFrame(ship,weapon,.5)).toEqual(frame);
  expect(gunneryFrame(ship,weapon,0).position).not.toEqual(gunneryFrame(ship,weapon,1).position);
 });
 it('does not change any simulation state or seeded outcomes when observed',()=>{
  const {sim,ship,weapon}=fixture();const before=JSON.stringify(sim.ships);
  for(const alpha of [0,.1,.5,.9,1])gunneryFrame(ship,weapon,alpha);
  expect(JSON.stringify(sim.ships)).toBe(before);
 });
});
