import type { BattleView } from '@/rendering/battleView';
import type { ShipState } from '@/simulation/types';
import { FACTIONS } from '@/data/factions';
import { engagementBand, shipEngagementRange } from '@/simulation/ai';
import { v3 } from '@/core/vec3';
import { layoutLabels, type LabelCandidate } from './labelLayout';

/** Tactical annotations stay bounded even when a whole massive fleet is selected.
 * This view only reads the simulation; the main selection gets range envelopes,
 * up to eight target lines, and priority in the non-overlapping label layout.
 */
export class TacticalOverlay {
  private ctx: CanvasRenderingContext2D;
  visible = true;
  hoverId?: string;
  /** Actual draw workload, also useful to visual/performance QA. */
  drawCounts = { labels: 0, targetLines: 0, rangeRings: 0 };

  constructor(private canvas: HTMLCanvasElement) {
    this.ctx = canvas.getContext('2d')!;
  }

  resize(w: number, h: number, dpr: number): void {
    this.canvas.width = Math.floor(w * dpr);
    this.canvas.height = Math.floor(h * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  private rangeRing(view: BattleView, ship: ShipState, radius: number, colour: string, dashed: boolean): void {
    if (!(radius > 0)) return;
    const ctx = this.ctx;
    ctx.beginPath();
    let connected = false;
    for (let i = 0; i <= 40; i++) {
      const angle = i * Math.PI / 20;
      const p = view.project(v3(ship.pos.x + Math.cos(angle) * radius, ship.pos.y, ship.pos.z + Math.sin(angle) * radius), this.width, this.height);
      if (!p) { connected = false; continue; }
      if (connected) ctx.lineTo(p.x, p.y);
      else ctx.moveTo(p.x, p.y);
      connected = true;
    }
    ctx.strokeStyle = colour;
    ctx.lineWidth = 1;
    ctx.setLineDash(dashed ? [5, 7] : []);
    ctx.stroke();
    ctx.setLineDash([]);
    this.drawCounts.rangeRings++;
  }

  private width = 0;
  private height = 0;

  draw(view: BattleView, w: number, h: number, mode: string): void {
    const ctx = this.ctx;
    this.width = w; this.height = h;
    ctx.clearRect(0, 0, w, h);
    this.drawCounts = { labels: 0, targetLines: 0, rangeRings: 0 };
    if (!this.visible) return;
    const sim = view.sim;
    const command = mode === 'command';
    const detailed = mode === 'tactical' || command;
    ctx.font = '10px Consolas, "Roboto Mono", monospace';
    ctx.textBaseline = 'middle';
    let primary: ShipState | undefined;
    for (const id of view.selectedIds) {
      const s = sim.getShip(id);
      if (s?.alive && !s.escaped) { primary = s; break; }
    }
    const inspected = primary ?? (this.hoverId ? sim.getShip(this.hoverId) : undefined);
    if (detailed && inspected?.alive && !inspected.escaped && inspected.weapons.length) {
      this.rangeRing(view, inspected, shipEngagementRange(inspected), 'rgba(79,163,255,0.35)', true);
      this.rangeRing(view, inspected, engagementBand(inspected).preferred, 'rgba(255,138,31,0.40)', false);
    }

    for (const id of view.selectedIds) {
      if (this.drawCounts.targetLines >= 8) break;
      const s = sim.getShip(id);
      if (!s?.alive || s.escaped) continue;
      const t = s.targetId ? sim.getShip(s.targetId) : undefined;
      if (!t?.alive || t.escaped) continue;
      const a = view.project(s.pos, w, h), b = view.project(t.pos, w, h);
      if (!a || !b) continue;
      ctx.strokeStyle = 'rgba(255,138,31,0.55)';
      ctx.setLineDash([4, 6]);
      ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
      this.drawCounts.targetLines++;
    }
    ctx.setLineDash([]);

    const ships: { s: ShipState; x: number; y: number; depth: number }[] = [];
    for (const s of sim.ships) {
      if (!s.alive || s.escaped) continue;
      const p = view.project(s.pos, w, h);
      if (!p || p.x < -40 || p.y < -40 || p.x > w + 40 || p.y > h + 40) continue;
      ships.push({ s, x: p.x, y: p.y, depth: p.depth });
    }
    ships.sort((a, b) => b.depth - a.depth);
    const candidates: LabelCandidate[] = [];
    const details = new Map<string, { ship: ShipState; label: string; highlighted: boolean }>();
    for (const { s, x, y, depth } of ships) {
      const friendly = s.side === sim.config.perspectiveSide;
      const colour = FACTIONS[s.faction].colour;
      const selected = view.selectedIds.has(s.id), hovered = this.hoverId === s.id;
      const far = depth > 6000;
      if (s.role === 'fighter' && (far || !command)) {
        if (command || depth < 3000) {
          ctx.fillStyle = colour; ctx.globalAlpha = 0.5;
          ctx.fillRect(x - 1, y - 1, 2, 2); ctx.globalAlpha = 1;
        }
        continue;
      }
      const capital = ['reaper_capital', 'dreadnought', 'carrier'].includes(s.role);
      const size = capital ? 9 : s.role === 'cruiser' || s.role === 'reaper_destroyer' ? 7 : 5;
      ctx.strokeStyle = colour; ctx.lineWidth = selected || hovered ? 2 : 1;
      ctx.globalAlpha = selected || hovered ? 1 : 0.75;
      ctx.beginPath();
      if (friendly) {
        ctx.moveTo(x, y - size); ctx.lineTo(x + size, y); ctx.lineTo(x, y + size); ctx.lineTo(x - size, y);
      } else { ctx.moveTo(x, y - size); ctx.lineTo(x + size, y + size); ctx.lineTo(x - size, y + size); }
      ctx.closePath(); ctx.stroke();
      if (selected && (view.selectedIds.size <= 12 || s.id === primary?.id || hovered)) {
        ctx.strokeStyle = '#ff8a1f';
        ctx.strokeRect(x - size - 6, y - size - 6, size * 2 + 12, size * 2 + 12);
      }
      const showDetail = command || selected || hovered || (!far && size >= 7) || depth < 2500;
      if (showDetail) {
        const important = selected || hovered || s.id === primary?.targetId;
        const label = important || size >= 9 || (size >= 7 && depth < 1200) ? s.name.toUpperCase() : '';
        const width = Math.max(40, label ? ctx.measureText(label).width + 4 : 40);
        const priority = (s.id === primary?.id ? 1_000_000 : selected ? 100_000 : hovered ? 90_000 : s.id === primary?.targetId ? 80_000 : 0) + (capital ? 1000 : size === 7 ? 100 : 10) + Math.max(0, 3000 - depth) / 100;
        candidates.push({ id: s.id, x: x - width / 2, y: y + size + 4, width, height: label ? 24 : 9, priority });
        details.set(s.id, { ship: s, label, highlighted: important });
      }
      ctx.globalAlpha = 1;
    }
    for (const placement of layoutLabels(candidates, w, h, command ? 90 : 60)) {
      const detail = details.get(placement.id)!;
      const s = detail.ship;
      const centre = placement.x + placement.width / 2;
      const by = placement.y + 1;
      const bx = centre - 18;
      if (detail.highlighted) {
        ctx.fillStyle = 'rgba(6,9,15,0.8)';
        ctx.fillRect(placement.x, placement.y, placement.width, placement.height);
      }
      ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.fillRect(bx, by, 36, 5);
      ctx.fillStyle = '#4fa3ff'; ctx.fillRect(bx, by, 36 * Math.max(0, s.barriers) / Math.max(1, s.maxBarriers), 2);
      ctx.fillStyle = s.hull / s.maxHull < 0.3 ? '#ff3b2f' : '#ff8a1f';
      ctx.fillRect(bx, by + 3, 36 * Math.max(0, s.hull) / Math.max(1, s.maxHull), 2);
      if (detail.label) {
        ctx.fillStyle = FACTIONS[s.faction].colour; ctx.textAlign = 'center';
        ctx.fillText(detail.label, centre, by + 14);
      }
      this.drawCounts.labels++;
    }
    ctx.globalAlpha = 1;
    if (command) {
      ctx.strokeStyle = 'rgba(79,163,255,0.12)'; ctx.lineWidth = 1;
      ctx.beginPath();
      for (let gx = 0; gx < w; gx += 60) { ctx.moveTo(gx, 0); ctx.lineTo(gx, h); }
      for (let gy = 0; gy < h; gy += 60) { ctx.moveTo(0, gy); ctx.lineTo(w, gy); }
      ctx.stroke();
    }
    ctx.strokeStyle = 'rgba(79,163,255,0.35)'; ctx.lineWidth = 1;
    const m = 8, L = 26;
    ctx.beginPath();
    for (const [cx, cy, sx, sy] of [[m, m, 1, 1], [w - m, m, -1, 1], [m, h - m, 1, -1], [w - m, h - m, -1, -1]]) {
      ctx.moveTo(cx, cy + sy * L); ctx.lineTo(cx, cy); ctx.lineTo(cx + sx * L, cy);
    }
    ctx.stroke();
  }
}
