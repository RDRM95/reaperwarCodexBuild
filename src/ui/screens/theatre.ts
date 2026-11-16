import { el } from '../dom';
import type { CameraMode } from '@/rendering/cameras';

/**
 * Theatre mode: the battle and nothing else, for watching and for recording.
 *
 * The interface goes, the tactical annotations go, and the picture is framed by cinema bars. A strip of controls
 * (pause, speed, camera, bars, leave) comes up when the mouse moves and goes again, with the pointer, when it has
 * been still for a few seconds, so a recording holds a clean frame without the player having to remember keys.
 */
export interface TheatreHost {
  readonly paused: boolean;
  readonly speed: number;
  readonly speedIndex: number;
  readonly cameraMode: CameraMode;
  togglePause(): void;
  setSpeed(index: number): void;
  setCamera(mode: CameraMode): void;
  leaveTheatre(): void;
}

/** The cameras offered in the theatre, in the order shown. */
export const THEATRE_CAMERAS: { mode: CameraMode; label: string; title: string }[] = [
  { mode: 'cinematic', label: 'Director', title: 'The camera picks its own shots' },
  { mode: 'follow', label: 'Follow', title: 'Stay with one ship; drag to look round it, wheel to close in' },
  { mode: 'free', label: 'Free', title: 'Fly anywhere: drag to look, wheel to fly along the view, middle-drag to slide, WASD and Q/E, Shift for speed' },
  { mode: 'tactical', label: 'Orbit', title: 'Orbit the battle: drag to turn, wheel to zoom' },
  { mode: 'chase', label: 'Chase', title: 'A fixed place behind one ship; again for the next position' },
  { mode: 'cockpit', label: 'Cockpit', title: 'From the seat of one ship, or of a fighter in flight; again for the next fighter' },
];

/** Seconds the pointer may rest before the strip and the pointer are put away. */
export const THEATRE_IDLE_SECONDS = 2.5;

export class Theatre {
  readonly root: HTMLDivElement;
  active = false;
  bars = true;
  /** When the pointer last moved, by the wall clock: the loop's own frame time is capped and runs slow when frames are long. */
  private movedAt = 0;
  private readonly strip: HTMLDivElement;
  private readonly pause: HTMLButtonElement;
  private readonly speed: HTMLSpanElement;
  private readonly barsButton: HTMLButtonElement;
  private readonly cameras: HTMLButtonElement[];
  private readonly hint: HTMLDivElement;
  private lastX = -1;
  private lastY = -1;
  /** A browser also sends a move when the page changes under a resting pointer; only a real move counts. */
  private readonly onPointer = (e: PointerEvent): void => {
    if (e.type === 'pointermove' && e.clientX === this.lastX && e.clientY === this.lastY) return;
    this.lastX = e.clientX;
    this.lastY = e.clientY;
    this.poke();
  };

  constructor(stage: HTMLElement, private readonly host: TheatreHost) {
    this.pause = el('button', { class: 'btn small', 'data-theatre': 'pause', title: 'Pause or resume (Space)', onclick: () => { host.togglePause(); this.refresh(); } }, '❚❚');
    this.speed = el('span', { class: 'theatre-speed mono', 'data-theatre': 'speed' }, '1×');
    this.cameras = THEATRE_CAMERAS.map((c) => el('button', { class: 'btn small', 'data-theatre-camera': c.mode, title: c.title, onclick: () => { host.setCamera(c.mode); this.refresh(); } }, c.label));
    this.barsButton = el('button', { class: 'btn small', 'data-theatre': 'bars', title: 'Cinema bars on or off', onclick: () => { this.bars = !this.bars; this.refresh(); } }, 'Bars');
    this.strip = el('div', { class: 'theatre-strip', 'data-theatre': 'strip' }, [
      this.pause,
      el('button', { class: 'btn small', 'data-theatre': 'slower', title: 'Slower ( [ )', onclick: () => { host.setSpeed(host.speedIndex - 1); this.refresh(); } }, '−'),
      this.speed,
      el('button', { class: 'btn small', 'data-theatre': 'faster', title: 'Faster ( ] )', onclick: () => { host.setSpeed(host.speedIndex + 1); this.refresh(); } }, '+'),
      el('span', { class: 'theatre-gap' }),
      ...this.cameras,
      el('span', { class: 'theatre-gap' }),
      this.barsButton,
      el('button', { class: 'btn small', 'data-theatre': 'leave', title: 'Leave theatre mode (T or Esc)', onclick: () => host.leaveTheatre() }, 'Leave'),
    ]);
    this.hint = el('div', { class: 'theatre-hint' }, 'THEATRE MODE · move the mouse for controls · T or Esc to leave');
    this.root = el('div', { class: 'theatre', 'data-screen': 'theatre', hidden: true }, [
      el('div', { class: 'theatre-bar top' }), el('div', { class: 'theatre-bar bottom' }), this.hint, this.strip,
    ]);
    stage.append(this.root);
  }

  show(on: boolean): void {
    if (on === this.active) return;
    this.active = on;
    this.root.hidden = !on;
    document.body.classList.toggle('theatre-on', on);
    if (on) {
      window.addEventListener('pointermove', this.onPointer);
      window.addEventListener('pointerdown', this.onPointer);
      this.poke();
      // The hint is an animation that plays once each time the theatre opens.
      this.hint.classList.remove('shown');
      void this.hint.offsetWidth;
      this.hint.classList.add('shown');
    } else {
      window.removeEventListener('pointermove', this.onPointer);
      window.removeEventListener('pointerdown', this.onPointer);
      document.body.classList.remove('theatre-idle');
    }
    this.refresh();
  }

  /** The mouse moved: bring the strip and the pointer back. */
  poke(): void {
    this.movedAt = performance.now();
    if (this.active) document.body.classList.remove('theatre-idle');
  }

  /** Called every frame. */
  tick(): void {
    if (!this.active || performance.now() - this.movedAt < THEATRE_IDLE_SECONDS * 1000) return;
    // Not while the pointer is on the strip: a button must not vanish from under it.
    if (!this.strip.matches(':hover')) document.body.classList.add('theatre-idle');
  }

  refresh(): void {
    if (!this.active) return;
    this.root.classList.toggle('bars', this.bars);
    this.barsButton.classList.toggle('active', this.bars);
    this.barsButton.setAttribute('aria-pressed', String(this.bars));
    this.pause.textContent = this.host.paused ? '▶' : '❚❚';
    this.pause.classList.toggle('active', this.host.paused);
    this.speed.textContent = `${this.host.speed}×`;
    for (const b of this.cameras) b.classList.toggle('active', b.dataset.theatreCamera === this.host.cameraMode);
  }

  dispose(): void {
    this.show(false);
    this.root.remove();
  }
}
