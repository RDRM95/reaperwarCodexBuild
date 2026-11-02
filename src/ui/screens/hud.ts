import type { App, BattleController } from '../app';
import { SPEEDS } from '../app';
import { el, fmtNum, fmtTime, setChildren } from '../dom';
import { FACTIONS } from '@/data/factions';
import { getShipClass } from '@/data/ships';
import type { BattleEvent, BattleResult, FormationType, OrderType, ShipState, TargetPriority } from '@/simulation/types';
import { FORMATION_LABELS } from '@/simulation/types';
import { assessReapers } from '@/simulation/reaperIntel';
import { CAMERA_MODE_LABELS, type CameraMode } from '@/rendering/cameras';
import type { ComparisonReport } from '@/scenarios/comparison';
import { engagementBand, shipEngagementRange } from '@/simulation/ai';
import { BATTLESPACE_SCALE } from '@/simulation/constants';
import { distance } from '@/core/vec3';

export interface Hud {
  root: HTMLElement;
  refresh(): void;
  tick(dt: number, events: BattleEvent[]): void;
  toast(text: string): void;
  showEnd(result: BattleResult): void;
  toggleMenu(): void;
  setComparison(report?: ComparisonReport, side?: 'a' | 'b'): void;
}

const ORDERS: { id: OrderType; label: string }[] = [
  { id: 'attack', label: 'Attack' },
  { id: 'advance', label: 'Advance' },
  { id: 'hold_formation', label: 'Hold formation' },
  { id: 'defend_position', label: 'Defend position' },
  { id: 'withdraw', label: 'Withdraw' },
  { id: 'retreat', label: 'Retreat' },
];
const PRIORITIES: { id: TargetPriority; label: string }[] = [
  { id: 'default', label: 'Threat-based' },
  { id: 'reaper_capitals', label: 'Reaper capitals' },
  { id: 'reaper_destroyers', label: 'Reaper destroyers' },
  { id: 'capitals', label: 'Capital ships' },
  { id: 'escorts', label: 'Escorts' },
];

export function createHud(app: App, ctrl: BattleController): Hud {
  const sim = () => ctrl.sim;
  const rules = ctrl.config.rules;
  let comparison: ComparisonReport | undefined;
  let comparisonSide: 'a' | 'b' | undefined;
  let menuOpen = false;
  let endShown = false;

  const clock = el('div', { class: 'hud-clock' });
  const speedRow = el('div', { class: 'row hud-speed' });
  const cameraRow = el('div', { class: 'row' });
  const watchBtn = el('button', { class: 'btn small', 'data-action': 'watch-battle', onclick: () => ctrl.toggleWatch() }, 'Watch battle');
  const shipList = el('div', { class: 'ship-list scroll' });
  const enemyList = el('div', { class: 'ship-list scroll' });
  const targetPanel = el('div', { class: 'target-panel' });
  const ordersPanel = el('div', { class: 'orders' });
  const formationSel = el('select');
  const prioritySel = el('select');
  const commsBox = el('div', { class: 'comms' });
  const intelBox = el('div', { class: 'intel' });
  const subtitle = el('div', { class: 'subtitle', style: { display: 'none' } });
  const toastHost = el('div');
  const statusLine = el('div', { class: 'mono dim', style: { fontSize: '10px', letterSpacing: '0.15em' } });
  const fireScope = el('select', { 'data-action': 'fire-control-scope', 'aria-label': 'Spinal fire command scope' }, [
    el('option', { value: 'all' }, 'All commanded fleets'),
  ]);
  const batteryReadiness = el('div', { class: 'battery-readiness mono', 'data-action': 'fleet-battery-status', 'aria-live': 'polite' });
  const fireFleetId = () => fireScope.value === 'all' ? undefined : fireScope.value;
  const scopedFireFleets = () => ctrl.fireControlFleetIds.filter((id) => fireScope.value === 'all' || id === fireScope.value);
  const holdPrimaryBtn = el('button', { class: 'btn', 'data-action': 'hold-primary-fire', onclick: () => {
    const statuses = scopedFireFleets().map((id) => sim().fleetBatteryStatus(id)).filter((s) => s && s.total > 0);
    ctrl.setPrimaryFire(!statuses.length || !statuses.every((s) => s!.held), fireFleetId());
  } }, 'Hold spinal fire');
  const releasePrimaryBtn = el('button', { class: 'btn', 'data-action': 'release-primary-volley', onclick: () => ctrl.releasePrimaryVolley(fireFleetId()) }, 'Release volley');
  fireScope.addEventListener('change', () => ctrl.hud.refresh());

  for (const f of Object.keys(FORMATION_LABELS) as FormationType[]) formationSel.append(el('option', { value: f }, FORMATION_LABELS[f]));
  for (const p of PRIORITIES) prioritySel.append(el('option', { value: p.id }, p.label));
  formationSel.addEventListener('change', () => ctrl.order({ formation: formationSel.value as FormationType }));
  prioritySel.addEventListener('change', () => ctrl.order({ priority: prioritySel.value as TargetPriority }));

  const fightersBtn = el('button', { class: 'btn', onclick: () => {
    const f = playerFleet();
    ctrl.order({ fightersDeployed: !(f?.orders.fightersDeployed ?? true) });
  } }, 'Fighters');
  const focusBtn = el('button', { class: 'btn', onclick: () => {
    const f = playerFleet();
    ctrl.order({ focusFire: !(f?.orders.focusFire ?? true) });
  } }, 'Focus fire');
  const protectBtn = el('button', { class: 'btn', onclick: () => {
    const f = playerFleet();
    ctrl.order({ protectCapitals: !(f?.orders.protectCapitals ?? false) });
  } }, 'Protect capitals');
  const pdBtn = el('button', { class: 'btn', onclick: () => {
    const f = playerFleet();
    ctrl.order({ pointDefenceMissiles: !(f?.orders.pointDefenceMissiles ?? false) });
  } }, 'PD: missiles');

  for (const o of ORDERS) ordersPanel.append(el('button', { class: 'btn', 'data-order': o.id, onclick: () => ctrl.order({ order: o.id }) }, o.label));
  ordersPanel.append(fightersBtn, focusBtn, protectBtn, pdBtn);

  const playerFleet = () => {
    const id = ctrl.playerFleetIds[0];
    return id ? sim().fleets.get(id) : undefined;
  };

  const header = el('div', { class: 'hud-top' }, [
    el('div', { class: 'panel', style: { minWidth: '220px' } }, [
      el('div', { class: 'panel-title' }, [ctrl.config.name.toUpperCase(), el('span', { class: `badge ${rules.category}` }, rules.category === 'canon' ? 'CANON' : 'AU')]),
      clock,
      statusLine,
    ]),
    el('div', { class: 'panel' }, [el('div', { class: 'panel-title' }, 'SIMULATION'), speedRow, el('button', { class: 'btn small hud-panels-toggle', 'data-action': 'toggle-panels', style: { marginTop: '6px' }, onclick: () => root.classList.toggle('panels-open') }, 'Panels')]),
    el('div', { class: 'panel' }, [el('div', { class: 'panel-title' }, 'CAMERA'), cameraRow, watchBtn]),
    el('div', { class: 'spacer' }),
    el('div', { class: 'panel orange hud-timeline', style: { maxWidth: '260px' } }, [el('div', { class: 'panel-title' }, 'TIMELINE'), el('div', { style: { fontSize: '13px' } }, rules.name), el('div', { class: 'dim', style: { fontSize: '11px' } }, rules.tagline)]),
    el('button', { class: 'btn', 'data-action': 'menu', onclick: () => toggleMenu() }, 'Menu'),
  ]);

  const left = el('div', { class: 'hud-left' }, [
    el('div', { class: 'panel', style: { flex: '1', display: 'flex', flexDirection: 'column', minHeight: '0' } }, [el('div', { class: 'panel-title' }, ['ALLIED FLEET', el('button', { class: 'btn small', onclick: () => ctrl.selectFleet() }, 'Select all')]), shipList]),
    el('div', { class: 'panel red', style: { flex: '1', display: 'flex', flexDirection: 'column', minHeight: '0' } }, [el('div', { class: 'panel-title' }, 'HOSTILE CONTACTS'), enemyList]),
  ]);

  const right = el('div', { class: 'hud-right' }, [
    el('div', { class: 'panel' }, [el('div', { class: 'panel-title' }, 'TARGET / SELECTION'), targetPanel]),
    el('div', { class: 'panel orange' }, [
      el('div', { class: 'panel-title' }, 'FLEET ORDERS'),
      el('div', { class: 'row', style: { marginBottom: '8px' } }, [el('label', { class: 'field', style: { flex: '1' } }, ['Formation', formationSel]), el('label', { class: 'field', style: { flex: '1' } }, ['Priority', prioritySel])]),
      ordersPanel,
      el('div', { class: 'spinal-fire-controls' }, [
        el('label', { class: 'field' }, ['Spinal fire scope', fireScope]),
        el('div', { class: 'orders', style: { marginTop: '6px' } }, [holdPrimaryBtn, releasePrimaryBtn]),
        batteryReadiness,
        el('div', { class: 'dim', style: { fontSize: '10px' } }, 'Scope applies to spinal fire only. Movement and other orders command all player fleets. Secondary weapons and point defence remain active.'),
      ]),
      el('div', { class: 'dim', style: { fontSize: '10px', marginTop: '6px' } }, 'Left-click: select · Shift: multi-select · Right-click enemy: attack · Right-click ally: follow · Double-click: focus camera · Tab: select fleet · Space: pause · [ ]: speed · 1–7: cameras · H: hide HUD'),
    ]),
    el('div', { class: 'panel red', style: { flex: '1', minHeight: '100px', overflow: 'auto' } }, [el('div', { class: 'panel-title' }, 'REAPER INTELLIGENCE ASSESSMENT'), intelBox]),
  ]);

  const bottom = el('div', { class: 'hud-bottom' }, [
    el('div', { class: 'panel', style: { flex: '1', maxWidth: '640px' } }, [el('div', { class: 'panel-title' }, 'FLEET COMMUNICATIONS'), commsBox]),
  ]);

  const root = el('div', { class: 'hud' }, [header, left, right, bottom, subtitle, toastHost]);

  // --------------------------------------------------------- menu overlay
  const menuOverlay = el('div', { class: 'screen transparent', style: { display: 'none', background: 'rgba(6,9,15,0.75)', alignItems: 'center', justifyContent: 'center' } });
  root.append(menuOverlay);
  const buildMenu = () => {
    menuOverlay.replaceChildren(
      el('div', { class: 'panel', style: { width: '420px' } }, [
        el('div', { class: 'panel-title' }, 'PAUSED'),
        el('div', { class: 'col' }, [
          el('button', { class: 'btn primary', onclick: () => toggleMenu() }, 'Resume'),
          el('button', { class: 'btn', onclick: () => {
            app.startBattle(ctrl.config, { replay: true, comparison, comparisonSide });
          } }, 'Restart (same seed)'),
          el('button', { class: 'btn', onclick: () => {
            ctrl.toggleHud();
            toggleMenu();
          } }, ctrl.hudLevel === 'full' ? 'HUD: minimal (H)' : ctrl.hudLevel === 'minimal' ? 'HUD: none for recording (H)' : 'HUD: full (H)'),
          el('button', { class: 'btn', onclick: () => {
            app.prefs.showOverlay = !app.prefs.showOverlay;
            ctrl.overlay.visible = !ctrl.hudHidden && app.prefs.showOverlay;
            void app.savePrefs();
            buildMenu();
          } }, `Tactical overlay: ${app.prefs.showOverlay ? 'ON' : 'OFF'}`),
          el('button', { class: 'btn', onclick: () => {
            app.prefs.audio.muted = !app.prefs.audio.muted;
            void app.savePrefs();
            buildMenu();
          } }, `Audio: ${app.prefs.audio.muted ? 'MUTED' : 'ON'}`),
          el('button', { class: 'btn', onclick: () => {
            if (sim().finished) app.finishBattle(comparison, comparisonSide);
            else app.show('menu');
          } }, sim().finished ? 'View results' : 'Abandon battle'),
          el('button', { class: 'btn danger', onclick: () => app.show('menu') }, 'Main menu'),
        ]),
      ]),
    );
  };
  function toggleMenu(): void {
    menuOpen = !menuOpen;
    if (menuOpen) {
      buildMenu();
      menuOverlay.style.display = 'flex';
      if (!ctrl.paused) ctrl.togglePause();
    } else {
      menuOverlay.style.display = 'none';
      if (ctrl.paused && !sim().finished) ctrl.togglePause();
    }
  }

  // ------------------------------------------------------------ renderers
  interface RowRefs { row: HTMLElement; name: HTMLElement; barrier: HTMLElement; hull: HTMLElement }
  const rowCache = new Map<string, RowRefs>();
  const shipRow = (s: ShipState): RowRefs => {
    let r = rowCache.get(s.id);
    if (!r) {
      const name = el('div', { class: 'name', title: s.name }, s.name);
      const barrier = el('i');
      const hull = el('i');
      const row = el('div', { class: 'ship-row', 'data-ship': s.id, onclick: (e: MouseEvent) => {
        ctrl.select(s.id, e.shiftKey);
        app.playUi('ui_click');
      }, ondblclick: () => ctrl.focusOn(s.id), oncontextmenu: (e: MouseEvent) => {
        e.preventDefault();
        if (s.side !== ctrl.config.perspectiveSide) ctrl.attackWithSelection(s.id);
      } }, [name, el('div', { class: 'bars' }, [el('div', { class: 'bar barrier' }, [barrier]), el('div', { class: 'bar hull' }, [hull])])]);
      r = { row, name, barrier, hull };
      rowCache.set(s.id, r);
    }
    r.row.classList.toggle('selected', ctrl.view.selectedIds.has(s.id));
    r.row.classList.toggle('dead', !s.alive);
    r.name.textContent = `${s.name}${s.withdrawing ? ' ↩' : ''}${s.overheated ? ' ♨' : ''}`;
    r.barrier.style.width = `${(100 * s.barriers) / Math.max(1, s.maxBarriers)}%`;
    r.hull.style.width = `${(100 * s.hull) / s.maxHull}%`;
    return r;
  };

  const fighterLine = el('div', { class: 'dim mono', style: { padding: '4px 6px', fontSize: '10px' } });
  const syncList = (container: HTMLElement, ships: ShipState[], extra?: HTMLElement) => {
    const rows = ships.map((s) => shipRow(s).row);
    const wanted: Node[] = extra ? [...rows, extra] : rows;
    // Only touch the DOM when the order/membership changed.
    let same = container.childNodes.length === wanted.length;
    if (same) for (let i = 0; i < wanted.length; i++) if (container.childNodes[i] !== wanted[i]) { same = false; break; }
    if (!same) container.replaceChildren(...wanted);
  };

  const renderLists = () => {
    const s = sim();
    const mine = s.ships.filter((x) => x.side === ctrl.config.perspectiveSide && x.role !== 'fighter' && !x.escaped).sort((a, b) => b.pointValue - a.pointValue).slice(0, 80);
    const theirs = s.ships.filter((x) => x.side !== ctrl.config.perspectiveSide && x.role !== 'fighter' && !x.escaped).sort((a, b) => b.pointValue - a.pointValue).slice(0, 80);
    const fighters = s.ships.filter((x) => x.side === ctrl.config.perspectiveSide && x.role === 'fighter' && x.alive && !x.escaped).length;
    fighterLine.textContent = `${fighters} fighters deployed`;
    syncList(shipList, mine, fighters > 0 ? fighterLine : undefined);
    syncList(enemyList, theirs);
  };

  const renderTarget = () => {
    const ids = [...ctrl.view.selectedIds];
    if (ids.length === 0) {
      targetPanel.replaceChildren(el('div', { class: 'dim', style: { fontSize: '12px' } }, 'No selection. Click a ship in the view or the fleet list.'));
      return;
    }
    if (ids.length > 1) {
      const ships = ids.map((id) => sim().getShip(id)).filter((x): x is ShipState => !!x && x.alive);
      targetPanel.replaceChildren(
        el('div', {}, [el('b', {}, `${ships.length} ships selected`)]),
        el('div', { class: 'dim', style: { fontSize: '12px' } }, 'Right-click a hostile to order the selection to attack it.'),
      );
      return;
    }
    const s = sim().getShip(ids[0]);
    if (!s) return;
    const cls = getShipClass(s.classId);
    const battery = sim().primaryBatteryStatus(s.id);
    const targetId = battery?.targetId ?? s.targetId;
    const target = targetId ? sim().getShip(targetId) : undefined;
    const band = engagementBand(s);
    const reasons: Record<string, string> = {
      ready: 'Ready', held: 'Fire held', cooling: 'Reloading', coordinating: 'Coordinating salvo',
      out_of_range: 'Out of range', aligning: 'Aligning spinal gun', overheated: 'Overheated',
      out_of_ammo: 'Out of ammunition', no_target: 'No target', retreating: 'Retreating',
      destroyed: 'Destroyed', escaped: 'Escaped',
    };
    let batteryText = battery && battery.total > 0 ? reasons[battery.reason] ?? battery.reason.replaceAll('_', ' ') : 'No spinal battery';
    if (battery?.reason === 'cooling') batteryText += ` ${battery.cooldownRemaining.toFixed(1)}s`;
    if (battery && battery.total > 0) batteryText += ` · ${battery.ready}/${battery.total} ready`;
    if (battery && battery.volleyRemaining > 0) batteryText += ` · RELEASE ${battery.volleyRemaining.toFixed(1)}s`;
    const fleet = sim().fleets.get(s.fleetId);
    const movement = !s.alive ? 'Destroyed' : s.escaped ? 'Escaped' : s.rearming ? 'Rearming' : s.withdrawing ? 'Recovering'
      : fleet?.orders.order === 'retreat' ? 'Retreating' : fleet?.orders.order === 'withdraw' ? 'Withdrawing'
      : fleet?.orders.order === 'escort' || s.escortId ? 'Escorting'
      : fleet?.orders.order === 'hold_formation' || fleet?.orders.order === 'defend_position' ? 'Holding'
      : !target?.alive || target.escaped ? 'Seeking target'
      : s.engagementMode === 'approach' ? 'Closing' : s.engagementMode === 'reposition' ? 'Repositioning' : 'On station';
    const nominalKm = (value: number) => (value / BATTLESPACE_SCALE).toFixed(1);
    const targetDistance = battery?.distance ?? (target?.alive && !target.escaped ? distance(s.pos, target.pos) : undefined);
    const rangeText = `${targetDistance === undefined ? '—' : nominalKm(targetDistance)} / ${nominalKm(battery?.range ?? shipEngagementRange(s))} km · band ${nominalKm(band.min)}–${nominalKm(band.max)} km`;
    const stat = (k: string, v: string) => el('div', { class: 'stat' }, [el('b', {}, k), el('span', { class: 'mono' }, v)]);
    const feedbackStat = (k: string, v: string, action: string) => {
      const row = stat(k, v);
      row.dataset.action = action;
      return row;
    };
    targetPanel.replaceChildren(
      el('div', { style: { fontSize: '14px', marginBottom: '6px', color: FACTIONS[s.faction].colour } }, s.name),
      el('div', { class: 'dim', style: { fontSize: '11px', marginBottom: '8px' } }, `${cls.name} · ${FACTIONS[s.faction].name}`),
      stat('Hull', `${fmtNum(s.hull)} / ${fmtNum(s.maxHull)}`),
      stat('Barriers', `${fmtNum(s.barriers)} / ${fmtNum(s.maxBarriers)}`),
      stat('Armour', `${fmtNum(s.armour)} / ${fmtNum(s.maxArmour)}`),
      stat('Heat', s.heatCapacity > 0 ? `${fmtNum((100 * s.heat) / s.heatCapacity)}%${s.overheated ? ' OVERHEAT' : ''}` : 'n/a'),
      ...(s.weapons.some((w) => w.ammo !== undefined)
        ? [stat('Torpedoes', `${s.weapons.reduce((a, w) => a + (w.ammo ?? 0), 0)} / ${s.weapons.reduce((a, w) => a + (w.def.magazine ?? 0), 0)}${s.rearming ? ' · REARMING' : ''}`)]
        : []),
      ...(s.weapons.some((w) => w.def.burst)
        ? [stat('Point defence', s.weapons.filter((w) => w.def.burst).every((w) => (w.burstLeft ?? 1) <= 0) ? 'RECOVERING' : `${s.weapons.filter((w) => w.def.burst && (w.burstLeft ?? 1) > 0).length} / ${s.weapons.filter((w) => w.def.burst).length} mounts ready`)]
        : []),
      stat('Speed', `${(Math.hypot(s.vel.x, s.vel.y, s.vel.z) * 1000 / BATTLESPACE_SCALE).toFixed(0)} m/s`),
      stat('Subsystems', `ENG ${fmtNum(s.subsystems.engines * 100)}% · WPN ${fmtNum(s.subsystems.weapons * 100)}% · SNS ${fmtNum(s.subsystems.sensors * 100)}%`),
      stat('Target', target ? target.name : '—'),
      feedbackStat('Main battery', batteryText, 'ship-battery-status'),
      feedbackStat('Range / max', rangeText, 'ship-engagement-range'),
      stat('Record', `${s.stats.shotsFired} fired · ${s.stats.hits} hits · ${s.stats.kills} kills`),
      feedbackStat('Status', movement, 'ship-motion-state'),
      el('div', { class: 'row', style: { marginTop: '8px' } }, [
        el('button', { class: 'btn small', onclick: () => {
          ctrl.view.followId = s.id;
          ctrl.setCamera('follow');
        } }, 'Follow'),
        s.side !== ctrl.config.perspectiveSide ? el('button', { class: 'btn small primary', onclick: () => ctrl.order({ order: 'attack_target', targetId: s.id }) }, 'Fleet: attack this') : null,
        s.faction === 'reaper' ? el('button', { class: 'btn small', onclick: () => {
          ctrl.view.followId = s.id;
          ctrl.setCamera('reaper');
        } }, 'Reaper view') : null,
      ]),
    );
  };

  // Controls are built once and only their state is updated, so buttons stay
  // stable in the DOM (hover states, automation and screen readers rely on it).
  const pauseBtn = el('button', { class: 'btn small', 'data-action': 'pause', onclick: () => ctrl.togglePause() }, '❚❚');
  const speedBtns = SPEEDS.map((sp, i) => el('button', { class: 'btn small', 'data-speed': sp, onclick: () => {
    if (ctrl.paused) ctrl.togglePause();
    ctrl.setSpeed(i);
  } }, `${sp}×`));
  speedRow.append(pauseBtn, ...speedBtns);
  const cameraBtns = (Object.keys(CAMERA_MODE_LABELS) as CameraMode[]).map((m, i) => el('button', { class: 'btn small', 'data-camera': m, title: `Key ${i + 1}`, onclick: () => ctrl.setCamera(m) }, CAMERA_MODE_LABELS[m]));
  cameraRow.append(...cameraBtns);

  const renderControls = () => {
    watchBtn.textContent = ctrl.view.rig.mode === 'cinematic' && ctrl.hudLevel !== 'full' ? 'Return to command' : 'Watch battle';
    watchBtn.classList.toggle('active', ctrl.view.rig.mode === 'cinematic' && ctrl.hudLevel !== 'full');
    pauseBtn.classList.toggle('active', ctrl.paused);
    pauseBtn.textContent = ctrl.paused ? '▶' : '❚❚';
    speedBtns.forEach((b, i) => b.classList.toggle('active', i === ctrl.speedIndex && !ctrl.paused));
    cameraBtns.forEach((b) => b.classList.toggle('active', ctrl.view.rig.mode === b.dataset.camera));
    const f = playerFleet();
    if (f) {
      formationSel.value = f.orders.formation;
      prioritySel.value = f.orders.priority;
      for (const b of ordersPanel.querySelectorAll<HTMLButtonElement>('[data-order]')) b.classList.toggle('active', b.dataset.order === f.orders.order);
      fightersBtn.classList.toggle('active', f.orders.fightersDeployed);
      fightersBtn.textContent = f.orders.fightersDeployed ? 'Recall fighters' : 'Deploy fighters';
      focusBtn.classList.toggle('active', f.orders.focusFire);
      protectBtn.classList.toggle('active', f.orders.protectCapitals);
      pdBtn.classList.toggle('active', f.orders.pointDefenceMissiles);
    }
    const fleetIds = ctrl.fireControlFleetIds;
    const optionIds = Array.from(fireScope.options).slice(1).map((o) => o.value);
    if (fleetIds.length !== optionIds.length || fleetIds.some((id, i) => id !== optionIds[i])) {
      const previous = fireScope.value;
      fireScope.replaceChildren(
        el('option', { value: 'all' }, 'All commanded fleets'),
        ...fleetIds.map((id) => el('option', { value: id }, sim().fleets.get(id)!.spec.name)),
      );
      fireScope.value = fleetIds.includes(previous) ? previous : 'all';
    }
    const statuses = scopedFireFleets().map((id) => sim().fleetBatteryStatus(id)).filter((s) => s && s.total > 0);
    const ready = statuses.reduce((n, s) => n + s!.ready, 0);
    const total = statuses.reduce((n, s) => n + s!.total, 0);
    const cooling = statuses.reduce((n, s) => n + s!.cooling, 0);
    const held = statuses.length > 0 && statuses.every((s) => s!.held);
    const anyHeld = statuses.some((s) => s!.held);
    const releaseRemaining = statuses.reduce((n, s) => Math.max(n, s!.volleyRemaining), 0);
    const disabled = sim().finished || total === 0;
    fireScope.disabled = fleetIds.length === 0 || sim().finished;
    holdPrimaryBtn.disabled = disabled;
    holdPrimaryBtn.classList.toggle('active', held);
    holdPrimaryBtn.setAttribute('aria-pressed', String(held));
    holdPrimaryBtn.textContent = held ? 'Resume spinal fire' : 'Hold spinal fire';
    releasePrimaryBtn.disabled = disabled || ready === 0 || releaseRemaining > 0;
    releasePrimaryBtn.classList.toggle('active', releaseRemaining > 0);
    batteryReadiness.textContent = total > 0
      ? `${ready}/${total} guns ready · ${cooling} reloading · ${held ? 'FIRE HELD' : anyHeld ? 'MIXED FIRE' : 'FREE FIRE'}${releaseRemaining > 0 ? ` · RELEASE ${releaseRemaining.toFixed(1)}s` : ''}`
      : 'No commanded spinal batteries available.';
  };

  const renderIntel = () => {
    const a = assessReapers(sim());
    setChildren(intelBox,
      el('div', { class: 'headline' }, [a.headline, el('span', { class: 'level' }, `THREAT: ${a.threatLevel}`)]),
      ...a.lines.map((l) => el('div', {}, l)),
      el('div', { style: { marginTop: '6px', color: 'var(--text-dim)' } }, a.projectedResistance),
      el('div', { style: { color: 'var(--text-dim)' } }, a.harvestCompletionEstimate),
      a.unexpectedTechnologies.length > 0 ? el('div', { style: { marginTop: '6px', color: 'var(--orange)' } }, ['ANOMALIES: ', ...a.unexpectedTechnologies.map((t) => el('div', {}, `· ${t}`))]) : null,
    );
  };

  const refresh = () => {
    const s = sim();
    clock.replaceChildren(fmtTime(s.time), el('small', {}, `${ctrl.paused ? 'PAUSED' : `${ctrl.speed}× SPEED`} · ${ctrl.isReplay ? 'REPLAY · ' : ''}SEED ${s.config.seed} · ${ctrl.view.drawCalls} DRAWS`));
    const a = s.ships.filter((x) => x.side === 'A' && x.alive && !x.escaped && x.role !== 'fighter').length;
    const b = s.ships.filter((x) => x.side === 'B' && x.alive && !x.escaped && x.role !== 'fighter').length;
    statusLine.textContent = `ALLIED ${a} · HOSTILE ${b} · ${CAMERA_MODE_LABELS[ctrl.view.rig.mode].toUpperCase()} CAM`;
    renderControls();
    renderLists();
    renderTarget();
    renderIntel();
  };

  let subtitleTimer = 0;
  const tick = (dt: number, events: BattleEvent[]) => {
    for (const e of events) {
      if (e.type === 'comms') {
        const faction = FACTIONS[e.faction];
        const line = el('div', { class: `line ${e.faction === 'reaper' ? 'reaper' : ''}` }, [el('span', { class: 'who' }, `[${faction.shortName.toUpperCase()}] `), e.text]);
        commsBox.append(line);
        while (commsBox.children.length > 6) commsBox.firstChild?.remove();
        if (app.prefs.subtitles) {
          subtitle.replaceChildren(el('span', { class: 'who' }, faction.shortName.toUpperCase()), e.text);
          subtitle.style.display = 'block';
          subtitleTimer = 4;
        }
      }
    }
    if (subtitleTimer > 0) {
      subtitleTimer -= dt;
      if (subtitleTimer <= 0) subtitle.style.display = 'none';
    }
  };

  let toastEl: HTMLElement | undefined;
  let toastTimer = 0;
  const toast = (text: string) => {
    toastEl?.remove();
    toastEl = el('div', { class: 'toast' }, text);
    toastHost.append(toastEl);
    window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => toastEl?.remove(), 2000);
  };

  const showEnd = (result: BattleResult) => {
    if (endShown) return;
    endShown = true;
    app.playUi(result.outcome === 'victory' ? 'ui_confirm' : 'alert');
    const banner = el('div', { class: 'screen transparent', style: { background: 'rgba(6,9,15,0.55)', alignItems: 'center', justifyContent: 'center' } }, [
      el('div', { class: 'panel', style: { width: '520px', textAlign: 'center' } }, [
        el('div', { class: `result-banner ${result.outcome}` }, result.outcome.toUpperCase()),
        el('p', { class: 'dim' }, result.reason),
        el('p', {}, `Duration ${fmtTime(result.duration)} · Allied losses ${result.sides[result.perspectiveSide].destroyed}/${result.sides[result.perspectiveSide].deployed} · Enemy losses ${result.sides[result.perspectiveSide === 'A' ? 'B' : 'A'].destroyed}/${result.sides[result.perspectiveSide === 'A' ? 'B' : 'A'].deployed}`),
        el('div', { class: 'row', style: { justifyContent: 'center' } }, [
          el('button', { class: 'btn primary', 'data-action': 'results', onclick: () => app.finishBattle(comparison, comparisonSide) }, 'Battle results'),
          el('button', { class: 'btn', onclick: () => banner.remove() }, 'Keep watching'),
        ]),
      ]),
    ]);
    root.append(banner);
  };

  refresh();
  return {
    root,
    refresh,
    tick,
    toast,
    showEnd,
    toggleMenu,
    setComparison: (r, side) => {
      comparison = r;
      comparisonSide = side;
    },
  };
}
