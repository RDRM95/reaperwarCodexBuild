import { audio, type SoundId } from '@/audio/engine';
import { installShipReferenceInspector } from '@/references/ShipReferenceInspector';
import { DEFAULT_PREFERENCES, storage, type Preferences } from '@/core/storage';
import { BattleView } from '@/rendering/battleView';
import type { CameraMode } from '@/rendering/cameras';
import { BattleSimulation, SIM_DT } from '@/simulation/battle';
import type { BattleConfig, BattleEvent, BattleResult, FleetOrders } from '@/simulation/types';
import { PRESETS, getPreset } from '@/timelines/presets';
import { cloneRules, type RuleSet } from '@/timelines/rules';
import type { ComparisonReport } from '@/scenarios/comparison';
import { clear, el } from './dom';
import { applyUiScale, normaliseUiScale } from './tvDisplay';
import { TacticalOverlay } from './overlay';
import { createHud, type Hud } from './screens/hud';
import { renderMenu } from './screens/menu';
import { renderBriefing } from './screens/briefing';
import { renderResults } from './screens/results';
import { renderComparison } from './screens/comparison';
import { renderCodex } from './screens/codex';
import { renderDatabase } from './screens/database';
import { renderCustom } from './screens/custom';
import { renderTimelines } from './screens/timelines';
import { renderSettings } from './screens/settings';
import { renderCampaign, renderCampaignSetup } from './screens/campaign';
import { renderPostWar } from './screens/postwar';
import { renderSaves } from './screens/saves';
import { createPostWar, type PostWarState } from '@/campaign/postwar';
import { applyEngagementResult, createCampaign, type CampaignOptions } from '@/campaign/engine';
import { normaliseCampaign } from '@/campaign/depth';
import type { CampaignState, PendingEngagement } from '@/campaign/state';
import { renderAuHub } from './screens/auHub';
import { renderCivilization } from './screens/civilization';
import { applyCivilizationBattleResult, beginCivilizationBattle, cancelCivilizationBattle, createCivilization, normalizeCivilizationState } from '@/civilization/engine';
import type { CivilizationInput, CivilizationOrigin, CivilizationState } from '@/civilization/types';
import { buildCustomBattle, type CustomBattleInput, type CustomFleetInput } from '@/scenarios';
import { TargetTelemetry } from './screens/gunneryOverlay';
import { primaryGunneryMount,isMainGunShot } from '@/rendering/gunnery';

export type ScreenName = 'menu' | 'briefing' | 'battle' | 'results' | 'comparison' | 'codex' | 'database' | 'custom' | 'timelines' | 'settings' | 'campaign' | 'campaign_setup' | 'postwar' | 'saves' | 'au_hub' | 'civilization';

export interface CivilizationBattleLink { civilizationId: string; }

export interface CampaignBattleLink {
  state: CampaignState;
  pending: PendingEngagement;
}

export interface LastBattle {
  sim: BattleSimulation;
  result: BattleResult;
  config: BattleConfig;
  comparison?: ComparisonReport;
  comparisonSide?: 'a' | 'b';
  campaign?: CampaignBattleLink;
  civilization?: CivilizationBattleLink;
}

/** Speed steps available to the player. */
export const SPEEDS = [0.25, 0.5, 1, 2, 4, 8];

/**
 * Drives a live battle: fixed-step simulation at the chosen speed, the 3D
 * view, the tactical overlay, the HUD and all input.
 */
export class BattleController {
  sim: BattleSimulation;
  readonly view: BattleView;
  readonly overlay: TacticalOverlay;
  hud: Hud;
  readonly gunneryOverlay:TargetTelemetry;
  private lastGunTarget?:string;
  private lastGunReady=false;
  private lastCritical=false;
  speedIndex = 2;
  paused = false;
  hudHidden = false;
  private accumulator = 0;
  private lastFrame = performance.now();
  private raf = 0;
  private disposed = false;
  private keys = new Set<string>();
  private dragging: { button: number; x: number; y: number; moved: boolean } | null = null;
  private hudTimer = 0;
  private ended = false;
  /** Events consumed by the HUD since last frame. */
  private pendingEvents: BattleEvent[] = [];
  readonly isReplay: boolean;
  /** Set when this battle resolves a campaign engagement. */
  campaignLink?: CampaignBattleLink;
  civilizationLink?: CivilizationBattleLink;

  constructor(
    readonly app: App,
    readonly config: BattleConfig,
    private canvas: HTMLCanvasElement,
    overlayCanvas: HTMLCanvasElement,
    isReplay: boolean,
  ) {
    this.isReplay = isReplay;
    this.sim = new BattleSimulation(config);
    this.view = new BattleView(canvas, this.sim, app.prefs.graphics);
    this.overlay = new TacticalOverlay(overlayCanvas);
    this.overlay.visible = app.prefs.showOverlay;
    this.overlay.detail = app.prefs.overlayDetail;
    const prevOnEvent = this.sim.onEvent;
    this.sim.onEvent = (e) => {
      prevOnEvent?.(e);
      this.pendingEvents.push(e);
      this.onSimEvent(e);
    };
    this.hud = createHud(app, this);
    this.gunneryOverlay = new TargetTelemetry(app.ui);
    this.resize();
    this.bindInput();
    this.loop = this.loop.bind(this);
    this.raf = requestAnimationFrame(this.loop);
    audio.startAmbience();
  }

  get speed(): number {
    return SPEEDS[this.speedIndex];
  }

  get playerFleetIds(): string[] {
    return this.config.fleets.filter((f) => f.playerControlled).map((f) => f.id);
  }

  /** Active organic fleets whose spinal batteries the player may command. */
  get fireControlFleetIds(): string[] {
    return this.playerFleetIds.filter((id) => {
      const fleet = this.sim.fleets.get(id);
      return fleet?.spec.side === this.config.perspectiveSide && fleet.spec.faction !== 'reaper';
    });
  }

  /** Fire-control scope is separate from the existing general fleet orders. */
  setPrimaryFire(held: boolean, fleetId?: string): void {
    if (this.sim.finished) return;
    const permitted = this.fireControlFleetIds;
    const ids = fleetId ? permitted.filter((id) => id === fleetId) : permitted;
    let accepted = 0;
    for (const id of ids) {
      if (!this.sim.fleetBatteryStatus(id)?.total) continue;
      this.sim.issueOrders(id, { primaryFire: held ? 'hold' : 'free' });
      accepted++;
    }
    this.hud.refresh();
    if (accepted > 0) {
      this.app.playUi('ui_confirm');
      this.hud.toast(held ? 'SPINAL BATTERIES: HOLD FIRE' : 'SPINAL BATTERIES: FREE FIRE');
    }
  }

  releasePrimaryVolley(fleetId?: string): void {
    if (this.sim.finished) return;
    const permitted = this.fireControlFleetIds;
    const ids = fleetId ? permitted.filter((id) => id === fleetId) : permitted;
    let released = 0;
    for (const id of ids) if (this.sim.releasePrimaryVolley(id)) released++;
    this.hud.refresh();
    if (released > 0) {
      this.app.playUi('ui_confirm');
      this.hud.toast(`SPINAL VOLLEY: ${released} ${released === 1 ? 'FLEET' : 'FLEETS'}`);
    }
  }

  setSpeed(i: number): void {
    this.speedIndex = Math.max(0, Math.min(SPEEDS.length - 1, i));
    this.hud.refresh();
  }
  togglePause(): void {
    this.paused = !this.paused;
    this.hud.refresh();
  }
  setCamera(mode: CameraMode): void {
    if(mode==='gunnery'){
      const current=this.view.followId?this.sim.getShip(this.view.followId):undefined;
      if(!current?.alive||!primaryGunneryMount(current)){
        const preferred=this.sim.ships.find(s=>s.alive&&!s.escaped&&
          s.side===this.config.perspectiveSide&&!!primaryGunneryMount(s));
        this.view.followId=preferred?.id;
      }
      this.view.gunneryLockedShipId=this.view.followId;
      this.lastGunTarget=undefined;this.lastGunReady=false;this.lastCritical=false;
      audio.init();
    } else {
      this.view.gunneryLockedShipId=undefined;
    }
    this.view.rig.setMode(mode);
    this.gunneryOverlay.show(mode==='gunnery');
    this.hud.root.classList.toggle('gunnery-mode',mode==='gunnery');
    this.hud.refresh();
  }
  /** Cycles full HUD → minimal (top bar only) → none (clean frame for recordings). */
  hudLevel: 'full' | 'minimal' | 'none' = 'full';
  toggleHud(): void {
    this.hudLevel = this.hudLevel === 'full' ? 'minimal' : this.hudLevel === 'minimal' ? 'none' : 'full';
    this.hudHidden = this.hudLevel !== 'full';
    this.hud.root.classList.toggle('hidden', this.hudHidden);
    this.hud.root.classList.toggle('none', this.hudLevel === 'none');
    this.syncOverlayVisibility();
    this.hud.refresh();
  }

  /** HUD layout and tactical annotations have separate visibility policies. */
  syncOverlayVisibility(): void {
    this.overlay.visible = this.app.prefs.showOverlay && (!this.hudHidden || this.app.prefs.overlayIndependent);
    this.overlay.detail = this.app.prefs.overlayDetail;
  }

  setOverlayDetail(detail: Preferences['overlayDetail']): void {
    this.app.prefs.overlayDetail = detail;
    this.overlay.detail = detail;
    void this.app.savePrefs();
    this.hud.refresh();
  }

  setOverlayIndependent(independent: boolean): void {
    this.app.prefs.overlayIndependent = independent;
    this.syncOverlayVisibility();
    void this.app.savePrefs();
    this.hud.refresh();
  }

  toggleOverlay(): void {
    const visible = !this.overlay.visible;
    this.app.prefs.showOverlay = visible;
    // An explicit request to show annotations while the HUD is hidden should
    // take effect immediately, and survive subsequent HUD/camera changes.
    if (visible && this.hudHidden) this.app.prefs.overlayIndependent = true;
    this.syncOverlayVisibility();
    void this.app.savePrefs();
    this.hud.refresh();
  }

  /** One-click viewing mode respects the chosen annotation policy and never
   * changes simulation speed or pause state. */
  toggleWatch(): void {
    const watching = this.view.rig.mode === 'cinematic' && this.hudLevel !== 'full';
    this.view.rig.setMode(watching ? 'tactical' : 'cinematic');
    const desired = watching ? 'full' : 'minimal';
    while (this.hudLevel !== desired) this.toggleHud();
    this.hud.refresh();
  }

  /** Issue a fleet order to all player fleets (or one fleet). */
  order(patch: Partial<FleetOrders>, fleetId?: string): void {
    const ids = fleetId ? [fleetId] : this.playerFleetIds;
    for (const id of ids) this.sim.issueOrders(id, patch);
    this.app.playUi('ui_confirm');
    this.hud.refresh();
    if (patch.order) this.hud.toast(`ORDER: ${patch.order.replace('_', ' ').toUpperCase()}`);
    if (patch.formation) this.hud.toast(`FORMATION: ${patch.formation.replace('_', ' ').toUpperCase()}`);
  }

  /** Right-click / attack command for the current selection. */
  attackWithSelection(targetId: string): void {
    const sel = [...this.view.selectedIds].filter((id) => {
      const s = this.sim.getShip(id);
      return s && s.side === this.config.perspectiveSide && s.alive;
    });
    if (sel.length > 0) this.sim.orderShipsAttack(sel, targetId);
    else for (const id of this.playerFleetIds) this.sim.issueOrders(id, { order: 'attack_target', targetId });
    this.app.playUi('ui_confirm');
    const t = this.sim.getShip(targetId);
    this.hud.toast(`ATTACK: ${(t?.name ?? targetId).toUpperCase()}`);
  }

  select(id: string | undefined, additive = false): void {
    if (!additive) this.view.selectedIds.clear();
    if (id) {
      if (additive && this.view.selectedIds.has(id)) this.view.selectedIds.delete(id);
      else this.view.selectedIds.add(id);
      if(this.view.rig.mode!=='gunnery') this.view.followId = id;
    }
    this.hud.refresh();
  }

  selectFleet(): void {
    this.view.selectedIds.clear();
    for (const s of this.sim.ships) if (s.alive && !s.escaped && s.side === this.config.perspectiveSide && s.role !== 'fighter') this.view.selectedIds.add(s.id);
    this.hud.refresh();
  }

  /** Fleet-summary rows select one deployed group with one HUD refresh. */
  selectBattleFleet(fleetId: string, additive = false): void {
    const ships = this.sim.ships.filter(s => s.fleetId === fleetId && s.alive && !s.escaped && s.role !== 'fighter');
    const remove = additive && ships.length > 0 && ships.every(s => this.view.selectedIds.has(s.id));
    if (!additive) this.view.selectedIds.clear();
    for (const ship of ships) {
      if (remove) this.view.selectedIds.delete(ship.id); else this.view.selectedIds.add(ship.id);
    }
    if (this.view.rig.mode!=='gunnery' && !remove && ships.length > 0) this.view.followId = ships.reduce((a, b) => a.pointValue >= b.pointValue ? a : b).id;
    this.hud.refresh();
  }

  focusOn(id: string): void {
    const s = this.sim.getShip(id);
    if (!s) return;
    this.view.rig.focus.set(s.pos.x * 10, s.pos.y * 10, s.pos.z * 10);
    if(this.view.rig.mode!=='gunnery') this.view.followId = id;
  }

  private onSimEvent(e: BattleEvent): void {
    if(this.view.rig.mode==='gunnery'){
      const id=this.view.gunneryLockedShipId??this.view.followId;
      this.gunneryOverlay.notify(e,id,this.sim);
      if(e.type==='weapon_fired'&&e.shipId===id){
        const shooter=this.sim.getShip(e.shipId);
        if(shooter&&isMainGunShot(shooter,e.weaponIndex)){
          const kind=shooter.weapons[e.weaponIndex].def.kind;
          audio.play(kind==='reaper_beam'?'gunner_beam':
            kind==='thanix'?'gunner_thanix':'gunner_spinal',0,.54);
        }
      }else if(e.type==='projectile_impact'&&e.shipId===id&&e.glancing){
        audio.play('gunner_glance',0,.24);
      }else if(e.type==='ship_destroyed'&&e.shipId===id){
        this.view.gunnerySignalUntilMs=performance.now()+1150;
        audio.play('gunner_signal',0,.7);
      }else if(e.type==='projectile_impact'&&e.targetId===id&&e.damage>=100)
        audio.play('impact_hull',0,.22);
      if(e.type==='battle_end')this.ended=true;
      return;
    }
    // Audio hooks with camera distance attenuation.
    const cam = this.view.rig.camera.position;
    const dist = (p: { x: number; y: number; z: number }) => Math.hypot(p.x * 10 - cam.x, p.y * 10 - cam.y, p.z * 10 - cam.z) / 10;
    switch (e.type) {
      case 'weapon_fired': {
        const s = this.sim.getShip(e.shipId);
        if (!s) break;
        const d = dist(s.pos);
        if (e.kind === 'mass_accelerator') {
          const w = s.weapons[e.weaponIndex];
          if (w && w.def.damage >= 600) audio.play('ma_large', d);
          else if (s.role !== 'fighter') audio.play('ma_small', d, 0.6);
        } else if (e.weaponId === 'oculus_beam') audio.play('oculus_pulse', d, 0.42);
        else if (e.kind === 'reaper_beam') audio.play('reaper_beam', d, s.role === 'reaper_capital' ? 1 : 0.6);
        else if (e.kind === 'thanix') audio.play('thanix', d);
        else if (e.kind === 'gardian') audio.play('gardian', d, 0.4);
        else if (e.kind === 'disruptor_torpedo') audio.play('torpedo', d, 0.5);
        break;
      }
      case 'hades_detonation':
        audio.play('hades_internal', dist(e.pos), Math.min(1, Math.sqrt(e.payloadDamage / 1000)));
        break;
      case 'projectile_impact': {
        if (e.damage < 100) break;
        const d = dist(e.pos);
        if (e.barrierDamage > e.hullDamage) audio.play('impact_barrier', d, Math.min(1, e.damage / 800));
        else audio.play('impact_hull', d, Math.min(1, e.damage / 600));
        break;
      }
      case 'ship_destroyed': {
        const d = dist(e.pos);
        const big = e.role === 'dreadnought' || e.role === 'carrier' || e.role === 'reaper_capital';
        audio.play(big || e.role === 'cruiser' || e.role === 'reaper_destroyer' ? 'explosion_large' : 'explosion_small', d, big ? 1 : 0.6);
        break;
      }
      case 'reinforcement_arrival':
        audio.play('alert');
        this.hud.toast('REINFORCEMENTS DETECTED');
        break;
      case 'battle_end':
        this.ended = true;
        break;
      default:
        break;
    }
  }

  private loop(now: number): void {
    if (this.disposed) return;
    const dtReal = Math.min(0.1, (now - this.lastFrame) / 1000);
    this.lastFrame = now;
    this.handleKeys(dtReal);
    if (!this.paused && !this.sim.finished) {
      this.accumulator += dtReal * this.speed;
      // Simulation runs on the main thread, so a 40 ms catch-up budget
      // guarantees visible stutter even on a fast CPU/GPU. Reserve most of
      // each display frame for rendering and input. On 144 Hz monitors the
      // budget is shorter than at 60 Hz; 8x speed cannot be guaranteed if
      // the simulation itself takes longer than real time.
      const budgetMs = Math.max(2, Math.min(8, dtReal * 1000 * 0.35));
      const budgetEnd = performance.now() + budgetMs;
      while (this.accumulator >= SIM_DT) {
        this.sim.step();
        this.accumulator -= SIM_DT;
        if (performance.now() >= budgetEnd) {
          // Permit bounded catch-up after a heavy volley, without creating a
          // seconds-long spiral where each frame tries to repay old work.
          this.accumulator = Math.min(this.accumulator, Math.max(0.2, this.speed * 0.2));
          break;
        }
      }
    }
    const alpha = this.paused ? 1 : Math.min(1, this.accumulator / SIM_DT);
    this.view.update(dtReal, alpha);
    this.view.render();
    if(this.view.rig.mode==='gunnery'){
      const id=this.view.gunneryLockedShipId??this.view.followId;
      this.gunneryOverlay.update(this.sim,this.view,id);
      const ship=id?this.sim.getShip(id):undefined;
      const target=ship?.targetId;
      if(target!==this.lastGunTarget){
        if(target&&ship?.alive)audio.play('target_lock',0,.3);
        this.lastGunTarget=target;
      }
      const main=ship?primaryGunneryMount(ship):undefined;
      const ready=!!main&&main.cooldown<=.03;
      if(ready&&!this.lastGunReady&&ship?.alive)audio.play('gunner_charge',0,.22);
      this.lastGunReady=ready;
      const critical=!!ship&&ship.alive&&(
        ship.hull/Math.max(1,ship.maxHull)<.26||
        ship.subsystems.engines<.24||
        ship.subsystems.weapons<.22
      );
      if(critical&&!this.lastCritical)audio.play('gunner_warning',0,.28);
      this.lastCritical=critical;
    }
    const w = this.canvas.clientWidth;
    const h = this.canvas.clientHeight;
    this.overlay.draw(this.view, w, h, this.view.rig.mode);
    this.hudTimer -= dtReal;
    this.hud.tick(dtReal, this.pendingEvents);
    this.pendingEvents = [];
    if (this.hudTimer <= 0) {
      this.hudTimer = 0.25;
      this.hud.refresh();
    }
    if (this.ended && this.sim.result) {
      this.ended = false;
      this.hud.showEnd(this.sim.result);
    }
    this.raf = requestAnimationFrame(this.loop);
  }

  private handleKeys(dt: number): void {
    const k = this.keys;
    if (this.view.rig.mode === 'free') {
      const f = (k.has('w') ? 1 : 0) - (k.has('s') ? 1 : 0);
      const s = (k.has('d') ? 1 : 0) - (k.has('a') ? 1 : 0);
      const u = (k.has('r') ? 1 : 0) - (k.has('f') ? 1 : 0);
      if (f || s || u) this.view.rig.freeMove(f, s, u, dt, k.has('shift'));
    } else if (this.view.rig.mode === 'tactical' || this.view.rig.mode === 'command') {
      const f = (k.has('w') ? 1 : 0) - (k.has('s') ? 1 : 0);
      const s = (k.has('d') ? 1 : 0) - (k.has('a') ? 1 : 0);
      if (f || s) this.view.rig.pan(s * 300 * dt, -f * 300 * dt);
      if (k.has('q')) this.view.rig.orbit(-120 * dt, 0);
      if (k.has('e')) this.view.rig.orbit(120 * dt, 0);
    }
  }

  private bindInput(): void {
    const c = this.canvas;
    // Touch: track active pointers for pinch-to-zoom.
    const touches = new Map<number, { x: number; y: number }>();
    let pinchDistance = 0;
    let pinchCentre: { x: number; y: number } | null = null;
    const onDown = (e: PointerEvent) => {
      if ((e.target as HTMLElement) !== c) return;
      if (e.pointerType === 'touch') {
        touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
        if (touches.size === 2) {
          const [a, b] = [...touches.values()];
          pinchDistance = Math.hypot(a.x - b.x, a.y - b.y);
          pinchCentre = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
          this.dragging = null; // two fingers: zoom and pan, not orbit
          return;
        }
      }
      this.dragging = { button: e.button, x: e.clientX, y: e.clientY, moved: false };
      c.setPointerCapture(e.pointerId);
    };
    const onMove = (e: PointerEvent) => {
      const rect = c.getBoundingClientRect();
      if (e.pointerType === 'touch' && touches.has(e.pointerId)) {
        touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
        if (touches.size >= 2) {
          const [a, b] = [...touches.values()];
          const d = Math.hypot(a.x - b.x, a.y - b.y);
          if (pinchDistance > 0 && Math.abs(d - pinchDistance) > 1) this.view.rig.zoom((pinchDistance - d) * 4);
          pinchDistance = d;
          // Two-finger drag pans: move by the centroid delta.
          const cx = (a.x + b.x) / 2;
          const cy = (a.y + b.y) / 2;
          if (pinchCentre) this.view.rig.pan(cx - pinchCentre.x, cy - pinchCentre.y);
          pinchCentre = { x: cx, y: cy };
          return;
        }
      }
      if (this.dragging) {
        const dx = e.clientX - this.dragging.x;
        const dy = e.clientY - this.dragging.y;
        if (Math.abs(dx) + Math.abs(dy) > 3) this.dragging.moved = true;
        if (this.dragging.moved) {
          if (this.dragging.button === 0 || this.dragging.button === 2) this.view.rig.orbit(dx, dy);
          else this.view.rig.pan(dx, dy);
          this.dragging.x = e.clientX;
          this.dragging.y = e.clientY;
        }
      } else {
        const hit = this.view.pick(e.clientX - rect.left, e.clientY - rect.top, rect.width, rect.height);
        this.overlay.hoverId = hit?.id;
        c.style.cursor = hit ? 'pointer' : 'default';
      }
    };
    const onUp = (e: PointerEvent) => {
      if (e.pointerType === 'touch') {
        touches.delete(e.pointerId);
        if (touches.size < 2) {
          pinchDistance = 0;
          pinchCentre = null;
        }
      }
      if (!this.dragging) return;
      const d = this.dragging;
      this.dragging = null;
      c.releasePointerCapture(e.pointerId);
      if (d.moved) return;
      const rect = c.getBoundingClientRect();
      const hit = this.view.pick(e.clientX - rect.left, e.clientY - rect.top, rect.width, rect.height);
      if (d.button === 0) {
        this.select(hit?.id, e.shiftKey);
        if (hit) this.app.playUi('ui_click');
      } else if (d.button === 2) {
        if (hit && hit.side !== this.config.perspectiveSide) this.attackWithSelection(hit.id);
        else if (hit && hit.side === this.config.perspectiveSide) {
          this.select(hit.id);
          this.view.rig.setMode('follow');
          this.hud.refresh();
        }
      }
    };
    c.addEventListener('pointerdown', onDown);
    c.addEventListener('pointermove', onMove);
    c.addEventListener('pointerup', onUp);
    c.addEventListener('pointercancel', onUp);
    c.addEventListener('contextmenu', (e) => e.preventDefault());
    c.addEventListener('wheel', (e) => {
      e.preventDefault();
      this.view.rig.zoom(e.deltaY);
    }, { passive: false });
    c.addEventListener('dblclick', (e) => {
      const rect = c.getBoundingClientRect();
      const hit = this.view.pick(e.clientX - rect.left, e.clientY - rect.top, rect.width, rect.height);
      if (hit) {
        this.focusOn(hit.id);
        this.select(hit.id);
      }
    });
    this.onKeyDown = this.onKeyDown.bind(this);
    this.onKeyUp = this.onKeyUp.bind(this);
    this.onResize = this.onResize.bind(this);
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    window.addEventListener('resize', this.onResize);
  }

  private onKeyDown(e: KeyboardEvent): void {
    if ((e.target as HTMLElement)?.tagName === 'INPUT' || (e.target as HTMLElement)?.tagName === 'TEXTAREA' || (e.target as HTMLElement)?.tagName === 'SELECT') return;
    const k = e.key.toLowerCase();
    this.keys.add(k);
    if (k === 'shift') this.keys.add('shift');
    switch (k) {
      case ' ':
        e.preventDefault();
        this.togglePause();
        break;
      case '+':
      case '=':
      case ']':
        this.setSpeed(this.speedIndex + 1);
        break;
      case '-':
      case '[':
        this.setSpeed(this.speedIndex - 1);
        break;
      case 'z':
        if(this.view.rig.mode==='gunnery' && !e.repeat){e.preventDefault();this.view.rig.toggleGunneryZoom();}
        break;
      case 'h':
        this.toggleHud();
        break;
      case 'o':
        if (!e.repeat) this.toggleOverlay();
        break;
      case '1':
        this.setCamera('tactical');
        break;
      case '2':
        this.setCamera('cinematic');
        break;
      case '3':
        this.setCamera('follow');
        break;
      case '4':
        this.setCamera('free');
        break;
      case '5':
        this.setCamera('projectile');
        break;
      case '6':
        this.setCamera('reaper');
        break;
      case '7':
        this.setCamera('command');
        break;
      case 'tab':
        e.preventDefault();
        this.selectFleet();
        break;
      case 'escape':
        this.hud.toggleMenu();
        break;
      default:
        break;
    }
  }
  private onKeyUp(e: KeyboardEvent): void {
    this.keys.delete(e.key.toLowerCase());
  }
  private onResize(): void {
    this.resize();
  }

  resize(): void {
    const w = this.canvas.clientWidth;
    const h = this.canvas.clientHeight;
    this.view.resize(w, h);
    this.overlay.resize(w, h, Math.min(window.devicePixelRatio, 2));
  }

  dispose(): void {
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    window.removeEventListener('resize', this.onResize);
    this.hud.root.remove();
    this.gunneryOverlay.root.remove();
    this.view.dispose();
    this.overlay.resize(1, 1, 1);
  }
}

export class App {
  readonly ui: HTMLElement;
  readonly canvas: HTMLCanvasElement;
  readonly overlayCanvas: HTMLCanvasElement;
  prefs: Preferences = { ...DEFAULT_PREFERENCES };
  customTimelines: RuleSet[] = [];
  history: BattleResult[] = [];
  battle?: BattleController;
  lastBattle?: LastBattle;
  screen: ScreenName = 'menu';
  campaign?: CampaignState;
  postwar?: PostWarState;
  civilization?: CivilizationState;
  civilizationBackup?: CivilizationState;
  civilizationBattleConfig?: BattleConfig;
  /** Set when returning to the campaign screen after a fought battle. */
  campaignResume = false;
  private toastTimer = 0;
  private toastElement?: HTMLElement;

  constructor() {
    this.ui = document.getElementById('ui')!;
    this.canvas = document.getElementById('battle-canvas') as HTMLCanvasElement;
    this.overlayCanvas = document.getElementById('overlay-canvas') as HTMLCanvasElement;
    const unlock = () => {
      audio.init();
      audio.settings = { ...this.prefs.audio };
      audio.applySettings();
    };
    window.addEventListener('pointerdown', unlock, { passive: true });
    window.addEventListener('keydown', unlock, { passive: true });
    this.ui.addEventListener('change', (event: Event) => {
      const target = event.target;
      if (target instanceof HTMLSelectElement ||
        (target instanceof HTMLInputElement && (target.type === 'range' || target.type === 'checkbox'))) {
        this.playUi('ui_click');
      }
    });
  }

  async init(): Promise<void> {
    const savedPreferences = await storage.get<Partial<Preferences>>('preferences', DEFAULT_PREFERENCES);
    this.prefs = { ...DEFAULT_PREFERENCES, ...savedPreferences };
    this.prefs.uiScale = normaliseUiScale(savedPreferences?.uiScale, window.innerWidth);
    applyUiScale(this.ui, this.prefs.uiScale);
    this.prefs.graphics = { ...DEFAULT_PREFERENCES.graphics, ...this.prefs.graphics };
    this.prefs.audio = { ...DEFAULT_PREFERENCES.audio, ...this.prefs.audio };
    this.prefs.overlayIndependent = this.prefs.overlayIndependent === true;
    if (!['auto', 'ships', 'fleets'].includes(this.prefs.overlayDetail)) this.prefs.overlayDetail = 'auto';
    this.customTimelines = await storage.get('customTimelines', []);
    this.history = await storage.get('battleHistory', []);
    this.civilization = normalizeCivilizationState(await storage.get('civilization', undefined));
    this.civilizationBackup = normalizeCivilizationState(await storage.get('civilizationBackup', undefined));
    const pendingConfig = await storage.get<BattleConfig | undefined>('civilizationBattle', undefined);
    if (pendingConfig && typeof pendingConfig === 'object' && pendingConfig.id === this.civilization?.pendingBattle?.id && Array.isArray(pendingConfig.fleets)) this.civilizationBattleConfig = pendingConfig;
    audio.settings = { ...this.prefs.audio };
    this.show('menu');
    installShipReferenceInspector();
    document.getElementById('boot')?.classList.add('hidden');
  }

  // ------------------------------------------------------------- timelines

  allTimelines(): RuleSet[] {
    return [...PRESETS, ...this.customTimelines];
  }
  getTimeline(id: string): RuleSet {
    const c = this.customTimelines.find((t) => t.id === id);
    if (c) return cloneRules(c);
    try {
      return getPreset(id);
    } catch {
      return getPreset('canon_me3');
    }
  }
  currentRules(): RuleSet {
    return this.getTimeline(this.prefs.lastTimelineId);
  }
  selectTimeline(id: string): void {
    this.prefs.lastTimelineId = id;
    void this.savePrefs();
  }
  saveCustomTimeline(rules: RuleSet): void {
    const i = this.customTimelines.findIndex((t) => t.id === rules.id);
    if (i >= 0) this.customTimelines[i] = rules;
    else this.customTimelines.push(rules);
    void storage.set('customTimelines', this.customTimelines);
  }
  deleteCustomTimeline(id: string): void {
    this.customTimelines = this.customTimelines.filter((t) => t.id !== id);
    if (this.prefs.lastTimelineId === id) this.prefs.lastTimelineId = 'canon_me3';
    void storage.set('customTimelines', this.customTimelines);
  }

  async savePrefs(): Promise<void> {
    applyUiScale(this.ui, this.prefs.uiScale);
    await storage.set('preferences', this.prefs);
    audio.settings = { ...this.prefs.audio };
    audio.applySettings();
  }

  playUi(id: SoundId): void {
    audio.play(id);
  }

  // ---------------------------------------------------------------- screens

  show(screen: ScreenName, params?: unknown): void {
    if (screen !== this.screen && screen !== 'battle') this.playUi('ui_open');
    if (screen !== 'battle' && this.battle) {
      this.battle.dispose();
      this.battle = undefined;
      this.canvas.style.visibility = 'hidden';
    }
    this.screen = screen;
    clear(this.ui);
    let node: HTMLElement;
    switch (screen) {
      case 'menu':
        node = renderMenu(this);
        break;
      case 'briefing':
        node = renderBriefing(this, params as { scenarioId?: string } | undefined);
        break;
      case 'results':
        node = renderResults(this);
        break;
      case 'comparison':
        node = renderComparison(this, params as { report?: ComparisonReport } | undefined);
        break;
      case 'codex':
        node = renderCodex(this);
        break;
      case 'database':
        node = renderDatabase(this);
        break;
      case 'custom':
        node = renderCustom(this, params as { template?: CustomBattleInput } | undefined);
        break;
      case 'timelines':
        node = renderTimelines(this, params as { editId?: string } | undefined);
        break;
      case 'settings':
        node = renderSettings(this);
        break;
      case 'campaign_setup':
        node = renderCampaignSetup(this);
        break;
      case 'campaign':
        node = this.campaign ? renderCampaign(this, this.campaign) : renderMenu(this);
        break;
      case 'postwar':
        node = this.postwar ? renderPostWar(this, this.postwar) : renderMenu(this);
        break;
      case 'saves':
        node = renderSaves(this, params as { saveCurrent?: 'campaign' | 'postwar' } | undefined);
        break;
      case 'au_hub':
        node = renderAuHub(this);
        break;
      case 'civilization':
        node = renderCivilization(this, params as { found?: boolean; origin?: CivilizationOrigin } | undefined);
        break;
      case 'battle':
        node = el('div');
        break;
    }
    this.ui.appendChild(node);
  }

  /** Start (or replay) a battle. */
  startCampaign(opts: CampaignOptions): void {
    this.campaign = createCampaign(opts);
    void storage.set('campaign', this.campaign);
    this.show('campaign');
  }

  startPostWar(rules: RuleSet, seed: number): void {
    this.postwar = createPostWar(rules, seed);
    void storage.set('postwar', this.postwar);
    this.show('postwar');
  }

  async loadPostWar(): Promise<boolean> {
    const saved = await storage.get<PostWarState | undefined>('postwar', undefined);
    if (!saved || typeof saved !== 'object' || !saved.metrics) return false;
    this.postwar = saved;
    this.show('postwar');
    return true;
  }

  async loadCampaign(): Promise<boolean> {
    const saved = await storage.get<CampaignState | undefined>('campaign', undefined);
    if (!saved || typeof saved !== 'object' || !saved.systems || !saved.fleets) return false;
    this.resumeCampaign(saved);
    return true;
  }

  /** Resume a campaign from slot data: it becomes the active game and the autosave. */
  resumeCampaign(state: CampaignState): void {
    this.campaign = normaliseCampaign(state);
    void storage.set('campaign', this.campaign);
    this.show('campaign');
  }

  resumePostWar(state: PostWarState): void {
    this.postwar = state;
    void storage.set('postwar', this.postwar);
    this.show('postwar');
  }

  startBattle(config: BattleConfig, opts: { replay?: boolean; comparison?: ComparisonReport; comparisonSide?: 'a' | 'b'; campaign?: CampaignBattleLink; civilization?: CivilizationBattleLink } = {}): void {
    if (this.battle) this.battle.dispose();
    clear(this.ui);
    this.screen = 'battle';
    this.canvas.style.visibility = 'visible';
    const controller = new BattleController(this, config, this.canvas, this.overlayCanvas, !!opts.replay);
    this.battle = controller;
    this.ui.appendChild(controller.hud.root);
    controller.hud.setComparison(opts.comparison, opts.comparisonSide);
    controller.campaignLink = opts.campaign;
    controller.civilizationLink = opts.civilization;
    if (config.scenarioId !== 'campaign') {
      this.prefs.lastScenarioId = config.scenarioId;
      void this.savePrefs();
    }
  }

  /** Called by the HUD when a battle ends and the player views results. */
  finishBattle(comparison?: ComparisonReport, comparisonSide?: 'a' | 'b'): void {
    const b = this.battle;
    if (!b || !b.sim.result) return;
    this.lastBattle = { sim: b.sim, result: b.sim.result, config: b.config, comparison, comparisonSide, campaign: b.campaignLink, civilization: b.civilizationLink };
    if (!b.isReplay && b.civilizationLink?.civilizationId === this.civilization?.id && this.civilization) {
      const survivors: Record<string, number> = {};
      for (const ship of b.sim.ships) if (ship.fleetId === 'custom-a' && ship.alive) survivors[ship.classId] = (survivors[ship.classId] ?? 0) + 1;
      const applied = applyCivilizationBattleResult(this.civilization, b.sim.result, survivors);
      if (applied.ok) { this.civilizationBattleConfig = undefined; void this.saveCivilization(); }
      else this.toast(applied.reason ?? 'CIVILIZATION RESULT COULD NOT BE APPLIED');
    }
    if (b.campaignLink && b.campaignLink.state.pending) {
      applyEngagementResult(b.campaignLink.state, b.campaignLink.pending, b.sim.result);
      this.campaign = b.campaignLink.state;
      this.campaignResume = true;
      void storage.set('campaign', this.campaign);
    }
    if (!b.isReplay) {
      this.history.push(b.sim.result);
      this.history = this.history.slice(-50);
      void storage.set('battleHistory', this.history);
    }
    this.show('results');
  }

  async saveCivilization(): Promise<void> {
    await storage.set('civilization', this.civilization ?? null);
    await storage.set('civilizationBackup', this.civilizationBackup ?? null);
    await storage.set('civilizationBattle', this.civilizationBattleConfig ?? null);
  }

  foundCivilization(input: CivilizationInput): void {
    if (this.civilization?.pendingBattle) return this.toast('RESOLVE OR CANCEL THE PENDING ENGAGEMENT FIRST');
    this.adoptCivilization(createCivilization(input));
  }

  adoptCivilization(state: CivilizationState): void {
    if (this.civilization?.pendingBattle) return this.toast('RESOLVE OR CANCEL THE PENDING ENGAGEMENT FIRST');
    const safe = normalizeCivilizationState(state); if (!safe) return this.toast('INVALID CIVILIZATION');
    this.civilizationBackup = this.civilization;
    this.civilization = safe; this.civilizationBattleConfig = undefined;
    void this.saveCivilization(); this.show('civilization');
  }

  restoreCivilizationBackup(): void {
    if (this.civilization?.pendingBattle || !this.civilizationBackup) return;
    const previous = this.civilization; this.civilization = this.civilizationBackup; this.civilizationBackup = previous;
    this.civilizationBattleConfig = undefined;
    void this.saveCivilization(); this.show('civilization');
  }

  cancelCivilizationDeployment(): void {
    const state = this.civilization; if (!state?.pendingBattle) return;
    const result = cancelCivilizationBattle(state, state.pendingBattle.id);
    if (!result.ok) return this.toast(result.reason ?? 'NO PENDING DEPLOYMENT');
    this.civilizationBattleConfig = undefined; void this.saveCivilization();
  }

  startCivilizationBattle(encounter: 'patrol' | 'harvest' | 'invasion' | 'skynet' = 'harvest'): void {
    const state = this.civilization; if (!state) return;
    if (state.pendingBattle) {
      if (this.civilizationBattleConfig?.id !== state.pendingBattle.id) return this.toast('PENDING BATTLE CONFIGURATION MISSING; CANCEL ITS DEPLOYMENT TO CONTINUE');
      this.startBattle(this.civilizationBattleConfig, { civilization: { civilizationId: state.id } }); return;
    }
    const launch = beginCivilizationBattle(state);
    if (!launch.ok || !launch.battle) return this.toast(launch.reason ?? 'FLEET UNAVAILABLE');
    const enemy: CustomFleetInput = encounter === 'skynet'
      ? { faction: 'skynet', name: 'Skynet orbital machines', formation: 'strike_wedge', counts: { skynet_hunter: 8, skynet_harvester: 1 } }
      : { faction: 'reaper', name: 'Reaper harvest force', formation: 'strike_wedge', counts: encounter === 'patrol' ? { reaper_destroyer: 2 } : encounter === 'invasion' ? { reaper_capital: 4, reaper_destroyer: 8 } : { reaper_capital: 1, reaper_destroyer: 4 } };
    const rulesId = state.faction === 'past_cycle' ? 'past_cycles' : 'player_civilization';
    try {
      const cfg = buildCustomBattle({ seed: launch.battle.seed, rulesId, rosterMode: encounter === 'skynet' ? 'multiverse' : 'mass_effect', environment: 'deep_space', startingDistanceKm: 90, maxDuration: 300, sideA: launch.battle.fleet, sideB: enemy });
      cfg.id = launch.battle.id; cfg.name = `${state.name} — engagement ${state.battleSerial}`;
      this.civilizationBattleConfig = cfg; void this.saveCivilization();
      this.startBattle(cfg, { civilization: { civilizationId: state.id } });
    } catch (error) {
      cancelCivilizationBattle(state, launch.battle.id); void this.saveCivilization(); this.toast(error instanceof Error ? error.message : 'CIVILIZATION LAUNCH FAILED');
    }
  }

  toast(text: string): void {
    this.toastElement?.remove();
    const t = el('div', { class: 'toast' }, text);
    this.toastElement = t;
    this.ui.appendChild(t);
    window.clearTimeout(this.toastTimer);
    this.toastTimer = window.setTimeout(() => {
      t.remove();
      this.toastElement = undefined;
      this.toastTimer = 0;
    }, 2200);
  }
}
