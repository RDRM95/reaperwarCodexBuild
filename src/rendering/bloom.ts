import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';

/**
 * Restrained HDR bloom. The scene is drawn into a half-float target, so emitters keep their real brightness
 * (engines 2.6–3.6, windows 1.3–2.5, hot Reaper seams up to 2.6, stacked additive flashes), and tone mapping
 * happens once at the end.
 *
 * Brightness alone cannot tell a light source from lit paint: measured in that target, the sunlit faces of a white
 * Alliance hull reach 8 to 10 (specular glints on pale, glossy armour), three times an engine's 3.2, while a
 * graphite Reaper never passes 1.1. What does separate them is colour. Emitters are saturated (drive blue, beam
 * red, seam orange); glints on paint are near neutral. So the high-pass takes a pixel's peak channel and asks more
 * of it the more neutral the pixel is: a coloured emitter blooms from `threshold`, a neutral highlight only from
 * `neutralThreshold`, which is set above anything a lit hull produces. This is a glow on light sources, not a haze
 * over the frame.
 */
export interface BloomConfig {
  /** Weight of the blurred highlights added back to the frame. */
  strength: number;
  /** Spread of the blur across its mip chain, 0 to 1. */
  radius: number;
  /** Peak channel, in linear scene light, from which a saturated (coloured) pixel blooms. */
  threshold: number;
  /** Peak channel from which a neutral (white or grey) pixel blooms: above the brightest glint on a lit hull. */
  neutralThreshold: number;
  /** MSAA samples of the scene target (the canvas's own antialiasing does not apply to it). */
  samples: number;
  /** Peak linear brightness of beam cores, which must be HDR to stay hot in a linear-light frame. */
  beamBoost: number;
}

export const RESTRAINED_BLOOM: BloomConfig = { strength: 0.1, radius: 0.15, threshold: 1.3, neutralThreshold: 16, samples: 4, beamBoost: 2.6 };

/** Chroma (1 − min/max channel) below which a pixel counts as neutral, and from which it counts as coloured.
 * Hull paints in the palettes run from 0.04 to 0.35 (one, the quarian, is 0.59); drive glows from 0.47 to 0.99. */
export const NEUTRAL_CHROMA = 0.3;
export const COLOURED_CHROMA = 0.45;
/** Width of the soft knee above a threshold, as a fraction of that threshold. */
export const BLOOM_KNEE = 0.3;

const smoothstep = (a: number, b: number, x: number): number => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

/** How much of a scene-linear pixel the bloom takes, 0 to 1 (the same rule as the high-pass shader below). */
export function bloomWeight(r: number, g: number, b: number, config: BloomConfig = RESTRAINED_BLOOM): number {
  const peak = Math.max(r, g, b), low = Math.min(r, g, b);
  const chroma = peak > 1e-4 ? 1 - low / peak : 0;
  const threshold = config.neutralThreshold + (config.threshold - config.neutralThreshold) * smoothstep(NEUTRAL_CHROMA, COLOURED_CHROMA, chroma);
  return smoothstep(threshold, threshold * (1 + BLOOM_KNEE), peak);
}

const EMITTER_HIGH_PASS = /* glsl */`
  uniform sampler2D tDiffuse;
  uniform vec3 defaultColor;
  uniform float defaultOpacity;
  uniform float luminosityThreshold;
  uniform float neutralThreshold;
  varying vec2 vUv;
  void main() {
    vec4 texel = texture2D(tDiffuse, vUv);
    float peak = max(texel.r, max(texel.g, texel.b));
    float low = min(texel.r, min(texel.g, texel.b));
    float chroma = peak > 0.0001 ? 1.0 - low / peak : 0.0;
    float threshold = mix(neutralThreshold, luminosityThreshold, smoothstep(${NEUTRAL_CHROMA.toFixed(2)}, ${COLOURED_CHROMA.toFixed(2)}, chroma));
    float alpha = smoothstep(threshold, threshold * ${(1 + BLOOM_KNEE).toFixed(2)}, peak);
    gl_FragColor = mix(vec4(defaultColor.rgb, defaultOpacity), texel, alpha);
  }
`;

/** The same bloom with eight-sample antialiasing of the scene, for the Ultra preset (capped by what the GPU offers). */
export const ULTRA_BLOOM: BloomConfig = { ...RESTRAINED_BLOOM, samples: 8 };

/** Bloom is part of the high and ultra presets; an explicit setting overrides it either way. */
export function bloomFor(settings: { quality: 'low' | 'medium' | 'high' | 'ultra'; bloom?: boolean }): BloomConfig | null {
  const on = settings.bloom ?? (settings.quality === 'high' || settings.quality === 'ultra');
  return on ? (settings.quality === 'ultra' ? ULTRA_BLOOM : RESTRAINED_BLOOM) : null;
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
  // Replace the luminance high-pass with the colour-aware one described above.
  const highPass = bloomPass.materialHighPassFilter;
  highPass.uniforms.neutralThreshold = { value: config.neutralThreshold };
  highPass.fragmentShader = EMITTER_HIGH_PASS;
  highPass.needsUpdate = true;
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
