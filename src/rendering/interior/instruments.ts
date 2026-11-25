import { BATTLESPACE_SCALE } from '@/simulation/constants';
import type { ShipState } from '@/simulation/types';

/**
 * The bridge's instruments: what they show (read from the ship's own state; pure, so it can be tested) and how
 * they are painted (onto one canvas that every screen on the bridge takes its picture from).
 *
 * Nothing here decides anything. The instruments read the battle; they do not change it.
 */
export interface PlotContact {
  /** Place on the plot, −1 to 1: x to starboard, y ahead, by the ship's own heading. */
  x: number;
  y: number;
  /** Above (positive) or below the ship's level, as a share of the plot's range. */
  lift: number;
  friend: boolean;
  /** 0 a fighter, 1 an escort, 2 a capital ship. */
  weight: 0 | 1 | 2;
  target: boolean;
}

export interface GunLine { name: string; /** 0 just fired, 1 ready. */ ready: number; firing: boolean; rounds?: number }

export interface InstrumentData {
  name: string;
  /** Kilometres a second, on the catalogue's scale. */
  speed: number;
  hull: number;
  /** Undefined for a hull that carries no barrier. */
  barrier: number | undefined;
  thrust: number;
  /** Compass bearing of the bow, 0 to 360, and its climb in degrees. */
  bearing: number;
  climb: number;
  guns: GunLine[];
  target?: { name: string; range: number; closing: number; hull: number; barrier: number | undefined };
  contacts: PlotContact[];
  /** Kilometres from the centre of the plot to its edge. */
  plotRange: number;
  friends: number;
  hostiles: number;
  /** What the room's lights are doing: all well, barriers down or hull hurt, hull failing. */
  condition: 'steady' | 'action' | 'critical';
}

/** The plot's ranges, in kilometres: the smallest that holds the target, or the middle one with no target. */
export const PLOT_RANGES = [10, 25, 50, 100, 250, 500] as const;
/** Contacts drawn at most; beyond it the plot takes every nth, so a fleet of thousands is still a fleet on it. */
export const PLOT_CONTACTS = 220;

const km = (units: number): number => units / BATTLESPACE_SCALE;
const share = (now: number, full: number): number => (full > 0 ? Math.min(1, Math.max(0, now / full)) : 0);
const weightOf = (role: string): 0 | 1 | 2 => (role === 'fighter' ? 0 : role === 'frigate' || role === 'reaper_destroyer' ? 1 : 2);

export function conditionOf(ship: Pick<ShipState, 'hull' | 'maxHull' | 'barriers' | 'maxBarriers'>): InstrumentData['condition'] {
  const hull = share(ship.hull, ship.maxHull);
  if (hull < 0.35) return 'critical';
  return hull < 0.75 || (ship.maxBarriers > 0 && ship.barriers <= 0) ? 'action' : 'steady';
}

export function readInstruments(ship: ShipState, target: ShipState | undefined, ships: readonly ShipState[]): InstrumentData {
  const speed = km(Math.hypot(ship.vel.x, ship.vel.y, ship.vel.z));
  // The plot is level with the battle and turned to the bow: ahead is up the plot.
  const flat = Math.hypot(ship.heading.x, ship.heading.z);
  const fx = flat > 1e-6 ? ship.heading.x / flat : 0, fz = flat > 1e-6 ? ship.heading.z / flat : 1;
  const rx = fz, rz = -fx; // level right of a hull pointing (fx, fz)
  const range = target ? Math.hypot(target.pos.x - ship.pos.x, target.pos.y - ship.pos.y, target.pos.z - ship.pos.z) : 0;
  const plotRange = target ? PLOT_RANGES.find((r) => r >= km(range) * 1.15) ?? PLOT_RANGES[PLOT_RANGES.length - 1] : PLOT_RANGES[2];
  const reach = plotRange * BATTLESPACE_SCALE;
  const contacts: PlotContact[] = [];
  let friends = 0, hostiles = 0, inside = 0;
  for (const other of ships) {
    if (other === ship || !other.alive || other.escaped) continue;
    const dx = other.pos.x - ship.pos.x, dz = other.pos.z - ship.pos.z;
    const x = (dx * rx + dz * rz) / reach, y = (dx * fx + dz * fz) / reach;
    if (x * x + y * y > 1) continue;
    inside++;
    if (other.side === ship.side) friends++; else hostiles++;
  }
  // Every nth contact when there are more than the plot draws; the target is always drawn.
  const every = Math.max(1, Math.ceil(inside / PLOT_CONTACTS));
  let n = 0;
  for (const other of ships) {
    if (other === ship || !other.alive || other.escaped) continue;
    const dx = other.pos.x - ship.pos.x, dz = other.pos.z - ship.pos.z;
    const x = (dx * rx + dz * rz) / reach, y = (dx * fx + dz * fz) / reach;
    if (x * x + y * y > 1) continue;
    const isTarget = other === target;
    if (n++ % every !== 0 && !isTarget) continue;
    contacts.push({ x, y, lift: (other.pos.y - ship.pos.y) / reach, friend: other.side === ship.side, weight: weightOf(other.role), target: isTarget });
  }
  // The guns that matter, main battery first: not point defence.
  const guns: GunLine[] = ship.weapons.filter((w) => !w.def.antiSmall)
    .sort((a, b) => b.def.damage - a.def.damage).slice(0, 5)
    .map((w) => ({ name: w.def.name, firing: w.beamRemaining > 0, rounds: w.ammo,
      ready: w.def.cooldown > 0 ? 1 - Math.min(1, Math.max(0, w.cooldown) / w.def.cooldown) : 1 }));
  let closing = 0;
  if (target && range > 1e-6) {
    const ux = (target.pos.x - ship.pos.x) / range, uy = (target.pos.y - ship.pos.y) / range, uz = (target.pos.z - ship.pos.z) / range;
    closing = km((ship.vel.x - target.vel.x) * ux + (ship.vel.y - target.vel.y) * uy + (ship.vel.z - target.vel.z) * uz);
  }
  return {
    name: ship.name, speed,
    hull: share(ship.hull, ship.maxHull),
    barrier: ship.maxBarriers > 0 ? share(ship.barriers, ship.maxBarriers) : undefined,
    thrust: Math.min(1, Math.max(0, ship.engineThrust ?? 0.5)),
    bearing: ((Math.atan2(ship.heading.x, ship.heading.z) * 180) / Math.PI + 360) % 360,
    climb: (Math.asin(Math.min(1, Math.max(-1, ship.heading.y))) * 180) / Math.PI,
    guns,
    target: target ? { name: target.name, range: km(range), closing, hull: share(target.hull, target.maxHull),
      barrier: target.maxBarriers > 0 ? share(target.barriers, target.maxBarriers) : undefined } : undefined,
    contacts, plotRange, friends, hostiles,
    condition: conditionOf(ship),
  };
}

// ----------------------------------------------------------------------------------------------- the canvas

/** Where each screen's picture is on the canvas, in pixels: x, y, width, height. */
export const ATLAS_SIZE = 1024;
export const SCREENS = {
  plot: [0, 0, 512, 512],
  helm: [512, 0, 512, 256],
  status: [512, 256, 256, 256],
  target: [768, 256, 256, 256],
  guns: [0, 512, 256, 256],
  sensors: [256, 512, 256, 256],
  power: [512, 512, 256, 256],
  comms: [768, 512, 256, 256],
  plate: [0, 768, 768, 128],
  keys: [768, 768, 256, 256],
} as const satisfies Record<string, readonly [number, number, number, number]>;
export type ScreenName = keyof typeof SCREENS;

/** A screen's corner texture coordinates: u0, v0 (bottom left), u1, v1 (top right). */
export function screenUv(name: ScreenName): [number, number, number, number] {
  const [x, y, w, h] = SCREENS[name], inset = 1.5;
  return [(x + inset) / ATLAS_SIZE, 1 - (y + h - inset) / ATLAS_SIZE, (x + w - inset) / ATLAS_SIZE, 1 - (y + inset) / ATLAS_SIZE];
}

export interface InstrumentInk { haptic: string; plot: string; light: string; alert: string; navy: string }

const hex = (n: number): string => `#${n.toString(16).padStart(6, '0')}`;
export const inkOf = (palette: { haptic: number; plot: number; light: number; alert: number }, navy: string): InstrumentInk =>
  ({ haptic: hex(palette.haptic), plot: hex(palette.plot), light: hex(palette.light), alert: hex(palette.alert), navy });

const FONT = '"Share Tech Mono", "DejaVu Sans Mono", Consolas, monospace';
const pct = (v: number): string => `${Math.round(v * 100)}%`;

function bar(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, value: number, colour: string, cells = 12): void {
  const gap = 2, cell = (w - gap * (cells - 1)) / cells;
  for (let i = 0; i < cells; i++) {
    ctx.globalAlpha = i < Math.round(value * cells) ? 1 : 0.16;
    ctx.fillStyle = colour;
    ctx.fillRect(x + i * (cell + gap), y, cell, h);
  }
  ctx.globalAlpha = 1;
}

function frame(ctx: CanvasRenderingContext2D, [x, y, w, h]: readonly [number, number, number, number], title: string, colour: string): void {
  ctx.fillStyle = 'rgba(2, 6, 12, 0.92)';
  ctx.fillRect(x, y, w, h);
  ctx.strokeStyle = colour;
  ctx.globalAlpha = 0.55;
  ctx.lineWidth = 2;
  ctx.strokeRect(x + 6, y + 6, w - 12, h - 12);
  ctx.globalAlpha = 1;
  ctx.fillStyle = colour;
  ctx.font = `bold 15px ${FONT}`;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.fillText(title, x + 16, y + 28);
  ctx.fillRect(x + 16, y + 34, w - 32, 1);
}

const clip = (text: string, max: number): string => (text.length > max ? `${text.slice(0, max - 1)}…` : text);

/**
 * Paint every screen. `seconds` is the wall clock, for the things that move by themselves (the plot's sweep, a
 * station's scrolling trace). Called a few times a second, not every frame.
 */
export function paintInstruments(ctx: CanvasRenderingContext2D, d: InstrumentData, ink: InstrumentInk, seconds: number): void {
  const warn = d.condition === 'critical' ? ink.alert : ink.haptic;
  ctx.clearRect(0, 0, ATLAS_SIZE, ATLAS_SIZE);

  // --- The plot: black outside its disc, so a screen that shows it additively shows only the disc.
  {
    const [x, y, w] = SCREENS.plot, cx = x + w / 2, cy = y + w / 2, r = w / 2 - 14;
    ctx.fillStyle = '#000';
    ctx.fillRect(x, y, w, w);
    const glow = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
    glow.addColorStop(0, 'rgba(60, 130, 200, 0.20)');
    glow.addColorStop(1, 'rgba(20, 60, 110, 0.05)');
    ctx.fillStyle = glow;
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = ink.plot;
    ctx.lineWidth = 2;
    for (const ring of [1, 2 / 3, 1 / 3]) { ctx.globalAlpha = ring === 1 ? 0.9 : 0.35; ctx.beginPath(); ctx.arc(cx, cy, r * ring, 0, Math.PI * 2); ctx.stroke(); }
    ctx.globalAlpha = 0.3;
    ctx.beginPath(); ctx.moveTo(cx - r, cy); ctx.lineTo(cx + r, cy); ctx.moveTo(cx, cy - r); ctx.lineTo(cx, cy + r); ctx.stroke();
    // The sweep.
    const a = seconds * 0.9;
    ctx.globalAlpha = 0.5;
    ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx + Math.sin(a) * r, cy - Math.cos(a) * r); ctx.stroke();
    ctx.globalAlpha = 1;
    for (const c of d.contacts) {
      const px = cx + c.x * r, py = cy - c.y * r, s = c.weight === 2 ? 6 : c.weight === 1 ? 4 : 2;
      ctx.fillStyle = c.friend ? ink.plot : '#ff4a3a';
      if (c.weight === 0) ctx.fillRect(px - 1, py - 1, 3, 3);
      else if (c.friend) { ctx.beginPath(); ctx.moveTo(px, py - s); ctx.lineTo(px + s, py + s); ctx.lineTo(px - s, py + s); ctx.closePath(); ctx.fill(); }
      else { ctx.beginPath(); ctx.moveTo(px, py - s); ctx.lineTo(px + s, py); ctx.lineTo(px, py + s); ctx.lineTo(px - s, py); ctx.closePath(); ctx.fill(); }
      if (c.target) { ctx.strokeStyle = '#ffe08a'; ctx.lineWidth = 2; ctx.strokeRect(px - 11, py - 11, 22, 22); ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(px, py); ctx.globalAlpha = 0.45; ctx.stroke(); ctx.globalAlpha = 1; }
    }
    // The ship itself, bow up.
    ctx.fillStyle = '#ffffff';
    ctx.beginPath(); ctx.moveTo(cx, cy - 11); ctx.lineTo(cx + 7, cy + 8); ctx.lineTo(cx - 7, cy + 8); ctx.closePath(); ctx.fill();
    ctx.fillStyle = ink.plot;
    ctx.font = `bold 18px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.fillText(`${d.plotRange} KM`, cx, cy - r + 26);
    ctx.fillText(`${d.friends} · ${d.hostiles}`, cx, cy + r - 14);
  }

  // --- The helm: bearing tape, climb, speed and thrust.
  {
    const s = SCREENS.helm, [x, y, w] = s;
    frame(ctx, s, 'HELM', ink.haptic);
    ctx.fillStyle = ink.haptic;
    ctx.font = `bold 44px ${FONT}`;
    ctx.textAlign = 'left';
    ctx.fillText(`${d.speed.toFixed(2)}`, x + 22, y + 96);
    ctx.font = `16px ${FONT}`;
    ctx.fillText('KM/S', x + 150, y + 96);
    ctx.fillText(`BRG ${d.bearing.toFixed(0).padStart(3, '0')}   CLIMB ${d.climb >= 0 ? '+' : '−'}${Math.abs(d.climb).toFixed(0).padStart(2, '0')}`, x + 22, y + 128);
    ctx.fillText('THRUST', x + 22, y + 166);
    bar(ctx, x + 100, y + 152, w - 130, 16, d.thrust, ink.haptic, 24);
    // Bearing tape: a tick every ten degrees, sliding with the bow.
    ctx.save();
    ctx.beginPath(); ctx.rect(x + 22, y + 186, w - 44, 52); ctx.clip();
    ctx.strokeStyle = ink.haptic; ctx.lineWidth = 2; ctx.textAlign = 'center'; ctx.font = `14px ${FONT}`;
    const mid = x + w / 2, perDeg = 4.2;
    for (let deg = -70; deg <= 70; deg += 1) {
      const mark = Math.round(d.bearing) + deg;
      if (mark % 10 !== 0) continue;
      const px = mid + (mark - d.bearing) * perDeg, tall = mark % 30 === 0;
      ctx.beginPath(); ctx.moveTo(px, y + 186); ctx.lineTo(px, y + (tall ? 206 : 198)); ctx.stroke();
      if (tall) ctx.fillText(`${((mark % 360) + 360) % 360}`.padStart(3, '0'), px, y + 226);
    }
    ctx.restore();
    ctx.fillStyle = '#ffffff';
    ctx.beginPath(); ctx.moveTo(mid, y + 184); ctx.lineTo(mid + 7, y + 174); ctx.lineTo(mid - 7, y + 174); ctx.closePath(); ctx.fill();
  }

  // --- Ship status.
  {
    const s = SCREENS.status, [x, y, w] = s;
    frame(ctx, s, clip(d.name.toUpperCase(), 24), warn);
    ctx.font = `15px ${FONT}`;
    ctx.textAlign = 'left';
    const row = (label: string, value: number | undefined, at: number, colour: string): void => {
      ctx.fillStyle = colour;
      ctx.fillText(label, x + 16, y + at);
      ctx.textAlign = 'right';
      ctx.fillText(value === undefined ? 'NONE' : pct(value), x + w - 16, y + at);
      ctx.textAlign = 'left';
      bar(ctx, x + 16, y + at + 8, w - 32, 14, value ?? 0, colour);
    };
    row('HULL', d.hull, 66, d.hull < 0.35 ? ink.alert : ink.haptic);
    row('BARRIER', d.barrier, 122, d.barrier !== undefined && d.barrier <= 0 ? ink.alert : ink.plot);
    row('DRIVE', d.thrust, 178, ink.haptic);
    ctx.fillStyle = d.condition === 'steady' ? ink.haptic : ink.alert;
    ctx.font = `bold 15px ${FONT}`;
    ctx.fillText(d.condition === 'steady' ? 'CONDITION STEADY' : d.condition === 'action' ? 'ACTION STATIONS' : 'HULL FAILING', x + 16, y + 236);
  }

  // --- The target.
  {
    const s = SCREENS.target, [x, y, w] = s;
    frame(ctx, s, 'TARGET', ink.haptic);
    ctx.textAlign = 'left';
    if (!d.target) { ctx.fillStyle = ink.haptic; ctx.globalAlpha = 0.6; ctx.font = `18px ${FONT}`; ctx.fillText('NO TARGET', x + 16, y + 120); ctx.globalAlpha = 1; }
    else {
      ctx.fillStyle = '#ffe08a';
      ctx.font = `bold 16px ${FONT}`;
      ctx.fillText(clip(d.target.name.toUpperCase(), 22), x + 16, y + 62);
      ctx.fillStyle = ink.haptic;
      ctx.font = `bold 34px ${FONT}`;
      ctx.fillText(d.target.range >= 100 ? d.target.range.toFixed(0) : d.target.range.toFixed(1), x + 16, y + 108);
      ctx.font = `15px ${FONT}`;
      ctx.fillText('KM', x + 132, y + 108);
      ctx.fillText(`${d.target.closing >= 0 ? 'CLOSING' : 'OPENING'} ${Math.abs(d.target.closing).toFixed(2)}`, x + 16, y + 136);
      ctx.fillText('BARRIER', x + 16, y + 168);
      bar(ctx, x + 16, y + 176, w - 32, 12, d.target.barrier ?? 0, ink.plot);
      ctx.fillStyle = ink.haptic;
      ctx.fillText('HULL', x + 16, y + 212);
      bar(ctx, x + 16, y + 220, w - 32, 12, d.target.hull, '#ff6a4a');
    }
  }

  // --- The guns.
  {
    const s = SCREENS.guns, [x, y, w] = s;
    frame(ctx, s, 'BATTERIES', ink.haptic);
    ctx.textAlign = 'left';
    ctx.font = `13px ${FONT}`;
    d.guns.forEach((g, i) => {
      const at = y + 58 + i * 40, colour = g.firing ? '#ffffff' : g.ready >= 1 ? ink.plot : ink.haptic;
      ctx.fillStyle = colour;
      ctx.fillText(clip(g.name.toUpperCase(), 20), x + 16, at);
      ctx.textAlign = 'right';
      ctx.fillText(g.firing ? 'FIRING' : g.ready >= 1 ? 'READY' : pct(g.ready), x + w - 16, at);
      ctx.textAlign = 'left';
      bar(ctx, x + 16, at + 6, w - 32 - (g.rounds === undefined ? 0 : 44), 10, g.ready, colour, 16);
      if (g.rounds !== undefined) { ctx.textAlign = 'right'; ctx.fillText(`×${g.rounds}`, x + w - 16, at + 16); ctx.textAlign = 'left'; }
    });
    if (!d.guns.length) { ctx.fillStyle = ink.haptic; ctx.globalAlpha = 0.6; ctx.fillText('NO BATTERY', x + 16, y + 120); ctx.globalAlpha = 1; }
  }

  // --- Crew stations: sensors (a scrolling trace), power (bars that breathe), signals (lines of traffic).
  {
    const s = SCREENS.sensors, [x, y, w, h] = s;
    frame(ctx, s, 'SENSORS', ink.plot);
    ctx.strokeStyle = ink.plot; ctx.lineWidth = 2;
    for (let line = 0; line < 3; line++) {
      ctx.globalAlpha = 0.9 - line * 0.25;
      ctx.beginPath();
      for (let i = 0; i <= 44; i++) {
        const u = i / 44, v = Math.sin(u * 9 + seconds * (1.3 + line * 0.7) + line * 2) * Math.sin(u * 23 - seconds * 0.6) * (0.5 + 0.5 * Math.min(1, d.hostiles / 12));
        const px = x + 16 + u * (w - 32), py = y + 86 + line * 56 + v * 20;
        if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
      }
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
    ctx.fillStyle = ink.plot; ctx.font = `13px ${FONT}`; ctx.textAlign = 'left';
    ctx.fillText(`CONTACTS ${d.friends + d.hostiles}`, x + 16, y + h - 18);
  }
  {
    const s = SCREENS.power, [x, y, w] = s;
    frame(ctx, s, 'POWER', ink.haptic);
    ['DRIVE CORE', 'KINETIC BARRIERS', 'MAIN BATTERY', 'LIFE SUPPORT', 'HEAT SINKS'].forEach((label, i) => {
      const value = i === 0 ? 0.35 + 0.6 * d.thrust : i === 1 ? d.barrier ?? 0 : i === 2 ? (d.guns[0]?.ready ?? 0) : i === 3 ? 0.92 : 0.5 + 0.3 * Math.sin(seconds * 0.5 + 1);
      ctx.fillStyle = ink.haptic; ctx.font = `12px ${FONT}`; ctx.textAlign = 'left';
      ctx.fillText(label, x + 16, y + 58 + i * 38);
      bar(ctx, x + 16, y + 64 + i * 38, w - 32, 10, value, i === 1 ? ink.plot : ink.haptic, 20);
    });
  }
  {
    const s = SCREENS.comms, [x, y] = s;
    frame(ctx, s, 'SIGNALS', ink.haptic);
    ctx.font = `12px ${FONT}`; ctx.textAlign = 'left';
    const lines = [`FLEET NET     ${d.friends} LINKED`, `HOSTILE       ${d.hostiles} TRACKED`, `PLOT RANGE    ${d.plotRange} KM`,
      d.target ? `ENGAGING      ${clip(d.target.name.toUpperCase(), 12)}` : 'ENGAGING      —',
      d.condition === 'steady' ? 'DAMAGE CTRL   STANDING BY' : 'DAMAGE CTRL   WORKING', `BRG ${d.bearing.toFixed(0).padStart(3, '0')} SPD ${d.speed.toFixed(2)}`];
    lines.forEach((text, i) => { ctx.fillStyle = i === 4 && d.condition !== 'steady' ? ink.alert : ink.haptic; ctx.globalAlpha = 0.95 - 0.06 * i; ctx.fillText(text, x + 16, y + 62 + i * 30); });
    ctx.globalAlpha = 1;
  }

  // --- The plate over the windows, and the haptic keys.
  {
    const [x, y, w, h] = SCREENS.plate;
    ctx.fillStyle = '#000'; ctx.fillRect(x, y, w, h);
    ctx.fillStyle = ink.light; ctx.textAlign = 'center';
    ctx.font = `bold 34px ${FONT}`; ctx.fillText(clip(d.name.toUpperCase(), 34), x + w / 2, y + 58);
    ctx.globalAlpha = 0.7; ctx.font = `18px ${FONT}`; ctx.fillText(ink.navy, x + w / 2, y + 96); ctx.globalAlpha = 1;
  }
  {
    const [x, y, w, h] = SCREENS.keys;
    ctx.fillStyle = '#000'; ctx.fillRect(x, y, w, h);
    ctx.fillStyle = ink.haptic;
    for (let row = 0; row < 6; row++) for (let col = 0; col < 6; col++) {
      // Keys light as if worked: a slow pattern, the same for the same instant.
      const lit = Math.sin(row * 1.7 + col * 2.3 + Math.floor(seconds * 2) * (0.6 + 0.1 * ((row * 6 + col) % 5))) > 0.55;
      ctx.globalAlpha = lit ? 0.95 : 0.3;
      ctx.fillRect(x + 14 + col * 39, y + 14 + row * 39, 32, 32);
    }
    ctx.globalAlpha = 1;
  }
}
