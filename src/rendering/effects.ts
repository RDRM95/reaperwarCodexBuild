import { explosionSize, explosionSmoke, impactSize, impactSparks, pointDefenceBrightness, tracerColour, tracerShown, tracerSize } from './visualWeight';
import * as THREE from 'three';
import { Rng } from '@/core/rng';
import { KM } from './geometry';
import { HullBarriers } from './barriers';
import { breakupVelocity } from './breakup';
import { FragmentBatch, SparkBatch } from './effectBatches';
import { NuclearDetonations, planDetonation, type DetonationMoment } from './nuclear';

/**
 * Pooled visual effects: tracer projectiles, beams, impact flashes, barrier
 * shimmer, explosions (sprite bursts + debris) and point-defence laser
 * flashes. Everything is driven from simulation events and state, so the
 * visuals never disagree with the results.
 */

function radialTexture(inner: string, mid: string, outer: string, size = 128): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d')!;
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, inner);
  g.addColorStop(0.12, mid);
  g.addColorStop(0.45, outer.replace(/[\d.]+\)$/, '0.18)'));
  g.addColorStop(1, outer);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  return new THREE.CanvasTexture(c);
}

interface Spark {
  /** Which batch draws it: one per texture, plus one that ignores depth. */
  batch: number;
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  life: number;
  maxLife: number;
  startScale: number;
  endScale: number;
  /** Linear colour. */
  r: number; g: number; b: number;
}

/** A generic debris fragment, drawn through an instanced batch of its shape. */
interface Fragment {
  shape: number;
  pos: THREE.Vector3;
  rotation: THREE.Euler;
  scale: number;
  vel: THREE.Vector3;
  spin: THREE.Vector3;
  life: number;
}

interface Debris {
  mesh: THREE.Object3D;
  vel: THREE.Vector3;
  spin: THREE.Vector3;
  life: number;
  maxLife: number;
}

export class EffectsSystem {
  readonly group = new THREE.Group();
  private readonly rng = new Rng('fx');
  private readonly flashTex = radialTexture('rgba(255,255,255,1)', 'rgba(255,220,160,0.7)', 'rgba(255,120,40,0)');
  private readonly fireTex = radialTexture('rgba(255,250,230,1)', 'rgba(255,150,60,0.8)', 'rgba(120,30,10,0)');
  private readonly smokeTex = radialTexture('rgba(80,80,90,0.9)', 'rgba(40,40,50,0.5)', 'rgba(0,0,0,0)');
  private readonly blueTex = radialTexture('rgba(220,240,255,1)', 'rgba(120,180,255,0.7)', 'rgba(40,80,200,0)');
  private readonly redTex = radialTexture('rgba(255,240,230,1)', 'rgba(255,80,40,0.8)', 'rgba(120,10,0,0)');

  private sparks: Spark[] = [];
  /** Pieces of the destroyed ship's own model. Generic fragments are in `fragments`. */
  private debris: Debris[] = [];
  private fragments: Fragment[] = [];
  readonly barriers = new HullBarriers();
  /** One batch per spark texture, then one for the HADES core, which shows through hulls. */
  private readonly sparkTextures = [this.flashTex, this.fireTex, this.smokeTex, this.blueTex, this.redTex];
  private readonly sparkBatches = [...this.sparkTextures.map(texture => new SparkBatch(texture)), new SparkBatch(this.blueTex, false)];
  private readonly sparkColour = new THREE.Color();
  private nuclearRings: { mesh: THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>; life: number; size: number; span: number }[] = [];
  private ringPool: THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>[] = [];
  private readonly nuclearRingGeometry = new THREE.TorusGeometry(1, 0.025, 5, 64);
  get nuclearRingCount(): number { return this.nuclearRings.length; }
  /** Nuclear detonations: flash, vapour, light through plating (nuclear.ts). One draw call for all of them, two with light inside hulls. */
  readonly nuclear = new NuclearDetonations();
  /** Told of each detonation at the moment it goes off (a penetrator's is a beat after its strike). */
  onDetonation?: (moment: DetonationMoment) => void;

  // Tracers (instanced).
  private readonly tracerMax = 1024;
  private readonly tracerMesh: THREE.InstancedMesh;
  private readonly tracerColour = new THREE.Color();
  private readonly tracerDummy = new THREE.Object3D();

  // Beams.
  private readonly beamPool: { core: THREE.Mesh; glow: THREE.Mesh; impact: THREE.Sprite }[] = [];
  private readonly beamGeometry = new THREE.CylinderGeometry(1, 1, 1, 10, 1, true);
  private readonly beamMid = new THREE.Vector3();
  private readonly beamCoreMatReaper = new THREE.MeshBasicMaterial({ color: 0xfff0e0, transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending, depthWrite: false });
  private readonly beamGlowMatReaper = new THREE.MeshBasicMaterial({ color: 0xff1738, transparent: true, opacity: 0.45, blending: THREE.AdditiveBlending, depthWrite: false });
  private readonly beamCoreMatThanix = new THREE.MeshBasicMaterial({ color: 0xf0f8ff, transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending, depthWrite: false });
  private readonly beamGlowMatThanix = new THREE.MeshBasicMaterial({ color: 0x4fa0ff, transparent: true, opacity: 0.4, blending: THREE.AdditiveBlending, depthWrite: false });

  // Point defence lines.
  private readonly pdGeometry = new THREE.BufferGeometry();
  private readonly pdPositions = new Float32Array(512 * 6);
  private readonly pdColors = new Float32Array(512 * 6);
  private readonly pdLines: THREE.LineSegments;

  // Missiles (instanced points).
  private readonly missileMesh: THREE.InstancedMesh;

  private readonly debrisGeo = [new THREE.BoxGeometry(1, 0.4, 1.6), new THREE.TetrahedronGeometry(0.8), new THREE.BoxGeometry(0.5, 0.5, 2.5)];
  private readonly pieceBox = new THREE.Box3();
  private readonly pieceCentre = new THREE.Vector3();
  private readonly debrisMat = new THREE.MeshStandardMaterial({ color: 0x55585f, metalness: 0.7, roughness: 0.5, emissive: 0x401000, emissiveIntensity: 0.6 });
  private readonly fragmentBatches = this.debrisGeo.map(geometry => new FragmentBatch(geometry, this.debrisMat, this.group));
  private readonly fragmentDummy = new THREE.Object3D();

  /** Point light reused for the biggest explosions. */
  readonly flashLight = new THREE.PointLight(0xffa060, 0, 400 * KM, 1.5);
  private flashLightLife = 0;

  constructor() {
    this.beamGeometry.rotateX(Math.PI / 2);
    const tracerGeo = new THREE.BoxGeometry(0.1, 0.1, 1);
    // White, tinted for each round: amber for a slug, blue to violet for a round with a blast (see tracerColour).
    const tracerMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending, depthWrite: false });
    this.tracerMesh = new THREE.InstancedMesh(tracerGeo, tracerMat, this.tracerMax);
    this.tracerMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.tracerMesh.frustumCulled = false;
    this.tracerMesh.count = 0;
    this.group.add(this.tracerMesh);

    this.pdGeometry.setAttribute('position', new THREE.BufferAttribute(this.pdPositions, 3).setUsage(THREE.DynamicDrawUsage));
    this.pdGeometry.setAttribute('color', new THREE.BufferAttribute(this.pdColors, 3).setUsage(THREE.DynamicDrawUsage));
    this.pdLines = new THREE.LineSegments(this.pdGeometry, new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false }));
    this.pdLines.frustumCulled = false;
    this.pdGeometry.setDrawRange(0, 0);
    this.group.add(this.pdLines);

    const mGeo = new THREE.SphereGeometry(0.12, 6, 4);
    const mMat = new THREE.MeshBasicMaterial({ color: 0x9fd0ff, transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending, depthWrite: false });
    this.missileMesh = new THREE.InstancedMesh(mGeo, mMat, 512);
    this.missileMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.missileMesh.frustumCulled = false;
    this.missileMesh.count = 0;
    this.group.add(this.missileMesh);

    this.group.add(this.flashLight, this.barriers.group, this.nuclear.group);
    this.nuclear.onDetonation = (moment) => this.detonated(moment);
    for (const batch of this.sparkBatches) this.group.add(batch.mesh);
  }

  // ------------------------------------------------------------ primitives

  /**
   * Add a spark to its batch. It is drawn from this frame on: `shownScale` is its size until the first update.
   * `batch` is the index of its texture in `sparkTextures`, or the last batch for one that ignores depth.
   */
  private addSpark(batch: number, pos: THREE.Vector3, vel: THREE.Vector3, life: number, shownScale: number, startScale: number, endScale: number, color: number): void {
    const c = this.sparkColour.setHex(color);
    this.sparks.push({ batch, pos: pos.clone(), vel, life, maxLife: life, startScale, endScale, r: c.r, g: c.g, b: c.b });
    const target = this.sparkBatches[batch];
    target.push(pos.x, pos.y, pos.z, shownScale, c.r, c.g, c.b, 1);
    target.commit();
  }

  private spark(pos: THREE.Vector3, vel: THREE.Vector3, life: number, startScale: number, endScale: number, tex: THREE.Texture, color: number): void {
    if (this.sparks.length > 900) return;
    this.addSpark(this.sparkTextures.indexOf(tex as THREE.CanvasTexture), pos, vel, life, startScale, startScale, endScale, color);
  }

  // ------------------------------------------------------------ event hooks

  /** Muzzle flash for a mass accelerator shot. */
  muzzleFlash(pos: THREE.Vector3, dir: THREE.Vector3, size: number, reaper = false): void {
    this.spark(pos, dir.clone().multiplyScalar(size * 2), 0.1, size * 0.5, size * 1.3, reaper ? this.redTex : this.flashTex, 0xffffff);
  }

  /** Impact: barrier hit shimmer or hull hit sparks. */
  impact(pos: THREE.Vector3, barrierDamage: number, hullDamage: number, targetRadiusUnits: number, targetPos: () => THREE.Vector3 | undefined, damageType: string, glancing = false): void {
    const total = barrierDamage + hullDamage;
    if(glancing){
      // Glancing rounds leave a short grazing flare. Avoid using the same
      // large impact cloud as a direct HADES/NOVA penetration.
      const size=Math.min(1.6,.24+Math.sqrt(total)*.016);
      this.spark(pos,new THREE.Vector3(),.13,size*.4,size*1.1,
        barrierDamage>hullDamage?this.blueTex:this.fireTex,
        barrierDamage>hullDamage?0x86c7ff:0xe8a876);
      return;
    }
    const size = impactSize(total);
    if (barrierDamage > hullDamage && barrierDamage > 3) {
      this.spark(pos, new THREE.Vector3(), 0.2, size * 0.6, size * 1.4, this.blueTex, 0x9fd0ff);
    } else if (total > 0) {
      const tex = damageType === 'reaper_beam' ? this.redTex : this.fireTex;
      this.spark(pos, new THREE.Vector3(), 0.25, size * 0.7, size * 1.6, tex, 0xffffff);
      const n = impactSparks(hullDamage);
      for (let i = 0; i < n; i++) {
        const v = new THREE.Vector3(this.rng.gaussian(0, 1), this.rng.gaussian(0, 1), this.rng.gaussian(0, 1)).multiplyScalar(size * 2.5);
        this.spark(pos, v, 0.5 + this.rng.next() * 0.5, size * 0.25, size * 0.04, this.fireTex, 0xffb060);
      }
      if (hullDamage > 400) this.spark(pos, new THREE.Vector3(0, 0.5, 0), 2.5, size * 0.8, size * 2.6, this.smokeTex, 0x888888);
    }
  }

  /**
   * A HADES penetrator's warhead going off inside a hull: only ever called for a detonation the simulation has
   * confirmed (the round reached the hull). `entry` is where the round struck and `centre` the hull's centre: the
   * warhead goes off between them, deeper for a heavier round, a beat after the strike. See nuclear.ts for what is
   * drawn; nothing is drawn outside the hull but the light that gets out of it.
   */
  internalDetonation(entry: THREE.Vector3, centre: THREE.Vector3, payloadDamage: number, hullDamage: number, targetLength: number, velocity = new THREE.Vector3(),
    anchor?: () => THREE.Vector3 | undefined, detail = 1): void {
    const plan = planDetonation('internal', payloadDamage, targetLength, hullDamage);
    const outward = entry.clone().sub(centre);
    if (outward.lengthSq() < 1e-9) outward.set(0, 0, -1);
    const depth = 0.3 + 0.1 * plan.tier;
    this.nuclear.detonate(plan, entry.clone().lerp(centre, depth), outward, velocity, anchor, detail);
  }

  /** The old name and arguments (a burst at a hull's centre, travelling along `heading`), kept for the effects QA script. */
  hadesBurst(position: THREE.Vector3, length: number, payloadDamage: number, heading: THREE.Vector3, velocity = new THREE.Vector3()): void {
    this.internalDetonation(position.clone().addScaledVector(heading.clone().normalize(), -length * 0.3), position, payloadDamage, payloadDamage, length, velocity);
  }

  /**
   * A nuclear warhead going off against a barrier or a hull (a weapon marked `warhead: 'nuclear'`): the flash and
   * the cloud of vapour stand off the surface that stopped it. `outward` points from the hull toward where the
   * warhead came from.
   */
  externalDetonation(position: THREE.Vector3, outward: THREE.Vector3, payloadDamage: number, hullDamage: number, targetLength: number, velocity = new THREE.Vector3(),
    anchor?: () => THREE.Vector3 | undefined, detail = 1): void {
    this.nuclear.detonate(planDetonation('external', payloadDamage, targetLength, hullDamage), position, outward, velocity, anchor, detail);
  }

  /** At the moment a detonation goes off: its fragments, and its claim on the pooled light. Then whoever is listening (the camera, the bridge, the sound). */
  private detonated(moment: DetonationMoment): void {
    const { plan, position, outward, velocity } = moment;
    // Fragments are of the hull: white-hot and fast, cooling to orange as they slow. None where no hull was reached.
    const room = Math.max(0, 900 - this.sparks.length);
    const count = Math.min(plan.fragments.count, room);
    for (let i = 0; i < count; i++) {
      const way = new THREE.Vector3(this.rng.gaussian(), this.rng.gaussian(), this.rng.gaussian()).normalize();
      // Thrown away from the hull more than into it.
      if (way.dot(outward) < 0 && i % 3 !== 0) way.negate();
      const speed = plan.fragments.speed * (0.5 + this.rng.next());
      const hot = i % 2 === 0;
      this.spark(position.clone().addScaledVector(way, plan.radius * 0.2), way.multiplyScalar(speed).add(velocity), hot ? 0.45 + this.rng.next() * 0.4 : 1.0 + this.rng.next() * 1.3,
        plan.radius * (hot ? 0.12 : 0.09), plan.radius * 0.015, this.fireTex, hot ? 0xfff2d6 : 0xffa24a);
    }
    if (plan.light.intensity > this.flashLight.intensity) {
      this.flashLight.position.copy(position).addScaledVector(outward, plan.radius * (plan.kind === 'external' ? 0.6 : 1.2));
      this.flashLight.color.setHex(plan.kind === 'external' ? 0xf4f8ff : 0xffe2b8);
      this.flashLight.intensity = plan.light.intensity * this.nuclear.flashScale;
      this.flashLightLife = plan.light.life;
    }
    this.onDetonation?.(moment);
  }

  /** The discharge of a gun whose round carries a blast: a flash in the round's own colour and a ring thrown back off the muzzle. */
  lanceDischarge(position: THREE.Vector3, direction: THREE.Vector3, size: number, colour: number): void {
    this.spark(position, direction.clone().multiplyScalar(size * 3), 0.22, size * 0.9, size * 2.6, this.flashTex, 0xffffff);
    this.spark(position, direction.clone().multiplyScalar(size * 1.2), 0.5, size * 0.6, size * 3.4, this.blueTex, colour);
    if (this.nuclearRings.length < 12) this.shockRing(position, direction, size * 0.5, 0.6, colour);
    this.flashLight.position.copy(position); this.flashLight.color.setHex(colour); this.flashLight.intensity = Math.max(this.flashLight.intensity, 40 * size); this.flashLightLife = 0.5;
  }

  /**
   * A round with a blast going off: `radius` is the blast's reach in render units. A white core, a ball of the
   * round's colour that swells to the blast's edge, two shock rings at right angles that run out to it, and
   * incandescent fragments. Drawn from the shared spark batches and the ring pool, so it costs no draw call.
   */
  kineticBlast(position: THREE.Vector3, radius: number, colour: number, travel = new THREE.Vector3(0, 0, 1)): void {
    // The flash: for a quarter of a second a white ball wider than the blast itself, then the fireball.
    this.addSpark(this.sparkBatches.length - 1, position, new THREE.Vector3(), 0.28, radius * 1.6, radius * 1.2, radius * 2.6, 0xffffff);
    this.addSpark(this.sparkBatches.length - 1, position, new THREE.Vector3(), 0.7, radius * 0.8, radius * 0.5, radius * 1.5, 0xffffff);
    this.spark(position, new THREE.Vector3(), 1.3, radius * 0.9, radius * 2.4, this.blueTex, colour);
    this.spark(position, new THREE.Vector3(), 2.6, radius * 0.7, radius * 2.8, this.blueTex, colour);
    this.spark(position, new THREE.Vector3(), 4.0, radius * 0.5, radius * 2.2, this.smokeTex, 0x6a5a8c);
    const axis = travel.clone().normalize();
    const across = new THREE.Vector3(0, 1, 0).cross(axis);
    if (across.lengthSq() < 1e-6) across.set(1, 0, 0);
    this.shockRing(position, axis, radius / 4.9, 1.5, colour);
    this.shockRing(position, across.normalize(), radius / 4.9 * 0.8, 1.9, 0xffffff);
    for (let i = 0; i < 40; i++) {
      const out = new THREE.Vector3(this.rng.gaussian(), this.rng.gaussian(), this.rng.gaussian()).normalize();
      this.spark(position.clone().addScaledVector(out, radius * 0.05), out.multiplyScalar(radius * (0.35 + this.rng.next() * 0.5)), 1.4 + this.rng.next() * 1.6, radius * 0.11, radius * 0.015, this.fireTex, i % 3 ? colour : 0xffffff);
    }
    this.flashLight.position.copy(position); this.flashLight.color.setHex(colour); this.flashLight.intensity = Math.max(this.flashLight.intensity, 14 * radius); this.flashLightLife = 1.4;
  }

  /** A ring from the pool, facing along `axis`, that runs out to 4.9 times `size` over `span` seconds. */
  private shockRing(position: THREE.Vector3, axis: THREE.Vector3, size: number, span: number, colour: number): void {
    if (this.nuclearRings.length >= 12) return;
    const mesh = this.ringPool.pop() ?? new THREE.Mesh(this.nuclearRingGeometry, new THREE.MeshBasicMaterial({ color: colour, transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
    mesh.material.color.setHex(colour);
    mesh.visible = true; mesh.position.copy(position); mesh.scale.setScalar(size * 0.4);
    mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), axis.clone().normalize());
    this.group.add(mesh); this.nuclearRings.push({ mesh, life: span, size, span });
  }

  /** Explosion scaled to the ship. Returns duration in seconds. */
  explosion(pos: THREE.Vector3, lengthUnits: number, reaper: boolean, pieces: THREE.Object3D[] = [], velocity = new THREE.Vector3()): number {
    const size = explosionSize(lengthUnits);
    const big = size > 4;
    const n = big ? 30 : size > 1.5 ? 14 : 6;
    for (let i = 0; i < n; i++) {
      const off = new THREE.Vector3(this.rng.gaussian(0, 1), this.rng.gaussian(0, 1), this.rng.gaussian(0, 1)).multiplyScalar(size * 0.45);
      const delay = this.rng.next() * (big ? 1.4 : 0.4);
      const life = 0.7 + this.rng.next() * 0.7 + delay;
      const s = size * (0.2 + this.rng.next() * 0.35);
      this.spark(pos.clone().add(off), velocity.clone().multiplyScalar(0.8), life, s * 0.3, s * 1.8, reaper && this.rng.chance(0.5) ? this.redTex : this.fireTex, 0xffffff);
    }
    // Core flash.
    this.spark(pos, velocity.clone(), 0.35, size * 0.8, size * 2.2, this.flashTex, 0xffffff);
    // Smoke / debris cloud.
    for (let i = 0; i < explosionSmoke(size); i++) {
      const v = new THREE.Vector3(this.rng.gaussian(0, 1), this.rng.gaussian(0, 1), this.rng.gaussian(0, 1)).multiplyScalar(size * 0.5).add(velocity);
      this.spark(pos, v, 4 + this.rng.next() * 4, size * 0.4, size * 2.2, this.smokeTex, 0x9a9a9a);
    }
    // Debris: fling the ship's own mesh pieces plus generic fragments.
    const fragments = Math.min(40, Math.floor(size * 3));
    for (let i = 0; i < fragments; i++) {
      const s = size * (0.04 + this.rng.next() * 0.1);
      this.fragments.push({
        shape: i % this.debrisGeo.length,
        scale: s,
        pos: pos.clone().add(new THREE.Vector3(this.rng.gaussian(0, 1), this.rng.gaussian(0, 1), this.rng.gaussian(0, 1)).multiplyScalar(size * 0.3)),
        rotation: new THREE.Euler(),
        vel: new THREE.Vector3(this.rng.gaussian(0, 1), this.rng.gaussian(0, 1), this.rng.gaussian(0, 1)).multiplyScalar(size * 0.35).add(velocity),
        spin: new THREE.Vector3(this.rng.gaussian(0, 2), this.rng.gaussian(0, 2), this.rng.gaussian(0, 2)),
        life: 12 + this.rng.next() * 10,
      });
    }
    if (fragments > 0) this.drawFragments();
    for (const piece of pieces) {
      this.group.attach(piece);
      // Pieces separate outward from the centre of the break.
      const offset = this.pieceBox.setFromObject(piece).getCenter(this.pieceCentre).sub(pos);
      this.debris.push({
        mesh: piece,
        vel: breakupVelocity(offset, size, this.rng).add(velocity),
        spin: new THREE.Vector3(this.rng.gaussian(0, 0.6), this.rng.gaussian(0, 0.6), this.rng.gaussian(0, 0.6)),
        life: 10 + this.rng.next() * 6,
        maxLife: 16,
      });
    }
    if (big) {
      this.flashLight.position.copy(pos);
      this.flashLight.color.setHex(reaper ? 0xff6040 : 0xffb070);
      this.flashLight.intensity = 60 * size;
      this.flashLightLife = 1.2;
    }
    return big ? 2.6 : 1.2;
  }

  /** Secondary explosion along a dying capital ship (pre-destruction sequence). */
  /** A secondary explosion on a dying hull. `drift` is the hull's own velocity, so the burst stays with it. */
  secondary(pos: THREE.Vector3, size: number, drift = new THREE.Vector3()): void {
    this.spark(pos, drift.clone(), 0.5, size * 0.3, size * 1.1, this.fireTex, 0xffffff);
    for (let i = 0; i < 4; i++) {
      const v = new THREE.Vector3(this.rng.gaussian(0, 1), this.rng.gaussian(0, 1), this.rng.gaussian(0, 1)).multiplyScalar(size * 0.5).add(drift);
      this.spark(pos, v, 0.8, size * 0.15, size * 0.03, this.fireTex, 0xffc080);
    }
  }

  // --------------------------------------------------------- per-frame sync

  /** Update tracers from simulation projectiles (positions in km). */
  setTracers(items: readonly { id?: number; pos: { x: number; y: number; z: number }; vel: { x: number; y: number; z: number }; big?: boolean; weapon?: { damage: number; blast?: unknown; projectileSpeed?: number } }[], alpha: number, dt: number): void {
    let n = 0;
    const dir = new THREE.Vector3();
    const stride=Math.max(1,Math.ceil(items.length/this.tracerMax));
    for(let i=0;i<items.length;i+=stride){
      const it=items[i];
      const calibre=it.weapon?.damage??(it.big?900:50);
      const big=calibre>=600;
      if (n >= this.tracerMax) break;
      // A light cannon's rounds are drawn one in four, as tracer is loaded (see visualWeight.ts).
      if (!tracerShown(calibre, it.id ?? 0)) continue;
      const px = (it.pos.x + it.vel.x * alpha * dt) * KM;
      const py = (it.pos.y + it.vel.y * alpha * dt) * KM;
      const pz = (it.pos.z + it.vel.z * alpha * dt) * KM;
      dir.set(it.vel.x, it.vel.y, it.vel.z);
      const speed = dir.length() * KM;
      dir.normalize();
      this.tracerDummy.position.set(px, py, pz);
      this.tracerDummy.lookAt(px + dir.x, py + dir.y, pz + dir.z);
      // Subtle calibre-dependent visual thickness: large HADES/NOVA
      // projectiles read as heavy axial slugs, not a global bloom flash.
      // Projectile origin, timing, trajectory and impact remain sim-owned.
      const superHeavy=calibre>=10000?
        Math.min(2.7,1.6+Math.log10(calibre/10000)*0.55):1;
      // Secondary guns are fine streaks, so the main batteries read first (see visualWeight.ts).
      const size = tracerSize(calibre);
      const len = Math.max(big ? 1.5 : 0.8, speed * 0.06) * size.length * Math.sqrt(superHeavy);
      const w = size.width*superHeavy;
      this.tracerDummy.scale.set(w, w, len);
      this.tracerDummy.updateMatrix();
      this.tracerMesh.setColorAt(n, this.tracerColour.setHex(tracerColour(it.weapon)));
      this.tracerMesh.setMatrixAt(n++, this.tracerDummy.matrix);
    }
    this.tracerMesh.count = n;
    this.tracerMesh.instanceMatrix.needsUpdate = true;
    if (this.tracerMesh.instanceColor) this.tracerMesh.instanceColor.needsUpdate = true;
  }

  setMissiles(items: readonly { pos: { x: number; y: number; z: number }; vel: { x: number; y: number; z: number }; alive?: boolean }[], alpha: number, dt: number): void {
    let n = 0;
    const stride=Math.max(1,Math.ceil(items.length/512));
    for(let i=0;i<items.length;i+=stride){
      const it=items[i];
      if(it.alive===false)continue;
      if (n >= 512) break;
      this.tracerDummy.position.set((it.pos.x + it.vel.x * alpha * dt) * KM, (it.pos.y + it.vel.y * alpha * dt) * KM, (it.pos.z + it.vel.z * alpha * dt) * KM);
      this.tracerDummy.rotation.set(0, 0, 0);
      this.tracerDummy.scale.setScalar(2.2);
      this.tracerDummy.updateMatrix();
      this.missileMesh.setMatrixAt(n++, this.tracerDummy.matrix);
    }
    this.missileMesh.count = n;
    this.missileMesh.instanceMatrix.needsUpdate = true;
  }

  /** Active beams: reuse geometry, meshes and impact sprites instead of
   * searching the pool and spawning a short-lived spark on every frame. */
  setBeams(beams: { start: THREE.Vector3; end: THREE.Vector3; kind: 'thanix' | 'reaper_beam'; intensity: number }[]): void {
    let used = 0;
    for (const beam of beams) {
      let slot = this.beamPool[used++];
      if (!slot) {
        const core = new THREE.Mesh(this.beamGeometry, this.beamCoreMatReaper);
        const glow = new THREE.Mesh(this.beamGeometry, this.beamGlowMatReaper);
        const impact = new THREE.Sprite(new THREE.SpriteMaterial({
          map: this.redTex, color: 0xffffff, transparent: true, opacity: 0.85,
          blending: THREE.AdditiveBlending, depthWrite: false,
        }));
        core.frustumCulled = false;
        glow.frustumCulled = false;
        this.group.add(core, glow, impact);
        slot = { core, glow, impact };
        this.beamPool.push(slot);
      }
      const reaper = beam.kind === 'reaper_beam';
      slot.core.material = reaper ? this.beamCoreMatReaper : this.beamCoreMatThanix;
      slot.glow.material = reaper ? this.beamGlowMatReaper : this.beamGlowMatThanix;
      const len = beam.start.distanceTo(beam.end);
      const mid = this.beamMid.copy(beam.start).add(beam.end).multiplyScalar(0.5);
      const coreR = (reaper ? 0.09 : 0.05) * beam.intensity;
      slot.core.visible = true;
      slot.core.position.copy(mid);
      slot.core.lookAt(beam.end);
      slot.core.scale.set(coreR, coreR, len);
      slot.glow.visible = true;
      slot.glow.position.copy(mid);
      slot.glow.lookAt(beam.end);
      slot.glow.scale.set(coreR * 3.2, coreR * 3.2, len);
      slot.impact.visible = true;
      slot.impact.position.copy(beam.end);
      slot.impact.scale.setScalar(coreR * 9);
      const mat = slot.impact.material as THREE.SpriteMaterial;
      mat.map = reaper ? this.redTex : this.blueTex;
    }
    for (let i = used; i < this.beamPool.length; i++) {
      const slot = this.beamPool[i];
      slot.core.visible = false;
      slot.glow.visible = false;
      slot.impact.visible = false;
    }
  }

  /** Read fixed-tick GARDIAN/Reaper PD vectors directly; no GPU-frame
   * THREE.Vector3 allocations or array mapping per shot. Optional scale
   * converts km into render units. Uniform sampling retains all battle wings.
   */
  setPointDefence(lines: readonly { from: {x:number;y:number;z:number}; to: {x:number;y:number;z:number}; kind?: 'gardian'|'reaper_pd'; reaper?:boolean }[], positionScale = 1): void {
    let n=0;
    const capacity=512;
    const stride=Math.max(1,Math.ceil(lines.length/capacity));
    for(let index=0;index<lines.length&&n<capacity;index+=stride){
      const l=lines[index];
      const i=n++*6;
      this.pdPositions[i]=l.from.x*positionScale;
      this.pdPositions[i+1]=l.from.y*positionScale;
      this.pdPositions[i+2]=l.from.z*positionScale;
      this.pdPositions[i+3]=l.to.x*positionScale;
      this.pdPositions[i+4]=l.to.y*positionScale;
      this.pdPositions[i+5]=l.to.z*positionScale;
      const reaper=l.reaper??(l.kind==='reaper_pd');
      const glow=pointDefenceBrightness(reaper);
      const r=(reaper?1:.5)*glow, g=(reaper?.25:.95)*glow, b=(reaper?.15:1)*glow;
      this.pdColors[i]=r;this.pdColors[i+1]=g;this.pdColors[i+2]=b;
      this.pdColors[i+3]=r;this.pdColors[i+4]=g;this.pdColors[i+5]=b;
    }
    this.pdGeometry.setDrawRange(0,n*2);
    (this.pdGeometry.attributes.position as THREE.BufferAttribute).needsUpdate=true;
    (this.pdGeometry.attributes.color as THREE.BufferAttribute).needsUpdate=true;
  }

  update(dt: number): void {
    const rings = [];
    for (const ring of this.nuclearRings) {
      ring.life -= dt;
      if (ring.life <= 0) { this.group.remove(ring.mesh); ring.mesh.visible = false; this.ringPool.push(ring.mesh); continue; }
      ring.mesh.scale.setScalar(ring.size * (0.4 + (1 - ring.life / ring.span) * 4.5));
      ring.mesh.material.opacity = 0.7 * ring.life / ring.span;
      rings.push(ring);
    }
    this.nuclearRings = rings;
    // Sparks.
    const keep: Spark[] = [];
    for (const batch of this.sparkBatches) batch.begin();
    for (const s of this.sparks) {
      s.life -= dt;
      if (s.life <= 0) continue;
      const t = 1 - s.life / s.maxLife;
      s.pos.addScaledVector(s.vel, dt);
      this.sparkBatches[s.batch].push(s.pos.x, s.pos.y, s.pos.z, s.startScale + (s.endScale - s.startScale) * t, s.r, s.g, s.b,
        t < 0.1 ? t / 0.1 : 1 - (t - 0.1) / 0.9);
      keep.push(s);
    }
    for (const batch of this.sparkBatches) batch.commit();
    this.sparks = keep;
    // Generic fragments.
    const keepF: Fragment[] = [];
    for (const f of this.fragments) {
      f.life -= dt;
      if (f.life <= 0) continue;
      f.pos.addScaledVector(f.vel, dt);
      f.rotation.x += f.spin.x * dt;
      f.rotation.y += f.spin.y * dt;
      f.rotation.z += f.spin.z * dt;
      if (f.life < 2) f.scale *= Math.max(0.6, 1 - dt * 0.3);
      keepF.push(f);
    }
    this.fragments = keepF;
    this.drawFragments();
    // The destroyed ship's own pieces.
    const keepD: Debris[] = [];
    for (const d of this.debris) {
      d.life -= dt;
      if (d.life <= 0) {
        this.removeDebris(d.mesh);
        continue;
      }
      d.mesh.position.addScaledVector(d.vel, dt);
      d.mesh.rotation.x += d.spin.x * dt;
      d.mesh.rotation.y += d.spin.y * dt;
      d.mesh.rotation.z += d.spin.z * dt;
      if (d.life < 2) {
        const f = d.life / 2;
        d.mesh.scale.multiplyScalar(Math.max(0.6, 1 - dt * 0.3));
        d.mesh.traverse((o) => {
          const m = (o as THREE.Mesh).material as THREE.Material | undefined;
          if (m && m !== this.debrisMat && 'opacity' in m) {
            (m as THREE.Material).transparent = true;
            (m as THREE.Material).opacity = f;
          }
        });
      }
      keepD.push(d);
    }
    this.debris = keepD;
    this.barriers.update(dt);
    this.nuclear.update(dt);
    if (this.flashLightLife > 0) {
      this.flashLightLife -= dt;
      this.flashLight.intensity *= Math.max(0, 1 - dt * 3);
      if (this.flashLightLife <= 0) this.flashLight.intensity = 0;
    }
  }

  /** Write every live fragment into the batch of its shape. */
  private drawFragments(): void {
    for (const batch of this.fragmentBatches) batch.begin();
    const dummy = this.fragmentDummy;
    for (const f of this.fragments) {
      dummy.position.copy(f.pos);
      dummy.rotation.copy(f.rotation);
      dummy.scale.setScalar(f.scale);
      dummy.updateMatrix();
      this.fragmentBatches[f.shape].push(dummy.matrix);
    }
    for (const batch of this.fragmentBatches) batch.commit();
  }

  private removeDebris(object: THREE.Object3D): void {
    this.group.remove(object);
    object.traverse(child => {
      const mesh = child as THREE.Mesh;
      if (!mesh.isMesh) return;
      for (const m of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) if (m !== this.debrisMat) m.dispose();
      // Debris pieces share ship-template or pooled geometry: never dispose it here.
    });
  }

  /**
   * The scene is drawn into the HDR target (bloom on): barrier shells convert their colours, and layers blend in linear light before tone mapping, so a beam core at 0.95 no longer
   * burns out the way it does when tone-mapped layers add up on the canvas. Give the cores real HDR brightness in the
   * beam's own hue instead (linear RGB): they read hot again, and their spill of light keeps the beam's colour.
   */
  setHdrScene(boost: number): void {
    this.barriers.hdr = true;
    this.nuclear.setHdr(boost);
    this.beamCoreMatReaper.color.setRGB(1.0 * boost, 0.42 * boost, 0.3 * boost);
    this.beamCoreMatThanix.color.setRGB(0.4 * boost, 0.62 * boost, 1.0 * boost);
  }

  dispose(): void {
    this.clear();
    this.barriers.dispose();
    const geometries = new Set<THREE.BufferGeometry>();
    const materials = new Set<THREE.Material>();
    this.group.traverse(object => {
      const mesh = object as THREE.Mesh;
      if (mesh.geometry) geometries.add(mesh.geometry);
      if (mesh.material) for (const m of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) materials.add(m);
    });
    for (const geometry of geometries) geometry.dispose();
    for (const material of materials) material.dispose();
    for (const beam of this.beamPool) beam.impact.material.dispose();
    for (const texture of [this.flashTex, this.fireTex, this.smokeTex, this.blueTex, this.redTex]) texture.dispose();
    for (const batch of this.fragmentBatches) batch.dispose();
    for (const geometry of this.debrisGeo) geometry.dispose();
    this.debrisMat.dispose();
    this.nuclearRingGeometry.dispose();
    for (const ring of this.ringPool) ring.material.dispose();
  }

  clear(): void {
    this.sparks = [];
    for (const batch of this.sparkBatches) { batch.begin(); batch.commit(); }
    for (const d of this.debris) this.removeDebris(d.mesh);
    this.debris = [];
    this.fragments = [];
    this.drawFragments();
    this.barriers.clear();
    this.nuclear.clear();
    for (const ring of this.nuclearRings) { this.group.remove(ring.mesh); ring.mesh.visible = false; this.ringPool.push(ring.mesh); }
    this.nuclearRings = [];
    this.setBeams([]);
    this.setPointDefence([]);
    this.tracerMesh.count = 0;
    this.missileMesh.count = 0;
    this.flashLight.intensity = 0;
  }
}
