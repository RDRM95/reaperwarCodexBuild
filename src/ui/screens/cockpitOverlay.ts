import { el } from '../dom';
import { cockpitStyle, type CockpitStyle } from '@/rendering/cockpit';
import { BATTLESPACE_SCALE } from '@/simulation/constants';
import type { ShipState } from '@/simulation/types';

/**
 * What is drawn over the first-person view (the Cockpit camera): a canopy with its struts and instruments for a
 * piloted fighter, a red optic for an Oculus or any other Reaper, a bridge window for a warship. Text only; it
 * takes no pointer events and is rewritten ten times a second, not every frame.
 */
export interface CockpitHost {
  getShip(id: string): ShipState | undefined;
  /** Screen position of a point of the battle (simulation units), or undefined when it is behind the camera. */
  project(pos: { x: number; y: number; z: number }, width: number, height: number): { x: number; y: number; depth: number } | undefined;
}

export interface CockpitReadout { style: CockpitStyle; title: string; left: string[]; right: string[]; target: string[] }

const km = (units: number): string => (units / BATTLESPACE_SCALE).toFixed(units / BATTLESPACE_SCALE >= 100 ? 0 : 1);
const pct = (now: number, full: number): string => `${full > 0 ? Math.round(100 * Math.max(0, now) / full) : 0} %`;

/** The words on the instruments, from the ship's own state. Pure, so it can be tested. */
export function cockpitReadout(ship: ShipState, target: ShipState | undefined): CockpitReadout {
  const style = cockpitStyle(ship.role, ship.faction);
  const speed = Math.hypot(ship.vel.x, ship.vel.y, ship.vel.z) / BATTLESPACE_SCALE;
  const range = target ? Math.hypot(target.pos.x - ship.pos.x, target.pos.y - ship.pos.y, target.pos.z - ship.pos.z) : 0;
  const torpedoes = ship.weapons.filter((w) => w.def.kind === 'disruptor_torpedo' || w.def.kind === 'missile');
  const rounds = torpedoes.reduce((n, w) => n + (w.ammo ?? 0), 0);
  const gun = ship.weapons.find((w) => !w.def.antiSmall && w.def.kind !== 'disruptor_torpedo' && w.def.kind !== 'missile') ?? ship.weapons[0];
  const gunLine = gun ? (gun.beamRemaining > 0 ? 'FIRING' : gun.cooldown <= 0 ? 'READY' : `${Math.max(0, gun.cooldown).toFixed(1)} s`) : '—';
  if (style === 'optic') {
    // An Oculus does not read gauges. Three terse lines, as a machine would mark them.
    return { style, title: ship.name.toUpperCase(),
      left: [`VELOCITY ${speed.toFixed(2)}`, `INTEGRITY ${pct(ship.hull, ship.maxHull)}`],
      right: [`EMITTER ${gunLine}`, ship.barriers > 0 ? `FIELD ${pct(ship.barriers, ship.maxBarriers)}` : 'FIELD DOWN'],
      target: target ? [`HARVEST ${target.name.toUpperCase()}`, `${km(range)} KM`] : ['SEEKING'] };
  }
  return { style, title: ship.name.toUpperCase(),
    left: [`SPD ${speed.toFixed(2)} km/s`, `HULL ${pct(ship.hull, ship.maxHull)}`, ship.maxBarriers > 0 ? `BARRIER ${pct(ship.barriers, ship.maxBarriers)}` : 'NO BARRIER'],
    right: [`GUN ${gunLine}`, ...(torpedoes.length ? [`TORPEDOES ${rounds}`] : []), ship.rearming ? 'RETURNING TO REARM' : ''].filter(Boolean),
    target: target ? [`TARGET ${target.name.toUpperCase()}`, `RANGE ${km(range)} km`, target.maxBarriers > 0 && target.barriers > 0 ? `BARRIER ${pct(target.barriers, target.maxBarriers)}` : `HULL ${pct(target.hull, target.maxHull)}`] : ['NO TARGET'] };
}

export class CockpitOverlay {
  readonly root: HTMLElement;
  private readonly title = el('div', { class: 'cockpit-title' });
  private readonly left = el('div', { class: 'cockpit-read left' });
  private readonly right = el('div', { class: 'cockpit-read right' });
  private readonly target = el('div', { class: 'cockpit-read target' });
  private readonly bracket = el('div', { class: 'cockpit-bracket' });
  private nextAt = 0;

  constructor(parent: HTMLElement) {
    this.root = el('div', { class: 'cockpit', 'data-style': 'canopy' }, [
      el('div', { class: 'cockpit-frame' }), el('div', { class: 'cockpit-reticle' }), this.bracket, this.title, this.left, this.right, this.target,
    ]);
    this.root.style.display = 'none';
    parent.appendChild(this.root);
  }

  show(on: boolean): void {
    this.root.style.display = on ? 'block' : 'none';
    if (on) this.nextAt = 0;
  }

  /** `now` is in milliseconds. The bracket follows its target every frame; the words change ten times a second. */
  update(host: CockpitHost, shipId: string | undefined, now: number): void {
    const ship = shipId ? host.getShip(shipId) : undefined;
    if (!ship || !ship.alive || ship.escaped) {
      // The followed ship may disappear during auto-succession or after the last allied loss.
      // Do not leave the previous ship's name, health or target bracket on screen.
      this.bracket.style.display = 'none';
      this.title.textContent = '';
      this.left.textContent = '';
      this.right.textContent = '';
      this.target.textContent = '';
      this.nextAt = 0;
      return;
    }
    const target = ship.targetId ? host.getShip(ship.targetId) : undefined;
    const live = target?.alive && !target.escaped ? target : undefined;
    const at = live ? host.project(live.pos, this.root.clientWidth, this.root.clientHeight) : undefined;
    const inFrame = !!at && at.x > 0 && at.y > 0 && at.x < this.root.clientWidth && at.y < this.root.clientHeight;
    this.bracket.style.display = inFrame ? 'block' : 'none';
    if (inFrame) { this.bracket.style.left = `${at!.x}px`; this.bracket.style.top = `${at!.y}px`; }
    if (now < this.nextAt) return;
    this.nextAt = now + 100;
    const read = cockpitReadout(ship, live);
    this.root.dataset.style = read.style;
    this.root.dataset.faction = ship.faction;
    this.title.textContent = read.title;
    this.left.textContent = read.left.join('\n');
    this.right.textContent = read.right.join('\n');
    this.target.textContent = read.target.join('\n');
  }
}
