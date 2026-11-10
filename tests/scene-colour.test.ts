import { describe, expect, it } from 'vitest';
import { DISPLAY_CEILING, SCENE_COLOUR_GLSL, displayToScene, sceneDefines, sceneToDisplay, setHdrScene } from '@/rendering/sceneColour';

describe('display-referred shaders in the HDR scene', () => {
  it('a display colour converted to a scene value comes back the same through tone mapping and encoding', () => {
    const samples: [number, number, number][] = [
      [8 / 255, 30 / 255, 105 / 255], // Earth's limb as the canvas showed it
      [0.1, 0.1, 0.1], [0.5, 0.5, 0.5], [0.9, 0.9, 0.9],
      [0.47, 0.73, 1.0].map(x => x * 0.4) as [number, number, number], // a barrier shell
      [0.6, 0.3, 0.2], [0.02, 0.02, 0.03],
    ];
    for (const display of samples) {
      const back = sceneToDisplay(displayToScene(display));
      // Measured worst case over these samples: 4 of 255 levels, on the dark, saturated limb blue.
      for (let i = 0; i < 3; i++) expect(Math.abs(back[i] - display[i]) * 255, display.join(',')).toBeLessThan(5);
    }
  });

  it('holds back the brightest display values instead of turning them into extreme HDR sources', () => {
    const white = displayToScene([1, 1, 1]);
    const ceiling = displayToScene([DISPLAY_CEILING, DISPLAY_CEILING, DISPLAY_CEILING]);
    for (let i = 0; i < 3; i++) expect(white[i]).toBeCloseTo(ceiling[i], 9);
    expect(Math.max(...white)).toBeLessThan(4);
    // An empty fragment adds nothing at all, however many transparent layers are stacked.
    for (const x of displayToScene([0, 0, 0])) expect(Math.abs(x)).toBeLessThan(1e-9);
  });

  it('is off unless the view that owns the renderer turns it on', () => {
    expect(sceneDefines()).toEqual({});
    setHdrScene(true);
    expect(sceneDefines()).toEqual({ HDR_SCENE: '' });
    setHdrScene(false);
    expect(sceneDefines()).toEqual({});
    // Without the define the helpers pass colours through untouched.
    expect(SCENE_COLOUR_GLSL).toContain('#else\nvec4 additiveOut(vec3 rgb, float alpha) { return vec4(rgb, alpha); }');
  });
});
