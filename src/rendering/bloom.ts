import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { Pass } from 'three/examples/jsm/postprocessing/Pass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';

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
  /** Triangles of the scene pass alone in the last frame. */
  sceneTriangles(): number;
  /**
   * A second scene drawn over the first before the bloom: a bridge the camera stands on, over the battle. It is
   * drawn into a target of its own and laid over the battle by its alpha, so what it does not cover (its windows)
   * shows the battle. Null takes it away; its target is kept for the next time until `releaseOverlay`.
   */
  setOverlay(overlay: { scene: THREE.Scene; camera: THREE.Camera } | null): void;
  /** Free the overlay's target (it is as large as the scene's). Made again when an overlay is next set. */
  releaseOverlay(): void;
  dispose(): void;
}

export function createBloomPipeline(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.Camera, config: BloomConfig): BloomPipeline {
  const composer = new EffectComposer(renderer);
  composer.renderTarget1.samples = config.samples;
  composer.renderTarget2.samples = config.samples;
  const scenePass = new RenderPass(scene, camera);
  let sceneCalls = 0;
  let sceneTriangles = 0;
  const drawScene = scenePass.render.bind(scenePass);
  scenePass.render = (...args: Parameters<RenderPass['render']>): void => {
    drawScene(...args);
    sceneCalls = renderer.info.render.calls;
    sceneTriangles = renderer.info.render.triangles;
  };
  const bloomPass = new UnrealBloomPass(new THREE.Vector2(1, 1), config.strength, config.radius, config.threshold);
  // Replace the luminance high-pass with the colour-aware one described above.
  const highPass = bloomPass.materialHighPassFilter;
  highPass.uniforms.neutralThreshold = { value: config.neutralThreshold };
  highPass.fragmentShader = EMITTER_HIGH_PASS;
  highPass.needsUpdate = true;
  const outputPass = new OutputPass();
  // The overlay. It cannot be drawn into the scene's own target after the scene: that target is multisampled, and
  // once it has been resolved for the next pass its samples may be thrown away, so a second scene drawn into it
  // may find nothing under it. It has its own target, and one full-screen pass lays it over the resolved scene.
  let overlay: { scene: THREE.Scene; camera: THREE.Camera } | null = null;
  let overlayTarget: THREE.WebGLRenderTarget | undefined;
  const clearWas = new THREE.Color();
  const overlayPass = new Pass();
  overlayPass.needsSwap = false;
  overlayPass.enabled = false;
  overlayPass.render = (r: THREE.WebGLRenderer): void => {
    if (!overlay || !overlayTarget) return;
    const alphaWas = r.getClearAlpha(), autoWas = r.autoClear;
    r.getClearColor(clearWas);
    r.setRenderTarget(overlayTarget);
    r.setClearColor(0x000000, 0);
    r.autoClear = false;
    r.clear(true, true, true);
    r.render(overlay.scene, overlay.camera);
    r.setClearColor(clearWas, alphaWas);
    r.autoClear = autoWas;
  };
  const layPass = new ShaderPass({
    uniforms: { tDiffuse: { value: null }, tOverlay: { value: null } },
    vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    // Where the overlay is solid its alpha is one and it replaces the scene; its glass and holograms add their
    // light and leave the alpha as it was, so the scene shows through them.
    fragmentShader: 'uniform sampler2D tDiffuse; uniform sampler2D tOverlay; varying vec2 vUv; void main() { vec4 over = texture2D(tOverlay, vUv); gl_FragColor = vec4(over.rgb + texture2D(tDiffuse, vUv).rgb * (1.0 - clamp(over.a, 0.0, 1.0)), 1.0); }',
  });
  layPass.enabled = false;
  const sizeOverlay = (): void => {
    const width = composer.renderTarget1.width, height = composer.renderTarget1.height;
    // Four samples, two on a very large picture: the target is as large as the scene's.
    const samples = Math.min(config.samples, width * height > 6_000_000 ? 2 : 4);
    if (overlayTarget && (overlayTarget.width !== width || overlayTarget.height !== height)) { overlayTarget.dispose(); overlayTarget = undefined; }
    overlayTarget ??= new THREE.WebGLRenderTarget(width, height, { type: THREE.HalfFloatType, samples, depthBuffer: true });
    layPass.uniforms.tOverlay.value = overlayTarget.texture;
  };
  composer.addPass(scenePass);
  composer.addPass(overlayPass);
  composer.addPass(layPass);
  composer.addPass(bloomPass);
  composer.addPass(outputPass);
  return {
    render: () => composer.render(),
    setSize: (width, height) => { composer.setSize(width, height); if (overlay) sizeOverlay(); },
    sceneDrawCalls: () => sceneCalls,
    sceneTriangles: () => sceneTriangles,
    setOverlay: (next) => {
      if (next === overlay || (next && overlay && next.scene === overlay.scene && next.camera === overlay.camera)) return;
      overlay = next;
      overlayPass.enabled = layPass.enabled = overlay !== null;
      if (overlay) sizeOverlay();
    },
    releaseOverlay: () => { if (!overlay) { overlayTarget?.dispose(); overlayTarget = undefined; } },
    dispose: () => { overlayTarget?.dispose(); layPass.dispose(); bloomPass.dispose(); outputPass.dispose(); composer.dispose(); },
  };
}
