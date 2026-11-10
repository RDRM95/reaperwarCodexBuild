import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';

/**
 * Restrained HDR bloom. The scene is drawn into a half-float target, so emitters keep their real brightness
 * (engines 2.6–3.6, windows 1.3–2.5, hot Reaper seams up to 2.6, stacked additive flashes); only what exceeds the
 * threshold spills light, and tone mapping happens once at the end. Sunlit hull paint and planets stay below the
 * threshold, so they stay crisp: this is a glow on light sources, not a haze over the frame.
 */
export interface BloomConfig {
  /** Weight of the blurred highlights added back to the frame. */
  strength: number;
  /** Spread of the blur across its mip chain, 0 to 1. */
  radius: number;
  /** Linear scene luminance above which a pixel blooms. White paint in full sun is about 0.85. */
  threshold: number;
  /** MSAA samples of the scene target (the canvas's own antialiasing does not apply to it). */
  samples: number;
  /** Peak linear brightness of beam cores, which must be HDR to stay hot in a linear-light frame. */
  beamBoost: number;
}

export const RESTRAINED_BLOOM: BloomConfig = { strength: 0.1, radius: 0.15, threshold: 1.3, samples: 4, beamBoost: 2.6 };

/** Bloom is part of the high preset; an explicit setting overrides it either way. */
export function bloomFor(settings: { quality: 'low' | 'medium' | 'high'; bloom?: boolean }): BloomConfig | null {
  return (settings.bloom ?? settings.quality === 'high') ? RESTRAINED_BLOOM : null;
}

export interface BloomPipeline {
  render(): void;
  setSize(width: number, height: number): void;
  /** Draw calls of the scene pass alone in the last frame (the post passes are not counted). */
  sceneDrawCalls(): number;
  dispose(): void;
}

export function createBloomPipeline(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.Camera, config: BloomConfig): BloomPipeline {
  const composer = new EffectComposer(renderer);
  composer.renderTarget1.samples = config.samples;
  composer.renderTarget2.samples = config.samples;
  const scenePass = new RenderPass(scene, camera);
  let sceneCalls = 0;
  const drawScene = scenePass.render.bind(scenePass);
  scenePass.render = (...args: Parameters<RenderPass['render']>): void => {
    drawScene(...args);
    sceneCalls = renderer.info.render.calls;
  };
  const bloomPass = new UnrealBloomPass(new THREE.Vector2(1, 1), config.strength, config.radius, config.threshold);
  const outputPass = new OutputPass();
  composer.addPass(scenePass);
  composer.addPass(bloomPass);
  composer.addPass(outputPass);
  return {
    render: () => composer.render(),
    setSize: (width, height) => composer.setSize(width, height),
    sceneDrawCalls: () => sceneCalls,
    dispose: () => { bloomPass.dispose(); outputPass.dispose(); composer.dispose(); },
  };
}
