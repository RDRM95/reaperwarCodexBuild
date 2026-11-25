import * as THREE from 'three';
import type { ShipState } from '@/simulation/types';
import { buildBridge, type BridgeMaterials, type BuiltBridge } from './bridge';
import { bridgeNavy, bridgeSpec, bridgeTier } from './bridgeSpec';
import { clipPathOf, paneOutlines } from './panes';
import { ATLAS_SIZE, conditionOf, inkOf, paintInstruments, readInstruments } from './instruments';

/**
 * The bridge the cockpit camera stands on: a room of its own, lit by its own lamps, drawn in a pass of its own
 * over the battle.
 *
 * It is a separate scene on purpose. The battle's scene is tens of thousands of units across and its lights are
 * the sun and a studio fill; a room four metres wide inside a hull a few units long would need a near plane and a
 * precision the battle cannot spare, would be lit like the outside of a hull, and a lamp added for it would
 * recompile the shader of every hull in the battle. Here the eye is at the origin, the room is in metres, and its
 * lamps light nothing else. The battle is drawn first; the room is drawn over it with a fresh depth buffer, so
 * what shows through the windows is the battle and the ship's own hull can never come through the deck.
 *
 * It costs six draw calls and one small canvas repainted eight times a second while the eye is on a bridge, and
 * nothing at any other time.
 */

/** How the room's lamps answer what happens to the ship. Pure state and one step, so it can be tested. */
export interface BridgeLight {
  /** 0 all well, 0.5 action stations, 1 the hull failing: eased toward the ship's condition. */
  alert: number;
  /** A dip in the strip lights after the hull is struck, 0 to 1, dying away. */
  dip: number;
  /** A flash through the windows (the ship's own guns, a hit on its barriers), 0 and up, dying away. */
  flash: number;
  flashColour: number;
  /** What the ship was at the last step, to see what has happened to it since. */
  hull?: number;
  barriers?: number;
  ready?: number[];
  shipId?: string;
}

export const newBridgeLight = (): BridgeLight => ({ alert: 0, dip: 0, flash: 0, flashColour: 0xffffff });

const KINETIC_FLASH = 0xcfe4ff, BEAM_FLASH = 0xff7a4a, BARRIER_FLASH = 0x6fb8ff, HULL_FLASH = 0xff8a3a;

/** One step of the room's lamps. `dt` in seconds of the wall clock. */
export function stepBridgeLight(light: BridgeLight, ship: Pick<ShipState, 'id' | 'hull' | 'maxHull' | 'barriers' | 'maxBarriers' | 'weapons'>, dt: number): void {
  const condition = conditionOf(ship), want = condition === 'critical' ? 1 : condition === 'action' ? 0.5 : 0;
  if (light.shipId !== ship.id) {
    // Another ship: its bridge is as its ship is, at once, and nothing that happened to the last one flashes here.
    light.shipId = ship.id; light.alert = want; light.dip = 0; light.flash = 0;
    light.hull = ship.hull; light.barriers = ship.barriers; light.ready = undefined;
  }
  light.alert += (want - light.alert) * (1 - Math.exp(-dt * 2.5));
  light.dip *= Math.exp(-dt * 3.2);
  light.flash *= Math.exp(-dt * 5.5);
  // Struck: the barriers flare at the windows; a blow that reaches the hull dims the room for a moment.
  const hullLost = (light.hull ?? ship.hull) - ship.hull, barrierLost = (light.barriers ?? ship.barriers) - ship.barriers;
  if (hullLost > 0 && ship.maxHull > 0) {
    const blow = Math.min(1, (hullLost / ship.maxHull) * 40);
    light.dip = Math.min(1, light.dip + 0.25 + 0.75 * blow);
    if (blow > light.flash) { light.flash = Math.min(1.6, 0.4 + blow); light.flashColour = HULL_FLASH; }
  } else if (barrierLost > 0 && ship.maxBarriers > 0) {
    const blow = Math.min(1, (barrierLost / ship.maxBarriers) * 30);
    if (0.25 + 0.6 * blow > light.flash) { light.flash = 0.25 + 0.6 * blow; light.flashColour = BARRIER_FLASH; }
  }
  light.hull = ship.hull; light.barriers = ship.barriers;
  // The ship's own guns: a gun whose reload has just begun has fired; a beam lights the windows while it burns.
  const ready = ship.weapons.map((w) => w.cooldown);
  let heaviest = 0;
  for (const w of ship.weapons) if (!w.def.antiSmall && w.def.damage > heaviest) heaviest = w.def.damage;
  ship.weapons.forEach((w, i) => {
    if (w.def.antiSmall || heaviest <= 0) return;
    const weight = Math.sqrt(w.def.damage / heaviest), beam = w.beamRemaining > 0;
    const fired = light.ready !== undefined && light.ready[i] !== undefined && w.cooldown > light.ready[i] + 1e-6;
    const flash = beam ? 0.7 * weight : fired ? 1.5 * weight : 0;
    if (flash > light.flash) { light.flash = flash; light.flashColour = beam || w.def.kind.includes('beam') ? BEAM_FLASH : KINETIC_FLASH; }
  });
  light.ready = ready;
}

/** What the lamps are to be, from the state: the strip lights' brightness and how far they have gone to the alert colour. */
export function bridgeLamps(light: BridgeLight, seconds: number): { strips: number; alert: number; flash: number } {
  // The hull failing: the alert lamps beat, a little over once a second.
  const beat = light.alert > 0.75 ? 0.72 + 0.28 * Math.sin(seconds * 7) : 1;
  const flicker = light.dip > 0.02 ? 1 - light.dip * (0.55 + 0.3 * Math.sin(seconds * 61)) : 1;
  return { strips: Math.max(0.12, beat * flicker * (1 - 0.35 * light.alert)), alert: Math.min(1, Math.max(0, (light.alert - 0.5) * 2)), flash: light.flash };
}

export interface InteriorFrame {
  ship: ShipState;
  target: ShipState | undefined;
  ships: readonly ShipState[];
  /** The way to the sun in the seat's own frame (x to starboard, y up, the bow at −z), of length one. */
  sun: THREE.Vector3;
  /** The head's turn from straight ahead (radians): to starboard, and up. */
  glanceYaw: number;
  glancePitch: number;
  fov: number;
  aspect: number;
  /** Seconds of the wall clock. */
  seconds: number;
}

/** The panel texture: plates, seams and wear, so that a wall is not one flat colour. Light grey; the paint is the vertex colour. */
function panelTexture(): THREE.CanvasTexture | undefined {
  if (typeof document === 'undefined') return undefined;
  const size = 512, canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) return undefined;
  ctx.fillStyle = '#c9c9c9';
  ctx.fillRect(0, 0, size, size);
  // A fixed pattern: the same wall every time.
  let seed = 20261125;
  const rnd = (): number => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
  for (let i = 0; i < 2600; i++) {
    const v = 150 + Math.floor(rnd() * 90);
    ctx.fillStyle = `rgba(${v}, ${v}, ${v}, 0.10)`;
    ctx.fillRect(rnd() * size, rnd() * size, 2 + rnd() * 26, 1 + rnd() * 2);
  }
  // Plates: two by two to the tile (1.2 m each), a fine dark seam with a lit edge, fastenings at the corners.
  const n = 2, cell = size / n;
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) {
    const x = c * cell, y = r * cell, tone = 0.07 * (rnd() - 0.5);
    ctx.fillStyle = tone > 0 ? `rgba(255, 255, 255, ${tone})` : `rgba(0, 0, 0, ${-tone})`;
    ctx.fillRect(x, y, cell, cell);
    ctx.fillStyle = 'rgba(48, 48, 48, 0.85)'; ctx.fillRect(x, y, cell, 2); ctx.fillRect(x, y, 2, cell);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.28)'; ctx.fillRect(x + 2, y + 2, cell - 2, 1); ctx.fillRect(x + 2, y + 2, 1, cell - 2);
    // An inset service hatch on some plates.
    if (rnd() < 0.5) { ctx.strokeStyle = 'rgba(60, 60, 60, 0.55)'; ctx.lineWidth = 1.5; ctx.strokeRect(x + cell * 0.2, y + cell * 0.58, cell * 0.34, cell * 0.2); }
    ctx.fillStyle = 'rgba(40, 40, 40, 0.6)';
    for (const [dx, dy] of [[10, 10], [cell - 8, 10], [10, cell - 8], [cell - 8, cell - 8]]) { ctx.beginPath(); ctx.arc(x + dx, y + dy, 1.8, 0, Math.PI * 2); ctx.fill(); }
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}

/** A faint reflection for the glass: the room's strip lights, seen in the panes. */
function glassTexture(): THREE.CanvasTexture | undefined {
  if (typeof document === 'undefined') return undefined;
  const canvas = document.createElement('canvas');
  canvas.width = 256; canvas.height = 128;
  const ctx = canvas.getContext('2d');
  if (!ctx) return undefined;
  ctx.fillStyle = '#05080c'; ctx.fillRect(0, 0, 256, 128);
  for (const [y, a] of [[18, 0.5], [30, 0.22], [104, 0.12]] as const) {
    const g = ctx.createLinearGradient(0, 0, 256, 0);
    g.addColorStop(0, 'rgba(160, 200, 255, 0)'); g.addColorStop(0.3, `rgba(160, 200, 255, ${a})`); g.addColorStop(0.7, `rgba(160, 200, 255, ${a})`); g.addColorStop(1, 'rgba(160, 200, 255, 0)');
    ctx.fillStyle = g; ctx.fillRect(0, y, 256, 3);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

const INSTRUMENT_SECONDS = 1 / 8;
/**
 * Glass and holograms add their light and leave the picture's alpha alone. Where the room is laid over the
 * battle by its alpha (bloom.ts), a hologram that wrote its alpha would black out the battle behind it.
 */
const LIGHT_ONLY = { blending: THREE.CustomBlending, blendEquation: THREE.AddEquation, blendSrc: THREE.SrcAlphaFactor, blendDst: THREE.OneFactor,
  blendSrcAlpha: THREE.ZeroFactor, blendDstAlpha: THREE.OneFactor } as const;

export class InteriorView {
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(66, 16 / 9, 0.05, 80);
  /** Whether there is a room to draw this frame. */
  active = false;
  /** The bridge now shown. */
  bridge?: BuiltBridge;
  readonly light = newBridgeLight();
  private readonly bridges = new Map<string, BuiltBridge>();
  private readonly materials: BridgeMaterials;
  private readonly panel = panelTexture();
  private readonly reflection = glassTexture();
  private readonly canvas?: HTMLCanvasElement;
  private readonly ctx?: CanvasRenderingContext2D;
  private readonly atlas?: THREE.CanvasTexture;
  private readonly ambient = new THREE.AmbientLight(0xffffff, 0.3);
  private readonly sky = new THREE.HemisphereLight(0xffffff, 0x202020, 0.55);
  private readonly room = new THREE.PointLight(0xffffff, 9, 16, 1.6);
  private readonly helm = new THREE.PointLight(0xffffff, 3, 7, 1.8);
  private readonly plot = new THREE.PointLight(0xffffff, 1.2, 4, 1.8);
  private readonly windows = new THREE.PointLight(0xffffff, 0, 14, 1.4);
  private readonly sun = new THREE.DirectionalLight(0xfff2e0, 0);
  private readonly lampColour = new THREE.Color();
  private readonly alertColour = new THREE.Color();
  private nextPaint = 0;

  constructor() {
    if (typeof document !== 'undefined') {
      this.canvas = document.createElement('canvas');
      this.canvas.width = this.canvas.height = ATLAS_SIZE;
      this.ctx = this.canvas.getContext('2d') ?? undefined;
      if (this.ctx) {
        this.atlas = new THREE.CanvasTexture(this.canvas);
        this.atlas.colorSpace = THREE.SRGBColorSpace;
        this.atlas.generateMipmaps = false;
        this.atlas.minFilter = THREE.LinearFilter;
      }
    }
    this.materials = {
      structure: new THREE.MeshStandardMaterial({ vertexColors: true, map: this.panel ?? null, bumpMap: this.panel ?? null, bumpScale: 0.6, metalness: 0.35, roughness: 0.62 }),
      lights: new THREE.MeshBasicMaterial({ vertexColors: true }),
      trims: new THREE.MeshBasicMaterial({ vertexColors: true }),
      screens: new THREE.MeshBasicMaterial({ map: this.atlas ?? null, color: this.atlas ? 0xffffff : 0x0a1420 }),
      holograms: new THREE.MeshBasicMaterial({ map: this.atlas ?? null, color: this.atlas ? 0xffffff : 0x000000, transparent: true, depthWrite: false, side: THREE.DoubleSide, ...LIGHT_ONLY }),
      glass: new THREE.MeshBasicMaterial({ map: this.reflection ?? null, color: 0x8fb4e0, transparent: true, opacity: 0.16, depthWrite: false, side: THREE.DoubleSide, ...LIGHT_ONLY }),
    };
    this.scene.add(this.ambient, this.sky, this.room, this.helm, this.plot, this.windows, this.sun, this.sun.target, this.camera);
  }

  /** Light the room's metal from the same surroundings as the hulls outside. */
  setEnvironment(texture: THREE.Texture | null): void {
    this.scene.environment = texture;
    this.scene.environmentIntensity = 0.3;
  }

  /** Stand on this ship's bridge. Built the first time a bridge of its size and navy is asked for, and kept. */
  show(ship: Pick<ShipState, 'role' | 'faction'>): void {
    const key = `${bridgeTier(ship.role)}:${bridgeNavy(ship.faction)}`;
    if (this.bridge && this.active && this.bridge.group.userData.key === key) return;
    let built = this.bridges.get(key);
    if (!built) {
      built = buildBridge(bridgeSpec(ship.role, ship.faction), this.materials);
      built.group.userData.key = key;
      this.bridges.set(key, built);
    }
    if (this.bridge && this.bridge !== built) this.scene.remove(this.bridge.group);
    this.bridge = built;
    this.scene.add(built.group);
    const p = built.spec.palette;
    this.lampColour.setHex(p.light);
    this.alertColour.setHex(p.alert);
    this.room.position.copy(built.lamps.room);
    this.helm.position.copy(built.lamps.helm); this.helm.color.setHex(p.haptic);
    this.plot.position.copy(built.lamps.plot); this.plot.color.setHex(p.plot);
    this.windows.position.copy(built.lamps.windows);
    this.sky.groundColor.setRGB(p.deck[0], p.deck[1], p.deck[2]);
    this.active = true;
    this.nextPaint = 0;
  }

  hide(): void {
    this.active = false;
  }

  /** The windows' outlines in a picture of this size, as a CSS `clip-path`: for what is drawn over the battle and belongs in the windows. */
  windowClip(width: number, height: number): string {
    if (!this.active || !this.bridge) return '';
    return clipPathOf(paneOutlines(this.bridge.panes, this.camera.quaternion, this.camera.fov, this.camera.aspect, width, height));
  }

  /** Each frame while the eye is on the bridge: the head, the lamps, and (eight times a second) the instruments. */
  update(dt: number, frame: InteriorFrame): void {
    const bridge = this.bridge;
    if (!this.active || !bridge) return;
    this.camera.fov = frame.fov;
    this.camera.aspect = frame.aspect;
    this.camera.rotation.set(frame.glancePitch, -frame.glanceYaw, 0, 'YXZ');
    this.camera.updateProjectionMatrix();

    stepBridgeLight(this.light, frame.ship, dt);
    const lamps = bridgeLamps(this.light, frame.seconds);
    const colour = (this.materials.lights as THREE.MeshBasicMaterial).color.copy(this.lampColour).lerp(this.alertColour, lamps.alert).multiplyScalar(lamps.strips);
    this.room.color.copy(this.lampColour).lerp(this.alertColour, lamps.alert);
    this.room.intensity = 9 * lamps.strips;
    this.ambient.color.copy(colour);
    this.sky.color.copy(this.room.color);
    this.sky.intensity = 0.55 * lamps.strips;
    // The sun comes in by the windows: all of it from ahead and above, none from astern.
    const through = THREE.MathUtils.smoothstep(-frame.sun.z, -0.15, 0.55) * 0.75 + THREE.MathUtils.smoothstep(frame.sun.y, 0.2, 0.9) * 0.25;
    this.sun.intensity = 2.4 * through;
    this.sun.position.copy(frame.sun).multiplyScalar(30);
    this.sun.target.position.set(0, 0, 0);
    this.windows.color.setHex(this.light.flashColour);
    this.windows.intensity = 14 * lamps.flash;

    if (this.ctx && this.atlas && frame.seconds >= this.nextPaint) {
      this.nextPaint = frame.seconds + INSTRUMENT_SECONDS;
      paintInstruments(this.ctx, readInstruments(frame.ship, frame.target, frame.ships), inkOf(bridge.spec.palette, bridge.spec.navy), frame.seconds);
      this.atlas.needsUpdate = true;
    }
  }

  dispose(): void {
    for (const built of this.bridges.values()) built.group.traverse((o) => (o as THREE.Mesh).geometry?.dispose());
    this.bridges.clear();
    for (const material of Object.values(this.materials)) material.dispose();
    this.panel?.dispose();
    this.reflection?.dispose();
    this.atlas?.dispose();
  }
}
