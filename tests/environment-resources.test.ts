import {describe,it,expect} from 'vitest';
import * as THREE from 'three';
import {disposeEnvironment} from '@/rendering/environment';

describe('procedural orbital resource ownership',()=>{
 it('releases shared albedo and cloud shader textures exactly once on redeploy',()=>{
  const texture=new THREE.Texture(),geometry=new THREE.SphereGeometry(1,8,6);
  const surface=new THREE.ShaderMaterial({uniforms:{map:{value:texture},shared:{value:texture}}});
  const cloud=new THREE.MeshBasicMaterial({map:texture});
  const group=new THREE.Group();group.add(new THREE.Mesh(geometry,surface),new THREE.Mesh(geometry,cloud));
  const counts={geometry:0,texture:0,surface:0,cloud:0};
  geometry.addEventListener('dispose',()=>counts.geometry++);texture.addEventListener('dispose',()=>counts.texture++);
  surface.addEventListener('dispose',()=>counts.surface++);cloud.addEventListener('dispose',()=>counts.cloud++);
  disposeEnvironment({group,skyObjects:[],sunDirection:new THREE.Vector3(1,0,0),name:'Orbit'});
  expect(counts).toEqual({geometry:1,texture:1,surface:1,cloud:1});
 });
});
