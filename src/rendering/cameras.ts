import * as THREE from 'three';

/**
 * Battle camera rig. All modes write a desired position/look target; the rig
 * smooths toward them so switching modes produces a transition rather than a
 * cut. Positions are in render units.
 */
export type CameraMode = 'tactical' | 'cinematic' | 'follow' | 'free' | 'projectile' | 'reaper' | 'command' | 'gunnery';

export const CAMERA_MODE_LABELS: Record<CameraMode, string> = {
  tactical: 'Tactical',
  cinematic: 'Cinematic',
  follow: 'Ship follow',
  free: 'Free',
  projectile: 'Projectile',
  reaper: 'Reaper',
  command: 'Command',
  gunnery: 'First-person gunnery',
};

/**
 * Where the Reaper view sits and looks, in hull lengths from the hull's centre (see the `reaper` camera). A capital
 * is seen from the brow of its hood. A destroyer is a compact body over four legs with no hood to stand on: it is
 * seen from close behind and above, over its back. (Its camera used to sit 0.27 of a unit above its centre, inside
 * its carapace plates, and showed the insides of them.)
 */
export const REAPER_VIEW = {
  capital: { forward: -0.035, up: 0.178, right: 0.055, lookDown: 0.12 },
  destroyer: { forward: -0.78, up: 0.44, right: 0.18, lookDown: 0.06 },
};

export interface CameraSubject {
  /** Which hull this is, so the rig knows when it has been given another one. */
  id?: string;
  position: THREE.Vector3;
  velocity: THREE.Vector3;
  heading: THREE.Vector3;
  size: number;
}

export interface CinematicFrame {
  from: CameraSubject;
  to?: CameraSubject;
  age: number;
  group?: { centre: THREE.Vector3; radius: number; heading: THREE.Vector3 };
}

/**
 * Chase and orbit distances in hull lengths, by hull size (render units). Small hulls keep the roomy framing they
 * always had; a capital-scale hull (a 2 km Reaper is 20 units) is held closer so that it fills the frame instead of
 * sitting in the middle of it: at the old 2.4 lengths a Reaper side-on spanned a quarter of the frame's width.
 */
const capitalScale = (size: number): number => THREE.MathUtils.smoothstep(size, 6, 20);
export const followLengths = (size: number): number => 2.4 - 1.0 * capitalScale(size);
export const cinematicOrbitLengths = (size: number): number => 3.2 - 1.45 * capitalScale(size);
export const cinematicOrbitHeight = (size: number): number => 1.0 - 0.62 * capitalScale(size);
/**
 * How far a two-ship cinematic shot leans to an over-the-shoulder view of its larger ship, 0 to 1. The side-on
 * two-shot backs off with the distance between the ships, so a 2 km Reaper firing at a target 20 km away spanned a
 * tenth of the frame's width. For a capital-scale hull whose partner is more than about three hull lengths off, the camera
 * moves in behind that hull's shoulder and looks down the line of fire instead: the hull fills the foreground and
 * the target stays in the picture. Small hulls and close pairs keep the side-on two-shot.
 */
export const overShoulderWeight = (size: number, separation: number): number =>
  capitalScale(size) * THREE.MathUtils.smoothstep(separation / Math.max(size, 1e-6), 1.5, 3.5);

export class CameraRig {
  readonly camera: THREE.PerspectiveCamera;
  mode: CameraMode = 'tactical';
  /** Optical magnification never changes simulation, targeting or camera mount. */
  gunneryZoomed = false;
  /** Orbit state for tactical camera. */
  yaw = 0.6;
  pitch = 0.55;
  distance = 900;
  focus = new THREE.Vector3();
  /** Free camera state. */
  freePos = new THREE.Vector3(0, 300, -900);
  freeYaw = 0;
  freePitch = -0.2;
  /** Where the free camera is flying to; it eases there, so a wheel notch or a key is a glide, not a jump. */
  freeGoal = new THREE.Vector3(0, 300, -900);
  /**
   * How far the free camera is from the nearest thing worth looking at (units), set by the view. Its speed follows
   * from it: slow and exact beside a frigate, fast across an empty field. It flew at 600 units a second anywhere,
   * which crosses a frigate's length five hundred times a second.
   */
  freeReach = 600;
  /** Smoothing. */
  private desiredPos = new THREE.Vector3();
  private desiredLook = new THREE.Vector3();
  private currentLook = new THREE.Vector3();
  private transition = 0;
  private shake = 0;
  /** While the camera rides with a hull: where it and its look point are, measured from that hull. */
  private anchorId: string | undefined;
  private readonly relPos = new THREE.Vector3();
  private readonly relLook = new THREE.Vector3();
  private riding = false;
  private readonly tmp = new THREE.Vector3();

  constructor(aspect: number) {
    this.camera = new THREE.PerspectiveCamera(50, aspect, 1, 600_000);
    this.camera.position.set(0, 400, -1200);
    this.currentLook.set(0, 0, 0);
  }

  setMode(mode: CameraMode): void {
    if (mode === this.mode) return;
    if (mode === 'free') {
      // Start free flight from where the camera currently is.
      this.freePos.copy(this.camera.position);
      this.freeGoal.copy(this.camera.position);
      const dir = this.tmp.copy(this.currentLook).sub(this.camera.position).normalize();
      this.freeYaw = Math.atan2(dir.x, dir.z);
      this.freePitch = Math.asin(THREE.MathUtils.clamp(dir.y, -1, 1));
    }
    if (mode === 'follow') {
      // Chase view starts behind and slightly above the ship; dragging then orbits freely around it.
      this.yaw = 0;
      this.pitch = 0.15;
      this.distance = 320;
    }
    this.mode = mode;
    if (mode !== 'gunnery') {
      this.gunneryZoomed = false;
      this.camera.fov = 50;
      this.camera.updateProjectionMatrix();
    }
    // Optical gunnery must stay physically attached to the firing mount.
    this.transition = mode === 'gunnery' ? 0 : 1;
  }

  toggleGunneryZoom(): void {
    if (this.mode !== 'gunnery') return;
    this.gunneryZoomed = !this.gunneryZoomed;

  }

  addShake(amount: number): void {
    this.shake = Math.min(1, this.shake + amount);
  }

  // --- Input hooks (called by the controller).
  orbit(dx: number, dy: number): void {
    if (this.mode === 'gunnery') return; // Reticle is not a steering command.
    if (this.mode === 'free') {
      this.freeYaw -= dx * 0.003;
      this.freePitch = THREE.MathUtils.clamp(this.freePitch - dy * 0.003, -1.5, 1.5);
      return;
    }
    this.yaw -= dx * 0.005;
    this.pitch = THREE.MathUtils.clamp(this.pitch + dy * 0.005, -1.5, 1.5); // full orbit: above and below the plane
  }
  zoom(delta: number): void {
    if (this.mode === 'gunnery') return; // Explicit optical toggle only.
    this.distance = THREE.MathUtils.clamp(this.distance * Math.exp(delta * 0.0012), 6, 60_000);
  }
  pan(dx: number, dy: number): void {
    const right = new THREE.Vector3(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
    const fwd = new THREE.Vector3(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
    const k = this.distance * 0.0015;
    this.focus.addScaledVector(right, -dx * k).addScaledVector(fwd, -dy * k);
  }
  /** The way the free camera looks. */
  private freeDirection(out: THREE.Vector3): THREE.Vector3 {
    return out.set(Math.sin(this.freeYaw) * Math.cos(this.freePitch), Math.sin(this.freePitch), Math.cos(this.freeYaw) * Math.cos(this.freePitch));
  }
  /** Units a second the free camera flies at under the keys: its distance from the nearest hull, within limits. */
  freeSpeed(fast: boolean): number {
    return THREE.MathUtils.clamp(this.freeReach * 1.2, 12, 2500) * (fast ? 4 : 1);
  }
  /** The free camera's own right and up, as they are on screen. */
  private freeAxes(): { dir: THREE.Vector3; right: THREE.Vector3; up: THREE.Vector3 } {
    const dir = this.freeDirection(new THREE.Vector3());
    const right = new THREE.Vector3().crossVectors(dir, new THREE.Vector3(0, 1, 0)).normalize();
    const up = new THREE.Vector3().crossVectors(right, dir).normalize();
    return { dir, right, up };
  }
  /**
   * Keys: forward and back along the view, sideways, and straight up and down. Sideways was the wrong way round
   * (D flew the camera to its left): the camera looks along +z at yaw 0, where its right is −x, not +x.
   */
  freeMove(forward: number, strafe: number, up: number, dt: number, fast: boolean): void {
    const speed = this.freeSpeed(fast) * dt;
    const { dir, right } = this.freeAxes();
    this.freeGoal.addScaledVector(dir, forward * speed).addScaledVector(right, strafe * speed).addScaledVector(new THREE.Vector3(0, 1, 0), up * speed);
  }
  /** Mouse wheel: fly along the view, a fifth of the way to the nearest hull for each notch (`notches` < 0 is forward). */
  freeDolly(notches: number): void {
    const step = THREE.MathUtils.clamp(this.freeReach * 0.2, 1.5, 4000);
    this.freeGoal.addScaledVector(this.freeDirection(new THREE.Vector3()), -notches * step);
  }
  /** Middle-button drag (pixels): slide across the view, the scene following the pointer. */
  freeTruck(dx: number, dy: number): void {
    const { right, up } = this.freeAxes();
    const k = THREE.MathUtils.clamp(this.freeReach, 6, 20_000) * 0.0016;
    this.freeGoal.addScaledVector(right, -dx * k).addScaledVector(up, dy * k);
  }

  /**
   * Per-frame update. `subject` is the followed ship for follow/reaper
   * modes; `cinematic` supplies a framing pair; `projectile` is the tracked
   * round. Any may be undefined, in which case the rig falls back to tactical.
   */
  update(dt: number, opts: { subject?: CameraSubject; cinematic?: CinematicFrame; projectile?: CameraSubject; gunnery?: { position: THREE.Vector3; aim: THREE.Vector3; signalLost?: boolean }; fleetCentre: THREE.Vector3 }): void {
    const cam = this.camera;
    let instant = false;
    switch (this.mode) {
      case 'tactical': {
        this.desiredLook.copy(this.focus);
        const off = new THREE.Vector3(Math.sin(this.yaw) * Math.cos(this.pitch), Math.sin(this.pitch), Math.cos(this.yaw) * Math.cos(this.pitch)).multiplyScalar(this.distance);
        this.desiredPos.copy(this.focus).add(off);
        break;
      }
      case 'command': {
        this.desiredLook.copy(this.focus);
        this.desiredPos.copy(this.focus).add(new THREE.Vector3(Math.sin(this.yaw) * 0.08, 1, Math.cos(this.yaw) * 0.08).normalize().multiplyScalar(Math.max(this.distance, 1200)));
        break;
      }
      case 'gunnery': {
        const station = opts.gunnery;
        if (!station) return this.fallback(dt, opts.fleetCentre);
        if (station.signalLost) this.shake = 0;
        this.desiredPos.copy(station.position);
        this.desiredLook.copy(station.aim);
        instant = true;
        break;
      }
      case 'follow': {
        const s = opts.subject;
        if (!s) return this.fallback(dt, opts.fleetCentre);
        // Free orbit around the followed ship: yaw and pitch rotate the chase offset relative to its heading,
        // so dragging looks at it from any side, above or below; the wheel scales the chase distance.
        const h = Math.atan2(s.heading.x, s.heading.z);
        const dist = (s.size * followLengths(s.size) + 3) * THREE.MathUtils.clamp(this.distance / 320, 0.35, 5);
        const a = h + Math.PI + this.yaw;
        const off = new THREE.Vector3(Math.sin(a) * Math.cos(this.pitch), Math.sin(this.pitch) + 0.25, Math.cos(a) * Math.cos(this.pitch)).normalize().multiplyScalar(dist);
        this.desiredPos.copy(s.position).add(off);
        this.desiredLook.copy(s.position).addScaledVector(s.heading, s.size * 0.6);
        return this.apply(dt, false, s);
      }
      case 'reaper': {
        const s = opts.subject;
        if (!s) return this.fallback(dt, opts.fleetCentre);
        // On the brow: just behind the crown of the hood and a little off the centre line, looking forward and down
        // over its front lip, so the hood lies under the camera and the limbs reach into the frame with the fight
        // beyond them. The camera used to sit over the aft blade; with a mantle of its proper size the hood stood
        // between that camera and everything ahead of it.
        const right = new THREE.Vector3().crossVectors(s.heading, new THREE.Vector3(0, 1, 0));
        if (right.lengthSq() < 1e-6) right.set(1, 0, 0);
        right.normalize();
        const w = capitalScale(s.size), a = REAPER_VIEW.destroyer, b = REAPER_VIEW.capital;
        const at = (key: keyof typeof a): number => s.size * (a[key] + (b[key] - a[key]) * w);
        this.desiredPos.copy(s.position).addScaledVector(s.heading, at('forward')).addScaledVector(right, at('right')).add(new THREE.Vector3(0, at('up'), 0));
        this.desiredLook.copy(s.position).addScaledVector(s.heading, s.size * 0.9).add(new THREE.Vector3(0, -at('lookDown'), 0));
        return this.apply(dt, false, s);
      }
      case 'projectile': {
        const p = opts.projectile;
        if (!p) return this.fallback(dt, opts.fleetCentre);
        const dir = p.velocity.clone().normalize();
        const side = new THREE.Vector3().crossVectors(dir, new THREE.Vector3(0, 1, 0)).normalize();
        this.desiredPos.copy(p.position).addScaledVector(dir, -40).addScaledVector(side, 14).add(new THREE.Vector3(0, 8, 0));
        this.desiredLook.copy(p.position).addScaledVector(dir, 60);
        instant = true;
        break;
      }
      case 'cinematic': {
        const c = opts.cinematic;
        if (!c) return this.fallback(dt, opts.fleetCentre);
        const from = c.from;
        const to = c.to;
        if (c.group) {
          const g = c.group;
          const forward = g.heading.clone().setY(0).normalize();
          if (forward.lengthSq() < 1e-6) forward.set(0, 0, 1);
          const side = new THREE.Vector3(forward.z, 0, -forward.x);
          const drift = Math.sin(c.age * 0.08) * 0.06;
          const back = Math.max(30, g.radius * 2.9 / Math.min(1, cam.aspect));
          const offset = forward.clone().negate().addScaledVector(side, 0.50 + drift).add(new THREE.Vector3(0, 0.35, 0)).normalize();
          this.desiredPos.copy(g.centre).addScaledVector(offset, back);
          this.desiredLook.copy(g.centre).addScaledVector(forward, g.radius * 0.12);
        } else if (to) {
          // Frame both subjects from a point off the line between them.
          const mid = from.position.clone().add(to.position).multiplyScalar(0.5);
          const line = to.position.clone().sub(from.position);
          const dist = line.length();
          const side = new THREE.Vector3().crossVectors(line.normalize(), new THREE.Vector3(0, 1, 0));
          if (side.lengthSq() < 1e-6) side.set(1, 0, 0);
          else side.normalize();
          const drift = Math.sin(c.age * 0.10) * 0.07;
          const back = Math.max(from.size * 3, to.size * 3, dist * (0.72 + Math.abs(line.y) * 0.60), 20);
          this.desiredPos.copy(mid).addScaledVector(side, back * (1 + drift)).add(new THREE.Vector3(0, back * 0.30, 0)).addScaledVector(line, -dist * 0.12);
          this.desiredLook.copy(mid);
          // A capital-scale hull with a distant partner: move in over its shoulder and look down the line of fire.
          const anchor = to.size > from.size ? to : from;
          const shoulder = overShoulderWeight(anchor.size, dist);
          if (shoulder > 0) {
            const toward = anchor === from ? line : line.clone().negate();
            const s = anchor.size;
            const pos = anchor.position.clone().addScaledVector(toward, -0.8 * s).addScaledVector(side, 0.55 * s * (1 + drift)).add(new THREE.Vector3(0, 0.27 * s, 0));
            const look = anchor.position.clone().addScaledVector(toward, 1.1 * s);
            this.desiredPos.lerp(pos, shoulder);
            this.desiredLook.lerp(look, shoulder);
          }
        } else {
          const ang = this.yaw + Math.sin(c.age * 0.08) * 0.25;
          const r = from.size * cinematicOrbitLengths(from.size) + 8;
          this.desiredPos.copy(from.position).add(new THREE.Vector3(Math.sin(ang) * r, from.size * cinematicOrbitHeight(from.size) + 3, Math.cos(ang) * r));
          this.desiredLook.copy(from.position);
        }
        break;
      }
      case 'free': {
        this.freePos.lerp(this.freeGoal, 1 - Math.exp(-Math.max(0, dt) * 10));
        this.desiredPos.copy(this.freePos);
        const dir = this.freeDirection(new THREE.Vector3());
        this.desiredLook.copy(this.freePos).add(dir.multiplyScalar(100));
        instant = true;
        break;
      }
    }
    this.apply(dt, instant);
  }

  private fallback(dt: number, centre: THREE.Vector3): void {
    this.focus.lerp(centre, 0.05);
    this.desiredLook.copy(this.focus);
    const off = new THREE.Vector3(Math.sin(this.yaw) * Math.cos(this.pitch), Math.sin(this.pitch), Math.cos(this.yaw) * Math.cos(this.pitch)).multiplyScalar(this.distance);
    this.desiredPos.copy(this.focus).add(off);
    this.apply(dt, false);
  }

  /**
   * Move the camera toward where this frame wants it. With `ride`, the camera travels with that hull and only its
   * place relative to the hull is eased.
   *
   * The camera used to ease its own position in space toward a point beside a moving hull. An eased follower lags
   * its target by an amount that depends on the length of the frame, so with uneven frames the hull slid back and
   * forth in the picture: the judder was worst when the frame rate was. Riding with the hull, the hull is still
   * in the frame whatever the frames do, and the easing is spent on what should be eased (an orbit drag, the hull
   * turning, the move in from another camera).
   */
  private apply(dt: number, instant: boolean, ride?: CameraSubject): void {
    const cam = this.camera;
    if (this.transition > 0) this.transition = Math.max(0, this.transition - dt / 0.9);
    // Slower blend while transitioning, snappier otherwise.
    const k = instant && this.transition === 0 ? 1 : 1 - Math.exp(-dt * (this.transition > 0 ? 4 : 9));
    if (ride) {
      // Coming from another camera or another hull: start from where the camera is, measured from this hull.
      if (!this.riding || this.anchorId !== ride.id) {
        this.relPos.copy(cam.position).sub(ride.position);
        this.relLook.copy(this.currentLook).sub(ride.position);
        this.riding = true;
        this.anchorId = ride.id;
      }
      this.relPos.lerp(this.tmp.copy(this.desiredPos).sub(ride.position), k);
      this.relLook.lerp(this.tmp.copy(this.desiredLook).sub(ride.position), k);
      cam.position.copy(ride.position).add(this.relPos);
      this.currentLook.copy(ride.position).add(this.relLook);
    } else {
      this.riding = false;
      cam.position.lerp(this.desiredPos, k);
      this.currentLook.lerp(this.desiredLook, k);
    }
    if (this.shake > 0) {
      // Up to 3 units, and never more than 3 % of the way to what the camera is looking at. The knock was 3 units at
      // any distance: nothing from 900 units up, and half the distance to a frigate followed from six units, so a
      // hull dying somewhere near threw a close camera about for half a second.
      const s = this.shake * Math.min(3, cam.position.distanceTo(this.currentLook) * 0.03);
      const knock = this.tmp.set((Math.random() - 0.5) * s, (Math.random() - 0.5) * s, (Math.random() - 0.5) * s);
      cam.position.add(knock);
      // A knock moves the camera and is then eased out, riding or not: it is kept, not redrawn every frame.
      if (ride) this.relPos.add(knock);
      this.shake = Math.max(0, this.shake - dt * 2.5);
    }
    cam.lookAt(this.currentLook);
    // Optical magnification changes the lens only. Ease in tangent space so
    // the target reaches an exact 2x scale without moving the mounted camera.
    const targetTangent = Math.tan(THREE.MathUtils.degToRad(25)) /
      (this.mode === 'gunnery' && this.gunneryZoomed ? 2 : 1);
    const tangent = THREE.MathUtils.lerp(Math.tan(THREE.MathUtils.degToRad(cam.fov / 2)),
      targetTangent, 1 - Math.exp(-Math.max(0, dt) * 12));
    cam.fov = THREE.MathUtils.radToDeg(2 * Math.atan(tangent));
    // Gun cameras sit immediately at the muzzle and need a close near plane.
    const d = cam.position.distanceTo(this.currentLook);
    // The Reaper view rides on its own hull, a few tenths of a unit from it on a destroyer: it needs a near plane to
    // match, or the hull it rides on is cut away.
    cam.near = this.mode === 'gunnery' ? 0.06 : this.mode === 'reaper' ? THREE.MathUtils.clamp(d * 0.002, 0.03, 0.2) : THREE.MathUtils.clamp(d * 0.002, 0.2, 50);
    cam.updateProjectionMatrix();
  }

  resize(aspect: number): void {
    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();
  }
}
