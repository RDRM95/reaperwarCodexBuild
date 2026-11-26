import * as THREE from 'three';

/**
 * Nuclear detonations in vacuum.
 *
 * There is no air: no fireball that rises, no smoke, no blast wave. What there is, in order: a flash far brighter
 * and far shorter than anything else in the battle; the warhead and whatever it touched as a cloud of luminous
 * vapour that runs outward and cools from white through yellow and orange to a dull red in a second or two; and
 * fragments, where something solid was struck, thrown out white-hot and cooling as they go. Any shell drawn here
 * is that vapour, not a pressure wave.
 *
 * Two weapons, two pictures, each from what the simulation says happened:
 *
 *   external  a warhead that goes off against a barrier or a hull (a `warhead: 'nuclear'` missile or torpedo): the
 *             flash and the cloud stand off the surface that stopped it, on the side it came from.
 *   internal  a HADES penetrator's warhead, which the simulation detonates inside a hull only after the round has
 *             reached it (`hades_detonation`): a beat after the strike, light from inside the hull, shafts of it
 *             out through the plating, and no ball of fire outside. A round that was stopped is never one of these.
 *
 * The weight of an internal detonation is its tier, from the warhead's own damage in the simulation. Tiers differ
 * in what happens, not only in how large it is drawn (`planDetonation`).
 *
 * Everything is drawn by one instanced mesh with a procedural shader (no texture), so a salvo of a hundred
 * detonations is one draw call; fragments go to the effects system's spark batches. Nothing here makes a light:
 * the plan says how much light a detonation asks for and the effects system gives its one pooled light to the
 * strongest.
 */
export type DetonationKind = 'internal' | 'external';
/** 0 an escort's round … 4 a NOVA or KRONOS round. */
export type DetonationTier = 0 | 1 | 2 | 3 | 4;

/** Warhead damage (simulation points) from which a detonation is of each tier above 0. */
export const TIER_PAYLOAD = [60, 600, 3000, 30_000] as const;

export function detonationTier(payload: number): DetonationTier {
  let tier = 0;
  for (const from of TIER_PAYLOAD) if (payload >= from) tier++;
  return tier as DetonationTier;
}

/** Seconds: the flash, and the beat between a penetrator's strike and its warhead (longer for a heavier round, which goes deeper). */
export const FLASH_SECONDS = 0.09;
export const PENETRATION_DELAY = [0.12, 0.14, 0.17, 0.2, 0.24] as const;

export interface DetonationPlan {
  kind: DetonationKind;
  tier: DetonationTier;
  /** Seconds from the strike to the detonation (internal only). */
  delay: number;
  /** The characteristic size, in render units (1 = 100 m): the white core inside a hull, or the vapour cloud outside one. */
  radius: number;
  /** The flash: its size and peak brightness (1 is a main gun's muzzle flash). */
  flash: { radius: number; intensity: number };
  /** Internal: shafts of light out through the hull, their length and how long they last. */
  rays: { count: number; length: number; life: number };
  /** Internal: the warhead burns in pulses (a heavy round sets off more than itself). */
  pulses: number;
  /** External, or the far side of a hull a tier-4 round has gone through: the cloud of vapour, and its bright shell. */
  cloud: { radius: number; life: number; shell: boolean } | undefined;
  /** The glow left where it went off, cooling: seconds. */
  ember: number;
  /** Incandescent fragments thrown, and how fast (render units a second). */
  fragments: { count: number; speed: number };
  /** Light asked of the pooled lamp, and for how long. */
  light: { intensity: number; life: number };
  /** How far the camera's exposure is pulled down when this fills the picture (0 to 1), and for how long it recovers. */
  exposure: { dip: number; recovery: number };
  /** Camera shake when it is close (the rig's own measure, 0 to 1). */
  shake: number;
  /** A streak across the picture, as a sensor blooms: tiers 3 and 4 and every external detonation. */
  streak: boolean;
}

/**
 * What a detonation is, from the simulation's own figures: `payload` is the warhead's damage (for an internal
 * detonation the share of the round the simulation reserved for it), `targetLength` the struck hull's length in
 * render units, `hullDamage` what reached the hull (fragments are of the hull: none where none was reached).
 */
export function planDetonation(kind: DetonationKind, payload: number, targetLength: number, hullDamage: number): DetonationPlan {
  const tier = detonationTier(payload), weight = Math.log10(1 + Math.max(0, payload) / 40);
  if (kind === 'external') {
    const radius = 0.9 + 1.5 * weight;
    return {
      kind, tier, delay: 0, radius,
      flash: { radius: radius * 3.2, intensity: 3 + tier },
      rays: { count: 0, length: 0, life: 0 }, pulses: 1,
      cloud: { radius, life: 1.3 + 0.3 * tier, shell: true },
      ember: 0,
      fragments: { count: hullDamage > 0 ? 8 + 5 * tier : 0, speed: radius * 2.6 },
      light: { intensity: 26 * radius, life: 0.5 + 0.15 * tier },
      exposure: { dip: Math.min(0.75, 0.35 + 0.1 * tier), recovery: 0.9 + 0.2 * tier },
      shake: Math.min(0.5, 0.1 + 0.07 * tier),
      streak: true,
    };
  }
  // Inside a hull: never larger than the hull lets it be.
  const radius = Math.min(Math.max(0.2, targetLength * 0.5), 0.3 + 0.55 * weight);
  return {
    kind, tier, delay: PENETRATION_DELAY[tier], radius,
    // The glare of it through plating, not a ball outside the hull.
    flash: { radius: radius * (1.1 + 0.25 * tier), intensity: 1.2 + 0.9 * tier },
    // An escort's round is a glint through the plating; a dreadnought's throws shafts of light; a NOVA round's go right through.
    rays: { count: [0, 2, 4, 6, 9][tier], length: radius * (2.4 + tier), life: 0.3 + 0.16 * tier },
    pulses: tier >= 4 ? 3 : tier === 3 ? 2 : 1,
    cloud: tier >= 4 ? { radius: radius * 1.8, life: 1.6, shell: false } : undefined,
    ember: [0, 0.5, 1.1, 2.2, 3.4][tier],
    fragments: { count: hullDamage > 0 ? [0, 3, 8, 14, 22][tier] : 0, speed: radius * (2.2 + 0.5 * tier) },
    light: { intensity: tier >= 2 ? 9 * radius * tier : 0, life: 0.25 + 0.12 * tier },
    exposure: { dip: [0, 0, 0.12, 0.3, 0.55][tier], recovery: 0.5 + 0.25 * tier },
    shake: [0, 0, 0.05, 0.14, 0.3][tier],
    streak: tier >= 3,
  };
}

/**
 * The colour of vapour as it cools, linear RGB, `heat` from 1 (just released) to 0 (gone): white with a little
 * blue, yellow-white, orange, dull red. The shader below holds the same curve.
 */
export function vapourColour(heat: number): [number, number, number] {
  const h = Math.min(1, Math.max(0, heat));
  const stops: [number, [number, number, number]][] = [[0, [0.18, 0.015, 0.004]], [0.3, [0.85, 0.2, 0.04]], [0.58, [1, 0.62, 0.2]], [0.82, [1, 0.94, 0.72]], [1, [0.96, 0.98, 1.1]]];
  for (let i = 1; i < stops.length; i++) if (h <= stops[i][0]) {
    const [a, ca] = stops[i - 1], [b, cb] = stops[i], t = (h - a) / (b - a);
    return [ca[0] + (cb[0] - ca[0]) * t, ca[1] + (cb[1] - ca[1]) * t, ca[2] + (cb[2] - ca[2]) * t];
  }
  return stops[stops.length - 1][1];
}

/** How bright vapour is as it cools: it falls away fast, as a thing with no air round it to keep it hot. */
export const vapourBrightness = (age: number): number => (1 - Math.min(1, Math.max(0, age))) ** 2.2;

/** How far a cloud has run at `age` (0 to 1 of its life), as a share of its final radius: fast, then slowing. */
export const cloudReach = (age: number): number => 0.12 + 0.88 * (1 - Math.exp(-4 * Math.min(1, Math.max(0, age)))) / (1 - Math.exp(-4));

const VERTEX = /* glsl */`
attribute vec4 centre;
attribute vec4 aim;
attribute vec4 state;
varying vec2 vUv;
varying vec4 vState;
#include <common>
#include <logdepthbuf_pars_vertex>
void main() {
  vUv = uv;
  vState = state;
  vec4 mv = modelViewMatrix * vec4(centre.xyz, 1.0);
  if (state.y > 3.5) {
    // A streak across the picture: wide, thin, level.
    mv.xy += position.xy * vec2(centre.w * 2.0, aim.w);
  } else if (state.y > 2.5) {
    // A shaft: from its root along its own direction, foreshortened as a real one is.
    vec3 along = (modelViewMatrix * vec4(aim.xyz, 0.0)).xyz;
    vec2 planar = along.xy;
    vec2 across = length(planar) > 1e-5 ? normalize(vec2(-planar.y, planar.x)) : vec2(0.0, 1.0);
    mv.xyz += along * (position.x + 0.5) * centre.w;
    mv.xy += across * position.y * aim.w;
  } else {
    mv.xy += position.xy * centre.w * 2.0;
  }
  gl_Position = projectionMatrix * mv;
  #include <logdepthbuf_vertex>
}
`;

const FRAGMENT = /* glsl */`
uniform float boost;
varying vec2 vUv;
varying vec4 vState;
#include <common>
#include <logdepthbuf_pars_fragment>
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float grain(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
}
// Vapour cooling: the same stops as vapourColour().
vec3 vapour(float heat) {
  heat = clamp(heat, 0.0, 1.0);
  vec3 c = mix(vec3(0.18, 0.015, 0.004), vec3(0.85, 0.2, 0.04), smoothstep(0.0, 0.3, heat));
  c = mix(c, vec3(1.0, 0.62, 0.2), smoothstep(0.3, 0.58, heat));
  c = mix(c, vec3(1.0, 0.94, 0.72), smoothstep(0.58, 0.82, heat));
  return mix(c, vec3(0.96, 0.98, 1.1), smoothstep(0.82, 1.0, heat));
}
void main() {
  #include <logdepthbuf_fragment>
  float age = vState.x, kind = vState.y, seed = vState.z;
  float r = length(vUv - 0.5) * 2.0;
  float fade = pow(1.0 - age, 2.2);
  vec3 colour;
  // Sampled round a circle, so that an outline that varies with direction has no seam.
  vec2 p = vUv - 0.5;
  vec2 round = r > 1e-4 ? p / (0.5 * r) : vec2(1.0, 0.0);
  if (kind < 0.5) {
    // The flash: a point too bright to look at and the glare round it, gone to nothing by its edge.
    colour = vec3(1.0, 0.985, 0.95) * (exp(-r * r * 26.0) * 3.0 + exp(-r * r * 5.0) * 0.4) * smoothstep(1.0, 0.5, r) * (1.0 - age);
  } else if (kind < 1.5) {
    // The cloud of vapour: no two sides of it alike, mottled, brightest toward its rim (the eye looks through more
    // of it there), and cooling from its edge inward as it thins.
    float lump = grain(round * 1.6 + seed * 40.0);
    float n = grain(vUv * 7.0 + seed * 17.0) * 0.55 + grain(vUv * 15.0 - seed * 9.0) * 0.45;
    float edge = 0.6 + 0.34 * lump;
    float body = (1.0 - smoothstep(edge - 0.3, edge + 0.06 * n, r)) * (0.5 + 0.8 * n);
    float heat = 1.0 - age * 1.2 - r * 0.32 + (n - 0.5) * 0.34;
    colour = vapour(heat) * (0.3 + 0.9 * smoothstep(0.05, edge, r)) * body * fade;
  } else if (kind < 2.5) {
    // The fastest vapour, ahead of the rest: thin, in broken arcs, at no one distance. It is material, not a wave.
    float lump = grain(round * 2.3 + seed * 31.0);
    float gap = smoothstep(0.42, 0.7, grain(round * 4.1 - seed * 13.0)) * smoothstep(0.2, 0.5, grain(round * 9.0 + seed * 5.0));
    float ring = exp(-pow((r / (0.78 + 0.2 * lump) - 1.0) / 0.05, 2.0)) * step(r, 1.0);
    colour = vapour(0.95 - age * 1.3) * ring * gap * (0.4 + 0.6 * lump) * fade;
  } else if (kind < 3.5) {
    // A shaft of light out through plating: white at its root, cooling and thinning to its tip.
    float along = vUv.x, across = abs(vUv.y - 0.5) * 2.0;
    float body = exp(-across * across * (7.0 + 14.0 * along)) * pow(1.0 - along, 1.4);
    colour = vapour(1.0 - age * 0.6 - along * 0.45) * body * 1.8 * (1.0 - age);
  } else if (kind < 4.5) {
    // The streak a sensor makes of a point too bright for it.
    vec2 q = p * 2.0;
    colour = vec3(0.82, 0.9, 1.0) * exp(-q.y * q.y * 9.0) * pow(max(0.0, 1.0 - abs(q.x)), 2.4) * (1.0 - age);
  } else {
    // An ember: what is left glowing where it went off.
    colour = vapour(0.62 - age * 0.62) * exp(-r * r * 5.0) * (1.0 - age);
  }
  gl_FragColor = vec4(colour * vState.w * boost, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

const FLASH = 0, CLOUD = 1, SHELL = 2, RAY = 3, STREAK = 4, EMBER = 5;

interface Part {
  kind: number;
  /** Where it is, measured from `anchor()` when it has one (a hull that moves), else in the world. */
  offset: THREE.Vector3;
  anchor?: () => THREE.Vector3 | undefined;
  direction: THREE.Vector3;
  from: number;
  to: number;
  width: number;
  age: number;
  life: number;
  seed: number;
  intensity: number;
  /** Drawn through whatever is in front of it: light inside a hull. */
  through: boolean;
}

export interface DetonationMoment {
  plan: DetonationPlan;
  position: THREE.Vector3;
  /** Away from the hull: the way fragments and an external cloud go. */
  outward: THREE.Vector3;
  velocity: THREE.Vector3;
}

interface Pending { at: number; moment: DetonationMoment; anchor?: () => THREE.Vector3 | undefined; local: THREE.Vector3 }

const STRIDE = 4;

class PartBatch {
  readonly mesh: THREE.Mesh<THREE.InstancedBufferGeometry, THREE.ShaderMaterial>;
  private readonly centres: Float32Array;
  private readonly aims: Float32Array;
  private readonly states: Float32Array;
  private readonly attributes: THREE.InstancedBufferAttribute[];
  used = 0;
  constructor(readonly capacity: number, depthTest: boolean) {
    this.centres = new Float32Array(capacity * STRIDE); this.aims = new Float32Array(capacity * STRIDE); this.states = new Float32Array(capacity * STRIDE);
    const geometry = new THREE.InstancedBufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute([-0.5, -0.5, 0, 0.5, -0.5, 0, 0.5, 0.5, 0, -0.5, 0.5, 0], 3));
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 1, 0, 1, 1, 0, 1], 2));
    geometry.setIndex([0, 1, 2, 0, 2, 3]);
    this.attributes = [this.centres, this.aims, this.states].map((array) => new THREE.InstancedBufferAttribute(array, STRIDE).setUsage(THREE.DynamicDrawUsage));
    geometry.setAttribute('centre', this.attributes[0]); geometry.setAttribute('aim', this.attributes[1]); geometry.setAttribute('state', this.attributes[2]);
    geometry.instanceCount = 0;
    this.mesh = new THREE.Mesh(geometry, new THREE.ShaderMaterial({ uniforms: { boost: { value: 1 } }, vertexShader: VERTEX, fragmentShader: FRAGMENT,
      transparent: true, depthWrite: false, depthTest, blending: THREE.AdditiveBlending }));
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 6;
  }
  push(p: Part, at: THREE.Vector3, size: number): void {
    if (this.used >= this.capacity) return;
    const o = this.used++ * STRIDE;
    this.centres[o] = at.x; this.centres[o + 1] = at.y; this.centres[o + 2] = at.z; this.centres[o + 3] = size;
    this.aims[o] = p.direction.x; this.aims[o + 1] = p.direction.y; this.aims[o + 2] = p.direction.z; this.aims[o + 3] = p.width;
    this.states[o] = Math.min(1, p.age / p.life); this.states[o + 1] = p.kind; this.states[o + 2] = p.seed; this.states[o + 3] = p.intensity;
  }
  commit(): void {
    this.mesh.geometry.instanceCount = this.used;
    for (const attribute of this.attributes) attribute.needsUpdate = true;
  }
}

/** How many parts may be alive at once. A full salvo of light rounds is one part each; past this the lightest are not drawn. */
export const DETONATION_PARTS = 384;

export class NuclearDetonations {
  readonly group = new THREE.Group();
  private readonly open = new PartBatch(DETONATION_PARTS, true);
  private readonly inside = new PartBatch(128, false);
  private parts: Part[] = [];
  private pending: Pending[] = [];
  private clock = 0;
  private serial = 0;
  private readonly at = new THREE.Vector3();
  /** Flash brightness, 1 or less: the reduced-flash setting. */
  flashScale = 1;
  /** Called at the moment a detonation goes off (after a penetrator's delay): for fragments, light, exposure, shake and sound. */
  onDetonation?: (moment: DetonationMoment) => void;
  /** Detonations asked for, and parts not drawn because the batch was full: for the performance record. */
  readonly stats = { detonations: 0, dropped: 0 };

  constructor() {
    this.group.add(this.open.mesh, this.inside.mesh);
  }

  get liveParts(): number { return this.parts.length; }
  get waiting(): number { return this.pending.length; }

  /** Colours above 1 are kept as they are when the scene is drawn for bloom, so the flash can be as bright as it is. */
  setHdr(boost: number): void {
    this.open.mesh.material.uniforms.boost.value = boost;
    this.inside.mesh.material.uniforms.boost.value = boost;
  }

  /**
   * A detonation. `anchor` is the struck hull's centre as it moves (the detonation stays in the hull); without one
   * it stays where it happened. `detail` is how much of it to draw: 1 all of it, 0 its flash alone (a detonation a
   * few pixels across at the far side of the battle).
   */
  detonate(plan: DetonationPlan, position: THREE.Vector3, outward: THREE.Vector3, velocity: THREE.Vector3, anchor?: () => THREE.Vector3 | undefined, detail = 1): void {
    this.stats.detonations++;
    const centre = anchor?.();
    const moment: DetonationMoment = { plan: detail >= 0.5 ? plan : { ...plan, rays: { ...plan.rays, count: 0 }, cloud: undefined, ember: 0, fragments: { ...plan.fragments, count: 0 }, pulses: 1, streak: false },
      position: position.clone(), outward: outward.clone().normalize(), velocity: velocity.clone() };
    this.pending.push({ at: this.clock + plan.delay, moment, anchor: centre ? anchor : undefined, local: centre ? position.clone().sub(centre) : position.clone() });
  }

  private add(kind: number, offset: THREE.Vector3, anchor: (() => THREE.Vector3 | undefined) | undefined, from: number, to: number, life: number, intensity: number,
    through = false, direction?: THREE.Vector3, width = 0, age = 0): void {
    // Full: the lightest things give way first (an ember, a shell), a flash never.
    if (this.parts.length >= DETONATION_PARTS + 96 || (this.parts.length >= DETONATION_PARTS * 0.85 && (kind === EMBER || kind === SHELL))) { this.stats.dropped++; return; }
    this.parts.push({ kind, offset: offset.clone(), anchor, direction: direction?.clone() ?? new THREE.Vector3(), from, to, width, age, life, seed: (this.serial++ * 0.6180339887) % 1, intensity, through });
  }

  private release(entry: Pending): void {
    const { moment, anchor, local } = entry, { plan } = moment;
    const centre = anchor?.();
    if (centre) moment.position.copy(centre).add(local);
    const offset = anchor && centre ? local : moment.position;
    const hold = anchor && centre ? anchor : undefined;
    const flash = this.flashScale;
    if (plan.kind === 'external') {
      // Off the surface that stopped it, on the side it came from.
      const stand = offset.clone().addScaledVector(moment.outward, plan.radius * 0.35);
      this.add(FLASH, stand, hold, plan.flash.radius * 0.6, plan.flash.radius, FLASH_SECONDS * 1.4, plan.flash.intensity * flash);
      if (plan.streak) this.add(STREAK, stand, hold, plan.flash.radius * 1.1, plan.flash.radius * 1.7, 0.2, 0.9 * flash, false, undefined, plan.radius * 0.3);
      if (plan.cloud) {
        this.add(CLOUD, stand, hold, 0, plan.cloud.radius, plan.cloud.life, 1.25);
        if (plan.cloud.shell) this.add(SHELL, stand, hold, 0, plan.cloud.radius * 2.1, plan.cloud.life * 0.55, 0.9);
      }
    } else {
      // Inside the hull: seen through it for as long as it is white-hot, then only where it has come out.
      for (let pulse = 0; pulse < plan.pulses; pulse++) {
        const age = -pulse * 0.11, shift = pulse === 0 ? offset : offset.clone().addScaledVector(moment.outward, -plan.radius * 0.9 * pulse);
        this.add(FLASH, shift, hold, plan.flash.radius * 0.5, plan.flash.radius, FLASH_SECONDS * (1.2 + 0.4 * plan.tier), plan.flash.intensity * flash, true, undefined, 0, age);
      }
      if (plan.ember > 0) this.add(EMBER, offset, hold, plan.radius * 1.1, plan.radius * 0.7, plan.ember, 1.3, true);
      for (let i = 0; i < plan.rays.count; i++) {
        // Shafts out through the plating: most of them back the way the round came in, the rest wherever the hull gave.
        const u = (i + 0.5) / plan.rays.count, turn = i * 2.399963229728653, spread = i % 3 === 0 ? 0.45 : 1.25;
        const way = new THREE.Vector3(Math.cos(turn) * Math.sin(spread * (0.4 + u)), Math.sin(turn) * Math.sin(spread * (0.4 + u)), Math.cos(spread * (0.4 + u)));
        way.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), moment.outward));
        this.add(RAY, offset, hold, plan.rays.length * 0.35, plan.rays.length * (0.7 + 0.6 * ((i * 0.618) % 1)), plan.rays.life * (0.7 + 0.6 * u), 1.6, false, way, plan.radius * (0.5 + 0.25 * plan.tier), -0.03 * (i % 4));
      }
      if (plan.streak) this.add(STREAK, offset, hold, plan.flash.radius * 1.4, plan.flash.radius * 2.2, 0.18, 0.8 * flash, true, undefined, plan.radius * 0.25);
      // A round of the heaviest tier goes on through: its vapour comes out of the far side.
      if (plan.cloud) this.add(CLOUD, offset.clone().addScaledVector(moment.outward, -plan.radius * 2.2), hold, 0, plan.cloud.radius, plan.cloud.life, 1.1);
    }
    this.onDetonation?.(moment);
  }

  update(dt: number): void {
    this.clock += dt;
    // What goes off during this step begins at the end of it: a long step must not age a flash past its life
    // before it has been drawn once.
    const born = this.parts.length;
    if (this.pending.length) {
      const waiting: Pending[] = [];
      for (const entry of this.pending) if (entry.at <= this.clock) this.release(entry); else waiting.push(entry);
      this.pending = waiting;
    }
    this.open.used = 0; this.inside.used = 0;
    const keep: Part[] = [];
    for (let i = 0; i < this.parts.length; i++) {
      const p = this.parts[i];
      if (i < born) p.age += dt;
      if (p.age >= p.life) continue;
      keep.push(p);
      if (p.age < 0) continue; // a later pulse: not yet
      const centre = p.anchor?.();
      if (p.anchor && !centre) continue; // its hull is gone from the picture: so is the light inside it
      const at = centre ? this.at.copy(centre).add(p.offset) : p.offset;
      const t = p.age / p.life, size = p.kind === CLOUD || p.kind === SHELL ? p.to * cloudReach(t) : p.from + (p.to - p.from) * t;
      (p.through ? this.inside : this.open).push(p, at, size);
    }
    this.parts = keep;
    this.open.commit(); this.inside.commit();
  }

  clear(): void {
    this.parts = []; this.pending = [];
    this.open.used = 0; this.inside.used = 0;
    this.open.commit(); this.inside.commit();
  }

  dispose(): void {
    for (const batch of [this.open, this.inside]) { batch.mesh.geometry.dispose(); batch.mesh.material.dispose(); }
  }
}
