import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { CameraRig } from '@/rendering/cameras';

describe('stable optical gunnery camera', () => {
  it('eases to exact 2x magnification without moving the fixed gun station', () => {
    const rig = new CameraRig(16/9);
    rig.setMode('gunnery');
    const position=new THREE.Vector3(1,2,3),aim=new THREE.Vector3(1,2,2003);
    const update=(dt:number)=>rig.update(dt,{gunnery:{position,aim},fleetCentre:new THREE.Vector3()});
    update(.05);
    const previousDistance=rig.distance;
    rig.zoom(-600);rig.orbit(20,30);
    expect(rig.distance).toBe(previousDistance);
    const originalOrientation=rig.camera.quaternion.clone();
    rig.toggleGunneryZoom();
    expect(rig.gunneryZoomed).toBe(true);
    expect(rig.camera.fov).toBe(50);
    update(.05);
    expect(rig.camera.fov).toBeLessThan(50);
    expect(rig.camera.fov).toBeGreaterThan(27);
    for(let n=0;n<40;n++)update(.05);
    const magnification=Math.tan(THREE.MathUtils.degToRad(25))/Math.tan(THREE.MathUtils.degToRad(rig.camera.fov/2));
    expect(magnification).toBeCloseTo(2,7);
    expect(rig.camera.position).toEqual(position);
    expect(rig.camera.quaternion.toArray()).toEqual(originalOrientation.toArray());
    rig.toggleGunneryZoom();update(.05);
    expect(rig.camera.fov).toBeGreaterThan(27);
    expect(rig.camera.fov).toBeLessThan(50);
    rig.setMode('tactical');rig.toggleGunneryZoom();
    expect(rig.gunneryZoomed).toBe(false);expect(rig.camera.fov).toBe(50);
  });
});
