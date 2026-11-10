/**
 * Colour hand-off for the hand-written shaders (atmosphere, starfield, barrier shells).
 *
 * Those shaders were authored display-referred: what they write is what the canvas shows. When the scene is drawn
 * into the HDR target instead (bloom on), everything in it is tone mapped and encoded afterwards, which would
 * brighten them. With HDR_SCENE defined they therefore convert their display colour to the scene value that comes
 * out the same after the output pass: sRGB decode, then the exact inverse of Three's ACES filmic fit (both matrices
 * invert; the curve is a quadratic per channel). Without the define the helpers pass the colour through unchanged,
 * so the direct-to-canvas path is byte-for-byte what it was.
 */
export const TONE_EXPOSURE = 1.05;

/** Display values above this are held back, so a white star does not become a 9× HDR source for the bloom. */
export const DISPLAY_CEILING = 0.92;

/** Shader defines for a material drawn into the HDR target (`hdr`) or straight to the canvas. */
export function sceneDefines(hdr: boolean): Record<string, string> { return hdr ? { HDR_SCENE: '' } : {}; }

// The curve of Three's ACESFilmicToneMapping: y = (v² + P v − Q) / (R v² + S v + T).
const P = 0.0245786, Q = 0.000090537, R = 0.983729, S = 0.4329510, T = 0.238081;
const ACES_IN = [[0.59719, 0.35458, 0.04823], [0.07600, 0.90834, 0.01566], [0.02840, 0.13383, 0.83777]];
const ACES_OUT = [[1.60475, -0.53108, -0.07367], [-0.10208, 1.10813, -0.00605], [-0.00327, -0.07276, 1.07602]];

type V3 = [number, number, number];
const mul = (m: number[][], v: V3): V3 => [0, 1, 2].map(i => m[i][0] * v[0] + m[i][1] * v[1] + m[i][2] * v[2]) as V3;
function invert(m: number[][]): number[][] {
  const [[a, b, c], [d, e, f], [g, h, i]] = m;
  const det = a * (e * i - f * h) - b * (d * i - f * g) + c * (d * h - e * g);
  return [[e * i - f * h, c * h - b * i, b * f - c * e], [f * g - d * i, a * i - c * g, c * d - a * f], [d * h - e * g, b * g - a * h, a * e - b * d]].map(r => r.map(x => x / det));
}
const ACES_IN_INV = invert(ACES_IN), ACES_OUT_INV = invert(ACES_OUT);
const srgbDecode = (c: number): number => c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
const srgbEncode = (c: number): number => c <= 0.0031308 ? c * 12.92 : 1.055 * Math.pow(c, 1 / 2.4) - 0.055;
const fit = (v: number): number => (v * (v + P) - Q) / (v * (R * v + S) + T);
const fitInverse = (y: number): number => {
  const a = R * y - 1, b = S * y - P, c = T * y + Q;
  return (-b - Math.sqrt(b * b - 4 * a * c)) / (2 * a);
};

/** The curve's own zero sits just above 0; taking it off for pure black makes empty fragments add exactly nothing. */
const FIT_ZERO = fitInverse(0);

/** What the output pass shows for a scene value (reference for the tests; the renderer does this on the GPU). */
export function sceneToDisplay(scene: V3, exposure = TONE_EXPOSURE): V3 {
  const v = mul(ACES_IN, scene.map(x => x * exposure / 0.6) as V3).map(fit) as V3;
  return mul(ACES_OUT, v).map(x => srgbEncode(Math.min(1, Math.max(0, x)))) as V3;
}

/** The scene value that the output pass shows as this display colour (the same maths as the GLSL below). */
export function displayToScene(display: V3, exposure = TONE_EXPOSURE): V3 {
  const linear = display.map(x => srgbDecode(Math.min(DISPLAY_CEILING, Math.max(0, x)))) as V3;
  const zero = Math.max(...linear) < 1e-6 ? FIT_ZERO : 0;
  const v = mul(ACES_OUT_INV, linear).map(y => fitInverse(Math.min(0.99, Math.max(0, y))) - zero) as V3;
  return mul(ACES_IN_INV, v).map(x => Math.max(0, x) * 0.6 / exposure) as V3;
}

const glslMat = (m: number[][]): string => `mat3(${[0, 1, 2].map(col => `vec3(${m.map(row => row[col].toFixed(8)).join(', ')})`).join(', ')})`;

/** Fragment-shader helpers: `additiveOut` for SRC_ALPHA/ONE layers, `blendedOut` for ordinary alpha blending. */
export const SCENE_COLOUR_GLSL = `
#ifdef HDR_SCENE
vec3 displayToScene(vec3 d) {
  d = clamp(d, 0.0, ${DISPLAY_CEILING.toFixed(2)});
  vec3 lin = mix(d / 12.92, pow((d + 0.055) / 1.055, vec3(2.4)), step(0.04045, d));
  vec3 y = clamp(${glslMat(ACES_OUT_INV)} * lin, 0.0, 0.99);
  vec3 a = ${R} * y - 1.0, b = ${S} * y - ${P}, c = ${T} * y + ${Q};
  vec3 v = (-b - sqrt(b * b - 4.0 * a * c)) / (2.0 * a) - ${FIT_ZERO.toFixed(8)} * (1.0 - step(0.000001, max(lin.r, max(lin.g, lin.b))));
  return max(${glslMat(ACES_IN_INV)} * v, 0.0) * ${(0.6 / TONE_EXPOSURE).toFixed(8)};
}
vec4 additiveOut(vec3 rgb, float alpha) { return vec4(displayToScene(rgb * alpha), 1.0); }
vec4 blendedOut(vec3 rgb, float alpha) { return vec4(displayToScene(rgb * alpha) / max(alpha, 0.0001), alpha); }
#else
vec4 additiveOut(vec3 rgb, float alpha) { return vec4(rgb, alpha); }
vec4 blendedOut(vec3 rgb, float alpha) { return vec4(rgb, alpha); }
#endif
`;
