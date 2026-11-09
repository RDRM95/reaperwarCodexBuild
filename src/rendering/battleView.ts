import * as THREE from 'three';
import { Rng } from '@/core/rng';
import { cinematicPair, cinematicWing } from './director';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import type { BattleSimulation } from '@/simulation/battle';
import { SIM_DT } from '@/simulation/battle';
import type { BattleEvent, ShipState } from '@/simulation/types';
import { getFaction } from '@/data/factions';
import { CameraRig, type CameraSubject, type CinematicFrame } from './cameras';
import { EffectsSystem } from './effects';
import { buildEnvironment, disposeEnvironment, type EnvironmentBuild } from './environment';
import { KM } from './geometry';
import { instantiateShip, getShipTemplate, type BuiltShip } from './ships';
import { InstancedFleet } from './instancedFleet';
import { DETAIL_MESH_NAMES, lodLevelSquared, type LodLevel } from './lod';
import { weaponBeamOrigin, weaponFlashPose } from './weaponFlash';
import { weaponWorldOffset } from '@/simulation/fireControl';
import { primaryGunneryMount,isMainGunShot,gunneryFrame } from './gunnery';
import { animateReaperRig, captureReaperRig, isArticulatedReaper, selectReaperRigDetail, type ReaperRig } from './reaperMotion';

/**
 * Binds a BattleSimulation to a Three.js scene. The simulation owns all
 * state; this class only reads it (with interpolation between fixed steps)
 * and reacts to its events.
 */

export interface ShipVisual {
  ship: ShipState;
  built: BuiltShip;
  glows: THREE.Sprite[];
  dying?: { timer: number; duration: number; nextSecondary: number };
  removed: boolean;
  /** Unique materials for damage tinting (cloned lazily on first damage). */
  tinted: boolean;
  /** Cached unique hull materials: no whole-ship traversal each frame. */
  tintedMats?: THREE.MeshStandardMaterial[];
  /** Current level of detail. */
  lod: LodLevel;
  reaperRig?: ReaperRig;
}

export interface GraphicsSettings {
  quality: 'low' | 'medium' | 'high';
  showEngineGlow: boolean;
  pixelRatioCap: number;
  /** Distance-based level of detail (default on). */
  lod?: boolean;
}

const INITIAL_FAR_POINTS = 2048;

export class BattleView {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly rig: CameraRig;
  readonly effects = new EffectsSystem();
  readonly instances = new InstancedFleet();
  private readonly MAX_HERO_VISUALS = 96;
  private readonly frustum = new THREE.Frustum();
  private readonly frustumMatrix = new THREE.Matrix4();
  private readonly sphere = new THREE.Sphere();
  readonly visuals = new Map<string, ShipVisual>();
  env!: EnvironmentBuild;
  sim: BattleSimulation;
  /** Interpolation alpha within the current fixed step (0..1). */
  alpha = 0;
  selectedIds = new Set<string>();
  followId?: string;
  /** A gunnery camera can never jump to another hull after locking. */
  gunneryLockedShipId?: string;
  gunneryShot?: {t:number;shipId:string;targetId:string;weaponIndex:number;kind:string};
  gunnerySignalUntilMs=0;
  get gunnerySignalLost():boolean {return this.rig.mode==='gunnery'&&performance.now()<this.gunnerySignalUntilMs;}

  /** Cinematic director state. */
  private directorRng = new Rng(1);
  private cine: { fromId?: string; toId?: string; age: number; hold: number; wreck?: boolean; members?: string[] } = { age: 0, hold: 0 };
  private cineShot = 0;
  private projectileTrack?: { id: number };
  private nextBeamShieldAt = new Map<string, number>();
  private readonly glowTex: THREE.Texture;
  private sunLight: THREE.DirectionalLight;
  private fillLight: THREE.DirectionalLight;
  private readonly tmpA = new THREE.Vector3();
  private readonly tmpB = new THREE.Vector3();
  private readonly tmpQ = new THREE.Quaternion();
  private readonly fwd = new THREE.Vector3(0, 0, 1);
  settings: GraphicsSettings;
  private eventQueue: BattleEvent[] = [];
  /** Shared point cloud for ships beyond mesh range (one draw call). */
  private readonly farPoints: THREE.Points;
  private farPositions = new Float32Array(INITIAL_FAR_POINTS * 3);
  private farColours = new Float32Array(INITIAL_FAR_POINTS * 3);
  private readonly tmpColour = new THREE.Color();
  private readonly farColourCache = new Map<string, readonly [number, number, number]>();
  /** Draw calls of the last rendered frame. */
  drawCalls = 0;
  lodCounts = { full: 0, reduced: 0, point: 0 };

  constructor(canvas: HTMLCanvasElement, sim: BattleSimulation, settings: GraphicsSettings) {
    this.settings = settings;
    this.instances.configure(settings.quality);
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: settings.quality !== 'low', powerPreference: 'high-performance', logarithmicDepthBuffer: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, settings.pixelRatioCap));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.rig = new CameraRig(canvas.clientWidth / Math.max(1, canvas.clientHeight));
    // Image-based lighting so metallic hull plating reads as metal rather than
    // black: a neutral PMREM environment at low intensity.
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    this.scene.environmentIntensity = 0.35;
    pmrem.dispose();
    this.sim = sim;

    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const ctx = c.getContext('2d')!;
    const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.3, 'rgba(255,255,255,0.6)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 64, 64);
    this.glowTex = new THREE.CanvasTexture(c);

    this.sunLight = new THREE.DirectionalLight(0xfff2e0, 2.6);
    this.scene.add(this.sunLight);
    this.scene.add(new THREE.HemisphereLight(0x8fb4ff, 0x1a1420, 0.7));
    this.scene.add(new THREE.AmbientLight(0x404a60, 0.45));
    // Camera-relative fill so hulls stay readable when viewed against the sun.
    this.fillLight = new THREE.DirectionalLight(0xb8c8e8, 0.9);
    this.scene.add(this.fillLight, this.fillLight.target);
    this.scene.add(this.effects.group, this.instances.group);
    const farGeom = new THREE.BufferGeometry();
    farGeom.setAttribute('position', new THREE.BufferAttribute(this.farPositions, 3));
    farGeom.setAttribute('color', new THREE.BufferAttribute(this.farColours, 3));
    farGeom.setDrawRange(0, 0);
    this.farPoints = new THREE.Points(farGeom, new THREE.PointsMaterial({ size: 2.2, vertexColors: true, map: this.glowTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, sizeAttenuation: true }));
    this.farPoints.frustumCulled = false;
    this.farPoints.name = 'far-points';
    this.scene.add(this.farPoints);
    this.bind(sim);
  }

  /** Attach to a (new) simulation, rebuilding the scene content. */
  bind(sim: BattleSimulation): void {
    this.sim = sim;
    for (const v of this.visuals.values()) this.scene.remove(v.built.group);
    this.visuals.clear();
    this.instances.dispose();
    this.effects.clear();
    this.nextBeamShieldAt.clear();
    if (this.env) { this.scene.remove(this.env.group); disposeEnvironment(this.env); }
    this.env = buildEnvironment(sim.config.environment);
    this.scene.add(this.env.group);
    this.sunLight.position.copy(this.env.sunDirection).multiplyScalar(10_000);
    this.sunLight.target.position.set(0, 0, 0);
    this.scene.add(this.sunLight.target);
    // Preserve the original small-battle rendering path and its close-up detail.
    // Only larger fleets lazily create hero hulls and batch the rest on the GPU.
    if (sim.ships.length < 150) for (const ship of sim.ships) this.ensureVisual(ship);
    sim.onEvent = e=>this.eventQueue.push(e);
    this.gunnerySignalUntilMs=0;

    this.selectedIds.clear();
    this.followId = undefined;
    this.cine = { age: 0, hold: 0 };
    this.cineShot = 0;
    this.directorRng = new Rng(`director-${sim.config.seed}`);
    // Frame the player's fleet.
    const centre = this.sideCentre(sim.config.perspectiveSide);
    this.rig.focus.copy(centre);
    let deploymentRadius = 0;
    for (const ship of sim.ships) if (ship.side === sim.config.perspectiveSide && ship.role !== 'fighter' && ship.alive && !ship.escaped) {
      deploymentRadius = Math.max(deploymentRadius, this.tmpA.set(ship.pos.x, ship.pos.y, ship.pos.z).multiplyScalar(KM).distanceTo(centre) + ship.lengthKm * KM * 0.6);
    }
    this.rig.distance = Math.max(320, deploymentRadius * 2.6);
    this.rig.yaw = Math.PI + 0.6;
    this.rig.pitch = 0.42;
  }

  /** Grow far-ship GPU buffers geometrically; never drop ships beyond 2048. */
  private ensureFarCapacity(required: number): void {
    if (required * 3 <= this.farPositions.length) return;
    let next = Math.max(INITIAL_FAR_POINTS, this.farPositions.length / 3);
    while (next < required) next *= 2;
    const positions = new Float32Array(next * 3);
    const colours = new Float32Array(next * 3);
    positions.set(this.farPositions);
    colours.set(this.farColours);
    this.farPositions = positions;
    this.farColours = colours;
    this.farPoints.geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3).setUsage(THREE.DynamicDrawUsage));
    this.farPoints.geometry.setAttribute('color', new THREE.BufferAttribute(colours, 3).setUsage(THREE.DynamicDrawUsage));
  }

  private ensureVisual(ship: ShipState): ShipVisual {
    let v = this.visuals.get(ship.id);
    if (v) return v;
    const built = instantiateShip(ship.classId);
    const glows: THREE.Sprite[] = [];
    if (this.settings.showEngineGlow) {
      const color = ship.faction === 'reaper' ? built.glowColor : getFaction(ship.faction).engineColourHex;
      built.engineNodes.forEach((node, i) => {
        const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.glowTex, color, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.85 }));
        sp.position.copy(node);
        const s = Math.max(0.3, built.lengthUnits * (ship.faction === 'reaper' ? 0.12 : 0.11)) * (built.glowScales?.[i] ?? 1);
        sp.scale.set(s, s, 1);
        built.group.add(sp);
        glows.push(sp);
      });
    }
    built.group.name = ship.id;
    built.group.userData.shipId = ship.id;
    this.scene.add(built.group);
    v = { ship, built, glows, removed: false, tinted: false, lod: 'full',
      reaperRig: isArticulatedReaper(ship) ? captureReaperRig(built.group, ship.id) : undefined };
    this.visuals.set(ship.id, v);
    this.placeVisual(v, 1);
    return v;
  }

  private placeVisual(v: ShipVisual, alpha: number): void {
    const s = v.ship;
    const g = v.built.group;
    g.position.set(
      (s.prevPos.x + (s.pos.x - s.prevPos.x) * alpha) * KM,
      (s.prevPos.y + (s.pos.y - s.prevPos.y) * alpha) * KM,
      (s.prevPos.z + (s.pos.z - s.prevPos.z) * alpha) * KM,
    );
    this.tmpA.set(s.prevHeading.x + (s.heading.x - s.prevHeading.x) * alpha, s.prevHeading.y + (s.heading.y - s.prevHeading.y) * alpha, s.prevHeading.z + (s.heading.z - s.prevHeading.z) * alpha).normalize();
    this.tmpQ.setFromUnitVectors(this.fwd, this.tmpA);
    g.quaternion.copy(this.tmpQ);
    // Engine exhaust is driven by commanded acceleration, not current speed.
    // Coasting / disabled engines retain only a dim idle lens.
    const output=THREE.MathUtils.clamp(s.engineThrust??0.5,0,1);
    for(const glow of v.glows) {
      const material=glow.material as THREE.SpriteMaterial;
      material.opacity=s.inertialCoast?.12:(.22+.62*Math.sqrt(output));
    }

    // Controlled ME-style turns: fighter banking, mild escort corrections,
    // and heavy Reapers/dreadnoughts staying essentially level.
    const turn=s.prevHeading.x*s.heading.z-s.prevHeading.z*s.heading.x;
    const right=this.tmpB.set(this.tmpA.z,0,-this.tmpA.x);
    const lateral=s.vel.x*right.x+s.vel.z*right.z;
    const factor=s.role==='fighter'?.36:s.role==='frigate'?.12:
      s.role==='cruiser'?.025:s.role==='reaper_destroyer'?.015:0;
    const bank=THREE.MathUtils.clamp(turn*3.5+lateral*factor*.12,-factor,factor);
    if(bank)g.rotateZ(bank);
  }

  // ------------------------------------------------------------- per frame

  /** Apply a level of detail to a visual: toggles detail meshes, glow sprites and the far-point fallback. */
  private applyLod(v: ShipVisual, level: LodLevel): void {
    if (v.lod === level) return;
    v.lod = level;
    const g = v.built.group;
    g.visible = level !== 'point';
    for (const child of g.children) {
      if ((child as THREE.Sprite).isSprite) child.visible = level === 'full';
      else if (DETAIL_MESH_NAMES.has(child.name)) child.visible = level === 'full';
    }
  }

  update(dt: number, alpha: number): void {
    this.alpha = alpha;
    this.processEvents();
    const sim = this.sim;
    const cam = this.rig.camera.position;
    const lodOn = this.settings.lod !== false;
    const useInstancing = sim.ships.length >= 150;
    let far = 0;
    let articulatedHeroes = 0;
    let nearVisuals = 0;
    this.lodCounts = { full: 0, reduced: 0, point: 0 };
    if (useInstancing) this.instances.begin(sim.ships);
    this.ensureFarCapacity(sim.ships.length);
    this.rig.camera.updateMatrixWorld();
    this.frustumMatrix.multiplyMatrices(this.rig.camera.projectionMatrix, this.rig.camera.matrixWorldInverse);
    this.frustum.setFromProjectionMatrix(this.frustumMatrix);
    for (const ship of sim.ships) {
      const previous = this.visuals.get(ship.id);
      if (previous?.removed) continue;
      if (!ship.alive) {
        if (previous) this.updateDying(previous, dt);
        continue;
      }
      if (ship.escaped) {
        if (previous) previous.built.group.visible = false;
        continue;
      }
      const lengthUnits = previous?.built.lengthUnits ?? getShipTemplate(ship.classId).lengthUnits;
      const px = (ship.prevPos.x + (ship.pos.x - ship.prevPos.x) * alpha) * KM;
      const py = (ship.prevPos.y + (ship.pos.y - ship.prevPos.y) * alpha) * KM;
      const pz = (ship.prevPos.z + (ship.pos.z - ship.prevPos.z) * alpha) * KM;
      const dx = px - cam.x, dy = py - cam.y, dz = pz - cam.z;
      const distanceSquared = dx * dx + dy * dy + dz * dz;
      const priority = this.selectedIds.has(ship.id) || this.followId === ship.id ||
        this.cine.fromId === ship.id || this.cine.toId === ship.id ||
        (this.cine.members?.includes(ship.id) ?? false);
      const level = useInstancing && priority ? 'full' : lodLevelSquared(distanceSquared, lengthUnits, ship.role, lodOn);
      this.lodCounts[level]++;
      this.sphere.center.set(px, py, pz);
      this.sphere.radius = lengthUnits * .8 + 2;
      const onScreen = this.frustum.intersectsSphere(this.sphere);
      if (level === 'point') {
        if (previous) previous.built.group.visible = false;
        if (onScreen) {
          this.farPositions[far * 3] = px;
          this.farPositions[far * 3 + 1] = py;
          this.farPositions[far * 3 + 2] = pz;
          let colour = this.farColourCache.get(ship.faction);
          if (!colour) {
            this.tmpColour.setHex(getFaction(ship.faction).engineColourHex);
            colour = [this.tmpColour.r, this.tmpColour.g, this.tmpColour.b];
            this.farColourCache.set(ship.faction, colour);
          }
          this.farColours[far * 3] = colour[0];
          this.farColours[far * 3 + 1] = colour[1];
          this.farColours[far * 3 + 2] = colour[2];
          far++;
        }
        continue;
      }
      if (useInstancing && !onScreen && !priority) {
        if (previous) previous.built.group.visible = false;
        continue;
      }
      const nearbyRange = Math.max(75, lengthUnits * 22);
      const hero = !useInstancing || priority ||
        (distanceSquared <= nearbyRange * nearbyRange && nearVisuals < this.MAX_HERO_VISUALS);
      if (!hero) {
        if (previous) previous.built.group.visible = false;
        this.instances.add(ship, alpha, level);
        continue;
      }
      const v = previous ?? this.ensureVisual(ship);
      this.placeVisual(v, alpha);
      this.applyLod(v, level);
      v.built.group.visible = true;
      nearVisuals++;
      if (v.reaperRig) {
        const detailRange = Math.max(55, lengthUnits * 10);
        const detailed = articulatedHeroes < 24 && (priority ||
          (distanceSquared <= detailRange * detailRange && articulatedHeroes < 12));
        selectReaperRigDetail(v.reaperRig, detailed);
        if (detailed) {
          articulatedHeroes++;
          animateReaperRig(v.reaperRig, ship, sim.time, dt);
        }
      }
      const speedFrac = Math.min(1, Math.hypot(ship.vel.x, ship.vel.y, ship.vel.z) / Math.max(.01, ship.maxSpeed));
      if (level === 'full') for (const gl of v.glows)
        (gl.material as THREE.SpriteMaterial).opacity = .35 + .6 * speedFrac * ship.subsystems.engines;
      const hullFrac = ship.hull / ship.maxHull;
      if (hullFrac < .6 && !v.tinted) this.tintDamage(v);
      if (v.tintedMats) {
        const t = 1 - hullFrac;
        const red = .25 * t * (.6 + .4 * Math.sin(sim.time * 7 + ship.id.length));
        for (const mat of v.tintedMats) {
          mat.emissive.setRGB(red, .05 * t, 0);
          mat.emissiveIntensity = 1;
        }
      }
    }
    if (useInstancing) this.instances.end();
    const farGeom = this.farPoints.geometry;
    farGeom.setDrawRange(0, far);
    (farGeom.attributes.position as THREE.BufferAttribute).needsUpdate = true;
    (farGeom.attributes.color as THREE.BufferAttribute).needsUpdate = true;
    this.farPoints.visible = far > 0;
    // Effects from sim state.
    // GPU visuals read simulation-owned data directly. No per-shot allocations.
    this.effects.setTracers(sim.projectiles, alpha, SIM_DT);
    this.effects.setMissiles(sim.missiles, alpha, SIM_DT);
    const beams: { start: THREE.Vector3; end: THREE.Vector3; kind: 'thanix' | 'reaper_beam'; intensity: number }[] = [];
    for (const ship of sim.ships) {
      if (!ship.alive) continue;
      for (const w of ship.weapons) {
        if (w.beamRemaining > 0 && w.beamStart && w.beamEnd) {
          const kind = w.def.kind === 'thanix' ? 'thanix' : 'reaper_beam';
          const v = this.visuals.get(ship.id);
          // Eyes and narrow forward projectors use their model muzzle;
          // turreted lance decks use the actual visible-hull hardpoint.
          let start: THREE.Vector3;
          if (v) start = weaponBeamOrigin(v.built.group, v.built.muzzle, w, ship.faction === 'reaper');
          else start = new THREE.Vector3(w.beamStart.x * KM, w.beamStart.y * KM, w.beamStart.z * KM);
          const t = w.beamTargetId ? sim.getShip(w.beamTargetId) : undefined;
          // The simulation's beamEnd already tracks the selected rotating hull contact.
          // Do not silently force hits back to the centre of the target.
          const end = new THREE.Vector3(w.beamEnd.x * KM, w.beamEnd.y * KM, w.beamEnd.z * KM);
          if (w.beamHit && t?.alive && t.barriers > 0 && sim.time >= (this.nextBeamShieldAt.get(t.id) ?? 0)) {
            const victim = this.visuals.get(t.id);
            if (victim && !victim.removed) {
              this.effects.barriers.hit(t.id, t.classId, victim.built.group, end, w.def.damage * 0.25);
              this.nextBeamShieldAt.set(t.id, sim.time + 0.25);
            }
          }
          const intensity = w.def.id === 'oculus_beam' ? 0.055 :
            kind === 'reaper_beam' ? (ship.role === 'reaper_capital' ? 1.3 : 0.7) : 0.9;
          beams.push({ start, end, kind, intensity });
        }
      }
    }
    this.effects.setBeams(beams);
    this.effects.setPointDefence(sim.flashes, KM);
    this.effects.update(dt);

    // Camera.
    this.cine.age += dt;
    this.updateCamera(dt);
    // Fill light rides with the camera.
    this.fillLight.position.copy(this.rig.camera.position);
    this.fillLight.target.position.copy(this.rig.camera.position).add(this.rig.camera.getWorldDirection(this.tmpB).multiplyScalar(100));
    // Sky objects follow the camera so the starfield never parallaxes.
    for (const o of this.env.skyObjects) if (o.name !== 'sun') o.position.copy(this.rig.camera.position);
    this.env.group.getObjectByName('sun')?.position.copy(this.rig.camera.position).addScaledVector(this.env.sunDirection, 150_000);
  }

  private tintDamage(v: ShipVisual): void {
    const tintedMats: THREE.MeshStandardMaterial[] = [];
    v.built.group.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (mesh.isMesh && mesh.name === 'hull') {
        mesh.material = (mesh.material as THREE.MeshStandardMaterial).clone();
        tintedMats.push(mesh.material as THREE.MeshStandardMaterial);
      }
    });
    v.tintedMats = tintedMats;
    v.tinted = true;
  }

  private updateDying(v: ShipVisual, dt: number): void {
    const ship = v.ship;
    if (!v.dying) {
      const big = ship.role === 'dreadnought' || ship.role === 'carrier' || ship.role === 'reaper_capital';
      v.dying = { timer: 0, duration: big ? 2.2 : ship.role === 'cruiser' || ship.role === 'reaper_destroyer' ? 0.9 : 0.15, nextSecondary: 0 };
      if (!big && v.dying.duration < 0.2) {
        this.finishDeath(v);
        return;
      }
    }
    const d = v.dying;
    d.timer += dt;
    // Keep drifting on last velocity, shedding secondary explosions.
    v.built.group.position.add(this.tmpA.set(ship.vel.x, ship.vel.y, ship.vel.z).multiplyScalar(KM * dt * 0.6));
    v.built.group.rotateX(dt * 0.05);
    if (d.timer >= d.nextSecondary) {
      d.nextSecondary = d.timer + 0.12 + Math.random() * 0.25;
      const p = v.built.group.position.clone().add(new THREE.Vector3((Math.random() - 0.5) * v.built.lengthUnits, (Math.random() - 0.5) * v.built.lengthUnits * 0.3, (Math.random() - 0.5) * v.built.lengthUnits));
      this.effects.secondary(p, v.built.lengthUnits * 0.5);
    }
    if (d.timer >= d.duration) this.finishDeath(v);
  }

  private finishDeath(v: ShipVisual): void {
    const ship = v.ship;
    const pos = v.built.group.position.clone();
    const pieces: THREE.Object3D[] = [];
    // Break the model apart: each merged part becomes a debris chunk.
    if (ship.role !== 'fighter') {
      for (const child of [...v.built.group.children]) {
        if ((child as THREE.Mesh).isMesh) {
          const mesh = child as THREE.Mesh;
          const original = mesh.material as THREE.Material;
          mesh.material = original.clone();
          if (v.tinted && mesh.name === 'hull') original.dispose();
          pieces.push(mesh);
        }
      }
    }
    const vel = new THREE.Vector3(ship.vel.x, ship.vel.y, ship.vel.z).multiplyScalar(KM * 0.5);
    this.effects.explosion(pos, v.built.lengthUnits, ship.faction === 'reaper', pieces, vel);
    for (const gl of v.glows) gl.visible = false;
    this.scene.remove(v.built.group);
    v.removed = true;
    const camDist = this.rig.camera.position.distanceTo(pos);
    this.rig.addShake(Math.min(1, (v.built.lengthUnits * 30) / Math.max(50, camDist)));
    if (this.followId === ship.id && this.rig.mode !== 'gunnery') this.followId = undefined;
    this.selectedIds.delete(ship.id);
  }

  private processEvents(): void {
    const q = this.eventQueue;
    this.eventQueue = [];
    for (const e of q) {
      switch (e.type) {
        case 'weapon_fired': {
          // Natural cinematic opportunity: the sim has actually fired a
          // high-energy main beam. The camera observes an existing action;
          // it never invents a shot, kill, target or combat order.
          if (this.sim.rules.special.reaperHardcore && e.kind === 'reaper_beam' &&
              this.rig.mode === 'cinematic' && this.cine.age > 5) {
            const shooter = this.sim.getShip(e.shipId);
            const weapon = shooter?.weapons[e.weaponIndex];
            const target = e.targetId ? this.sim.getShip(e.targetId) : undefined;
            if (shooter?.role === 'reaper_capital' && weapon?.def.id === 'reaper_capital_beam' &&
                weapon.beamHit && target?.alive) {
              this.cine = { fromId: shooter.id, toId: target.id, age: 0, hold: 6 };
            }
          }
          if(this.rig.mode==='gunnery'&&e.shipId===this.followId){
            const shooter=this.sim.getShip(e.shipId);
            if(shooter&&isMainGunShot(shooter,e.weaponIndex)){
              this.gunneryShot={t:e.t,shipId:e.shipId,targetId:e.targetId,weaponIndex:e.weaponIndex,kind:e.kind};
              this.rig.addShake(.045);
            }
          }
          if (e.kind !== 'mass_accelerator') break;
          const ship = this.sim.getShip(e.shipId);
          const v = ship ? this.visuals.get(ship.id) : undefined;
          if (!ship) break;
          const w = ship.weapons[e.weaponIndex];
          if (!w) break;
          const big = w.def.damage >= 600;
          if (!big && Math.random() > 0.35) break; // thin out small-gun flashes
          const worldMuzzle = v ? undefined : weaponWorldOffset(ship, w);
          const pose = v ? weaponFlashPose(v.built.group, v.built.muzzle, w) : {
            position: new THREE.Vector3(worldMuzzle!.x, worldMuzzle!.y, worldMuzzle!.z).multiplyScalar(KM),
            direction: new THREE.Vector3(ship.heading.x, ship.heading.y, ship.heading.z).normalize()
          };
          const pov = this.rig.mode === 'gunnery' && ship.id === this.followId;
          this.effects.muzzleFlash(pose.position, pose.direction,
            pov ? (big ? 1.8 : 0.75) : (big ? 3.6 : 1.2), ship.faction === 'reaper');
          if (big && this.rig.mode === 'projectile') this.projectileTrack = { id: this.sim.projectiles[this.sim.projectiles.length - 1]?.id ?? 0 };
          break;
        }
        case 'projectile_impact': {
          const t = this.sim.getShip(e.targetId);
          const v = t ? this.visuals.get(t.id) : undefined;
          const pos = new THREE.Vector3(e.pos.x * KM, e.pos.y * KM, e.pos.z * KM);
          if (v && e.barrierDamage > 3) this.effects.barriers.hit(t!.id, t!.classId, v.built.group, pos, e.barrierDamage);
          this.effects.impact(pos, e.barrierDamage, e.hullDamage, v ? v.built.lengthUnits * 0.55 : 2, () => (v && !v.removed ? v.built.group.position : undefined), e.damageType, e.glancing);
          break;
        }
        case 'hades_detonation': {
          const ship = this.sim.getShip(e.targetId);
          const visual = ship ? this.visuals.get(ship.id) : undefined;
          if (!ship || visual?.removed) break;
          this.effects.hadesBurst(new THREE.Vector3(e.pos.x * KM, e.pos.y * KM, e.pos.z * KM),
            visual?.built.lengthUnits ?? getShipTemplate(ship.classId).lengthUnits,
            e.payloadDamage, new THREE.Vector3(ship.heading.x, ship.heading.y, ship.heading.z), new THREE.Vector3(ship.vel.x, ship.vel.y, ship.vel.z).multiplyScalar(KM));
          break;
        }
        case 'barriers_down': {
          const ship = this.sim.getShip(e.shipId);
          const visual = ship ? this.visuals.get(ship.id) : undefined;
          if (ship && visual) this.effects.barriers.hit(ship.id, ship.classId, visual.built.group, visual.built.group.position, 0, true);
          break;
        }
        case 'missile_intercepted': {
          this.effects.impact(new THREE.Vector3(e.pos.x * KM, e.pos.y * KM, e.pos.z * KM), 0, 30, 1, () => undefined, 'warhead');
          break;
        }
        case 'ship_destroyed': {
          const v = this.visuals.get(e.shipId);
          // A distant GPU-instanced hull still produces a full explosion when
          // destroyed; only its close-up debris pieces require a hero mesh.
          if (!v) {
            const ship = this.sim.getShip(e.shipId);
            if (ship) this.effects.explosion(
              new THREE.Vector3(ship.pos.x, ship.pos.y, ship.pos.z).multiplyScalar(KM),
              getShipTemplate(ship.classId).lengthUnits, ship.faction === 'reaper');
          }
          if (v && this.rig.mode === 'cinematic' && this.cine.age >= 5 && (e.role === 'dreadnought' || e.role === 'reaper_capital' || e.role === 'carrier')) {
            // Cinematic director jumps to capital ship deaths.
            this.cine = { fromId: e.shipId, toId: undefined, age: 0, hold: 7, wreck: true };
          }
          break;
        }
        default:
          break;
      }
    }
  }

  // ------------------------------------------------------------- cameras

  private subjectFor(ship: ShipState | undefined): CameraSubject | undefined {
    if (!ship) return undefined;
    const v = this.visuals.get(ship.id);
    return {
      position: new THREE.Vector3(
        (ship.prevPos.x + (ship.pos.x - ship.prevPos.x) * this.alpha) * KM,
        (ship.prevPos.y + (ship.pos.y - ship.prevPos.y) * this.alpha) * KM,
        (ship.prevPos.z + (ship.pos.z - ship.prevPos.z) * this.alpha) * KM
      ),
      velocity: new THREE.Vector3(ship.vel.x, ship.vel.y, ship.vel.z).multiplyScalar(KM),
      heading: new THREE.Vector3(ship.heading.x, ship.heading.y, ship.heading.z),
      size: v?.built.lengthUnits ?? getShipTemplate(ship.classId).lengthUnits,
    };
  }

  sideCentre(side: 'A' | 'B'): THREE.Vector3 {
    const c = new THREE.Vector3();
    let n = 0;
    for (const s of this.sim.ships) {
      if (s.side !== side || !s.alive || s.escaped || s.role === 'fighter') continue;
      c.add(this.tmpA.set(s.pos.x, s.pos.y, s.pos.z).multiplyScalar(KM));
      n++;
    }
    return n > 0 ? c.multiplyScalar(1 / n) : c;
  }

  private updateCamera(dt: number): void {
    const sim = this.sim;
    const fleetCentre = this.sideCentre(sim.config.perspectiveSide);
    let subject: CameraSubject | undefined;
    if (this.rig.mode === 'follow') {
      const id = this.followId ?? [...this.selectedIds][0];
      const ship = id ? sim.getShip(id) : undefined;
      subject = this.subjectFor(ship && ship.alive ? ship : undefined);
      if (!subject) {
        // Default to the most valuable friendly ship.
        const best = sim.ships.filter((s) => s.alive && !s.escaped && s.side === sim.config.perspectiveSide).sort((a, b) => b.pointValue - a.pointValue)[0];
        if (best) this.followId = best.id;
        subject = this.subjectFor(best);
      }
    } else if (this.rig.mode === 'reaper') {
      const id = this.followId;
      let ship = id ? sim.getShip(id) : undefined;
      if (!ship || !ship.alive || ship.faction !== 'reaper') {
        ship = sim.ships.filter((s) => s.alive && !s.escaped && s.faction === 'reaper').sort((a, b) => b.pointValue - a.pointValue)[0];
        if (ship) this.followId = ship.id;
      }
      subject = this.subjectFor(ship);
    }
    let gunnery: { position: THREE.Vector3; aim: THREE.Vector3; signalLost?: boolean } | undefined;
    if (this.rig.mode === 'gunnery') {
      const id = this.gunneryLockedShipId ?? this.followId;
      const ship = id ? sim.getShip(id) : undefined;
      if (!ship || !ship.alive || ship.escaped || this.gunnerySignalLost) {
        // Never switch ship, barrel or target after signal loss. Hold the last
        // optical orientation until the user explicitly chooses another POV.
        const station = this.rig.camera.position.clone();
        const aim = station.clone().add(new THREE.Vector3(0,0,-1000).applyQuaternion(this.rig.camera.quaternion));
        gunnery = { position: station, aim, signalLost: true };
      }
      if (ship && ship.alive && !ship.escaped && !this.gunnerySignalLost) {
        // First-person optics always remain on the selected MAIN emitter.
        const weapon = primaryGunneryMount(ship);
        if (weapon) {
          // The fixed barrel shares the hull's interpolated 3D pose. Target
          // changes affect HUD telemetry only, never the optical direction.
          gunnery = gunneryFrame(ship, weapon, this.alpha, this.visuals.get(ship.id)?.built);
        }
      }
    }
    let cinematic: CinematicFrame | undefined;
    if (this.rig.mode === 'cinematic') {
      this.cine.hold -= dt;
      const from = this.cine.fromId ? sim.getShip(this.cine.fromId) : undefined;
      if (this.cine.hold <= 0 || !from || (!from.alive && !this.cine.wreck)) this.pickCinematicShot();
      const f = this.cine.fromId ? sim.getShip(this.cine.fromId) : undefined;
      const t = this.cine.toId ? sim.getShip(this.cine.toId) : undefined;
      const fs = this.subjectFor(f);
      if (fs) {
        cinematic = { from: fs, to: this.subjectFor(t && t.alive ? t : undefined), age: this.cine.age };
        const members = (this.cine.members ?? []).map(id => sim.getShip(id)).filter((s): s is ShipState => !!s && s.alive && !s.escaped);
        if (members.length >= 3) {
          const centre = new THREE.Vector3();
          for (const ship of members) centre.add(this.tmpA.set(ship.pos.x, ship.pos.y, ship.pos.z).multiplyScalar(KM));
          centre.multiplyScalar(1 / members.length);
          let radius = fs.size;
          for (const ship of members) radius = Math.max(radius, this.tmpA.set(ship.pos.x, ship.pos.y, ship.pos.z).multiplyScalar(KM).distanceTo(centre) + ship.lengthKm * KM * 0.6);
          cinematic.group = { centre, radius, heading: fs.heading };
        }
      }
    }
    let projectile: CameraSubject | undefined;
    if (this.rig.mode === 'projectile') {
      let p = this.projectileTrack ? sim.projectiles.find((x) => x.id === this.projectileTrack!.id) : undefined;
      if (!p) {
        p = [...sim.projectiles].sort((a, b) => b.weapon.damage - a.weapon.damage)[0];
        if (p) this.projectileTrack = { id: p.id };
      }
      if (p) {
        projectile = {
          position: new THREE.Vector3(p.pos.x, p.pos.y, p.pos.z).multiplyScalar(KM),
          velocity: new THREE.Vector3(p.vel.x, p.vel.y, p.vel.z).multiplyScalar(KM),
          heading: new THREE.Vector3(p.vel.x, p.vel.y, p.vel.z).normalize(),
          size: 2,
        };
      } else {
        // Between shots: hover near the biggest active beam or the fleet.
        const beamShip = sim.ships.find((s) => s.alive && s.weapons.some((w) => w.beamRemaining > 0 && w.def.kind === 'reaper_beam'));
        subject = this.subjectFor(beamShip);
        if (subject) {
          projectile = { position: subject.position.clone().addScaledVector(subject.heading, subject.size * 0.6), velocity: subject.heading.clone().multiplyScalar(50), heading: subject.heading, size: 2 };
        }
      }
    }
    this.rig.update(dt, { subject, cinematic, projectile, gunnery, fleetCentre });
  }

  private pickCinematicShot(): void {
    const pair = cinematicPair(this.sim.ships, this.directorRng, this.cine.fromId);
    if (!pair) return;
    const wide = this.cineShot++ % 3 === 0 && this.sim.ships.filter(s => s.alive && !s.escaped && s.role !== 'fighter').length >= 24;
    this.cine = { ...pair, age: 0, hold: 11 + this.directorRng.next() * 7,
      members: wide ? cinematicWing(this.sim.ships, pair.fromId) : undefined };
  }

  // ------------------------------------------------------------ picking

  /** Pick all live ships, including those represented by GPU instances or points. */
  pick(x: number, y: number, width: number, height: number): ShipState | undefined {
    const cam = this.rig.camera;
    let best: ShipState | undefined;
    let bestD = Infinity;
    for (const ship of this.sim.ships) {
      if (!ship.alive || ship.escaped) continue;
      const v = this.visuals.get(ship.id);
      if (v?.removed) continue;
      const centre = this.tmpB.set(
        (ship.prevPos.x + (ship.pos.x - ship.prevPos.x) * this.alpha) * KM,
        (ship.prevPos.y + (ship.pos.y - ship.prevPos.y) * this.alpha) * KM,
        (ship.prevPos.z + (ship.pos.z - ship.prevPos.z) * this.alpha) * KM
      );
      const p = this.tmpA.copy(centre).project(cam);
      if (p.z > 1 || p.z < -1) continue;
      const sx = (p.x * .5 + .5) * width;
      const sy = (-p.y * .5 + .5) * height;
      const length = v?.built.lengthUnits ?? getShipTemplate(ship.classId).lengthUnits;
      const distance = cam.position.distanceTo(centre);
      const radiusPx = Math.max(14, ((length * .5) / Math.max(1, distance)) *
        (height / (2 * Math.tan(cam.fov * Math.PI / 360))));
      const d = Math.hypot(sx - x, sy - y);
      if (d < radiusPx + 6 && d < bestD) { bestD = d; best = ship; }
    }
    return best;
  }

  /** Project a world position (km) to screen; returns undefined when behind the camera. */
  project(pos: { x: number; y: number; z: number }, width: number, height: number): { x: number; y: number; depth: number } | undefined {
    const p = this.tmpA.set(pos.x * KM, pos.y * KM, pos.z * KM);
    const depth = p.distanceTo(this.rig.camera.position);
    p.project(this.rig.camera);
    if (p.z > 1) return undefined;
    return { x: (p.x * 0.5 + 0.5) * width, y: (-p.y * 0.5 + 0.5) * height, depth };
  }

  resize(width: number, height: number): void {
    this.renderer.setSize(width, height, false);
    this.rig.resize(width / Math.max(1, height));
  }

  render(): void {
    this.renderer.render(this.scene, this.rig.camera);
    this.drawCalls = this.renderer.info.render.calls;
  }

  dispose(): void {
    this.effects.dispose();
    this.instances.dispose();
    this.glowTex.dispose();
    disposeEnvironment(this.env);
    this.scene.environment?.dispose();
    for (const v of this.visuals.values()) {
      for (const glow of v.glows) glow.material.dispose();
      if (v.tinted && !v.removed) v.built.group.traverse(object => {
        const mesh = object as THREE.Mesh;
        if (mesh.isMesh && mesh.name === 'hull') (mesh.material as THREE.Material).dispose();
      });
    }
    this.farPoints.geometry.dispose();
    (this.farPoints.material as THREE.Material).dispose();
    // The next battle reuses this canvas/context. Clear texture unpack flags
    // before its renderer creates typed-array 3D placeholder textures.
    this.renderer.resetState();
    this.renderer.dispose();
  }
}
