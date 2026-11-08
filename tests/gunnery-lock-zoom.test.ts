import { describe, expect, it } from 'vitest';
import { CameraRig } from '@/rendering/cameras';

describe('stable optical gunnery camera', () => {
  it('stays at the selected main gun and toggles two optical magnifications', () => {
    const rig = new CameraRig(16/9);
    expect(rig.camera.fov).toBe(50);
    rig.setMode('gunnery');
    const previousDistance=rig.distance;
    rig.zoom(-600);
    rig.orbit(20, 30);
    expect(rig.distance).toBe(previousDistance);
    rig.toggleGunneryZoom();
    expect(rig.gunneryZoomed).toBe(true);
    expect(rig.camera.fov).toBe(25);
    rig.toggleGunneryZoom();
    expect(rig.camera.fov).toBe(50);
    rig.setMode('tactical');
    rig.toggleGunneryZoom();
    expect(rig.gunneryZoomed).toBe(false);
    expect(rig.camera.fov).toBe(50);
  });
});
