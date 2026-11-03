import type { App } from '../app';
import { el, fmtNum, setChildren } from '../dom';
import { getShipClass } from '@/data/ships';
import { CIVILIZATION_ORIGINS, CIVILIZATION_POLICIES, advanceCivilization, buildCivilizationShips, civilizationFleet, civilizationFleetPoints, enactPolicy, normalizeCivilizationState, researchCivilization } from '@/civilization/engine';
import type { CivilizationAction, CivilizationDoctrine, CivilizationEthics, CivilizationGovernment, CivilizationInput, CivilizationOrigin, CivilizationPolicy } from '@/civilization/types';

export function renderCivilization(app: App, params?: { found?: boolean; origin?: CivilizationOrigin }): HTMLElement {
  let founding = !!params?.found || !app.civilization;
  const input: CivilizationInput = { seed: 42, name: '', origin: params?.origin ?? 'modern', ethics: 'cooperative', government: 'council', doctrine: 'kinetic', startingBudget: 3600 };
  let encounter: 'patrol' | 'harvest' | 'invasion' | 'skynet' = 'harvest';
  const body = el('div', { class: 'screen-body' });
  const costText = (cost: { industry?: number; research?: number; influence?: number }) => Object.entries(cost).map(([k, v]) => `${v} ${k}`).join(' · ') || 'No resource cost';
  const select = (label: string, value: string, options: Record<string, string>, change: (v: string) => void, action: string) => el('label', { class: 'field' }, [label,
    el('select', { 'data-action': action, onchange: (e: Event) => change((e.target as HTMLSelectElement).value) }, Object.entries(options).map(([id, name]) => el('option', { value: id, selected: value === id }, name))),
  ]);
  const act = (action: () => CivilizationAction) => {
    const result = action(); if (!result.ok) app.toast(result.reason ?? 'ACTION UNAVAILABLE');
    void app.saveCivilization(); render();
  };
  const exportState = () => {
    if (!app.civilization) return;
    const url = URL.createObjectURL(new Blob([JSON.stringify(app.civilization, null, 2)], { type: 'application/json' }));
    const a = document.createElement('a'); a.href = url; a.download = `${app.civilization.id}.json`; a.click(); window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  const render = () => {
    const state = app.civilization;
    if (founding || !state) {
      setChildren(body,
        el('p', {}, 'Found a player civilization or generate an original past-cycle society. The seed controls its starting identity and fleet allocation; your origin, politics and doctrine affect real resources and ship statistics. All values and history are AU estimates.'),
        el('div', { class: 'grid2' }, [
          el('div', { class: 'panel orange' }, [
            el('div', { class: 'panel-title' }, 'FOUNDING CHARTER'),
            el('label', { class: 'field' }, ['Civilization name (blank generates one)', el('input', { type: 'text', maxlength: 80, 'data-action': 'civ-name', value: input.name, onchange: (e: Event) => input.name = (e.target as HTMLInputElement).value })]),
            el('label', { class: 'field' }, ['Seed', el('input', { type: 'number', min: 0, max: 4294967295, 'data-action': 'civ-seed', value: input.seed, onchange: (e: Event) => input.seed = Number((e.target as HTMLInputElement).value) })]),
            select('Origin', input.origin!, CIVILIZATION_ORIGINS, v => input.origin = v as CivilizationOrigin, 'civ-origin'),
            select('Government', input.government!, { council: 'Representative council', directorate: 'Strategic directorate', collective: 'Collective administration' }, v => input.government = v as CivilizationGovernment, 'civ-government'),
            select('Ethics', input.ethics!, { cooperative: 'Cooperative', militarist: 'Militarist', supremacist: 'Supremacist', machine: 'Machine civilization' }, v => input.ethics = v as CivilizationEthics, 'civ-ethics'),
            select('Fleet doctrine', input.doctrine!, { kinetic: 'Kinetic firepower', energy: 'Energy and shields', armour: 'Armoured endurance' }, v => input.doctrine = v as CivilizationDoctrine, 'civ-doctrine'),
            el('label', { class: 'field' }, ['Starting frame budget', el('input', { type: 'number', min: 1000, max: 25000, step: 100, 'data-action': 'civ-budget', value: input.startingBudget, onchange: (e: Event) => input.startingBudget = Number((e.target as HTMLInputElement).value) })]),
            el('button', { class: 'btn primary', 'data-action': 'found-civilization', disabled: !!state?.pendingBattle, onclick: () => { app.foundCivilization(input); founding = false; render(); } }, 'Ratify charter & assemble fleet →'),
          ]),
          el('div', { class: 'panel' }, [el('h2', {}, 'A faction with consequences'), el('p', {}, 'Industry builds physical hulls. Research improves their armament and protection. Stability, legitimacy and diplomatic cooperation affect fleet effectiveness. Monthly political choices compete for the same resources.'), el('p', { class: 'dim' }, 'This compact civilization layer does not include a full Stellaris galaxy map. Past cycles are original societies using estimated frames and seeded technology; they are not claims about unnamed canon civilizations.'), state ? el('button', { class: 'btn', onclick: () => { founding = false; render(); } }, 'Return to active civilization') : null]),
        ]),
      );
      return;
    }
    const fleet = civilizationFleet(state), locked = !!state.pendingBattle;
    const hulls = Object.values(state.fleetCounts).reduce((a, b) => a + b, 0);
    const stat = (label: string, value: string | number, action: string) => el('div', { class: 'stat' }, [el('b', {}, label), el('span', { class: 'mono', 'data-action': action }, String(value))]);
    setChildren(body,
      el('div', { class: 'row', style: { flexWrap: 'wrap', marginBottom: '16px' } }, [el('h2', { 'data-action': 'civilization-name' }, state.name), el('span', { class: 'badge au' }, 'AU'), el('span', { class: 'dim' }, `${CIVILIZATION_ORIGINS[state.origin]} · ${state.government} · ${state.ethics} · seed ${state.seed}`)]),
      el('div', { class: 'grid3' }, [
        el('div', { class: 'panel' }, [
          el('div', { class: 'panel-title' }, 'CIVILIZATION'),
          stat('Month', state.turn, 'civ-turn'), stat('Industry', fmtNum(state.industry), 'civ-industry'), stat('Research', fmtNum(state.research), 'civ-research'), stat('Influence', fmtNum(state.influence), 'civ-influence'),
          stat('Stability', `${state.stability.toFixed(1)}%`, 'civ-stability'), stat('Legitimacy', `${state.legitimacy.toFixed(1)}%`, 'civ-legitimacy'), stat('Cooperation', `${(state.cooperation * 100).toFixed(1)}%`, 'civ-cooperation'), stat('Technology', `Tier ${state.technologyLevel}`, 'civ-tech'),
          el('button', { class: 'btn primary', 'data-action': 'civ-advance', disabled: locked || !!state.decisionPending, style: { marginTop: '14px' }, onclick: () => act(() => advanceCivilization(state)) }, 'Advance one month'),
          el('button', { class: 'btn', 'data-action': 'civ-research-upgrade', disabled: locked || state.technologyLevel >= 6, onclick: () => act(() => researchCivilization(state)) }, `Research next tier (${180 * (state.technologyLevel + 1)} research, 100 industry, 8 influence)`),
        ]),
        el('div', { class: 'panel orange' }, [
          el('div', { class: 'panel-title' }, 'POLITICS & DOCTRINE'),
          select('Development policy (15 influence to change)', state.policy, Object.fromEntries(Object.entries(CIVILIZATION_POLICIES).map(([id, p]) => [id, p.label])), v => act(() => enactPolicy(state, v as CivilizationPolicy)), 'civ-policy'),
          el('p', {}, CIVILIZATION_POLICIES[state.policy].description),
          el('div', { class: 'mono dim', 'data-action': 'civ-effective-tech', style: { fontSize: '11px' } }, `Actual fleet: kinetic ×${fleet.techOverride.massAcceleratorDamage?.toFixed(2)} · armour ×${fleet.techOverride.armourStrength?.toFixed(2)} · barriers ×${fleet.techOverride.kineticBarrierStrength?.toFixed(2)} · crew ×${fleet.techOverride.crewQuality?.toFixed(2)}`),
          state.decisionPending ? el('div', { 'data-action': 'civ-decision', style: { marginTop: '18px' } }, [
            el('h3', {}, state.decisionPending.title), el('p', {}, state.decisionPending.text),
            ...state.decisionPending.choices.map(c => el('div', { class: 'entry-block' }, [el('p', {}, c.description), el('button', { class: 'btn', 'data-choice': c.id, disabled: locked, title: costText(c.cost), onclick: () => act(() => enactPolicy(state, c.id)) }, `${c.label} (${costText(c.cost)})`)])),
          ]) : el('p', { class: 'dim' }, 'Political decisions arrive every three months. War economy trades stability for construction; coalition policy improves cooperation and research.'),
        ]),
        el('div', { class: 'panel' }, [
          el('div', { class: 'panel-title' }, 'FLEET & SHIPYARDS'),
          stat('Fleet inventory', `${hulls} ships`, 'civ-hulls'), stat('Frame points', fmtNum(civilizationFleetPoints(state)), 'civ-power'),
          ...Object.entries(state.fleetCounts).map(([id, count]) => el('div', { class: 'entry-block' }, [el('b', {}, `${count} × ${getShipClass(id).name}`), el('div', { class: 'dim' }, `${getShipClass(id).pointValue} industry per hull`), el('button', { class: 'btn small', 'data-build-class': id, disabled: locked, onclick: () => act(() => buildCivilizationShips(state, id, 1)) }, 'Construct one ship')])),
          select('Encounter', encounter, { patrol: 'Reaper destroyer patrol', harvest: 'Reaper capital harvest force', invasion: 'Reaper invasion force', skynet: 'Skynet orbital machines (crossover)' }, v => encounter = v as typeof encounter, 'civ-encounter'),
          el('button', { class: 'btn primary', 'data-action': 'civ-deploy', disabled: hulls === 0, onclick: () => app.startCivilizationBattle(encounter) }, locked ? 'Restart pending engagement (same seed)' : 'Deploy this fleet →'),
          locked ? el('div', {}, [el('p', { class: 'dim' }, 'Strategic changes are locked while a battle is pending. Finish it and view results to apply casualties, or cancel the deployment. Restarting replays its initial forces, not a saved mid-battle frame.'), el('button', { class: 'btn small', 'data-action': 'civ-cancel-battle', onclick: () => { app.cancelCivilizationDeployment(); render(); } }, 'Cancel pending deployment')]) : null,
        ]),
      ]),
      el('div', { class: 'panel', style: { marginTop: '20px' } }, [el('div', { class: 'panel-title' }, 'CIVILIZATION RECORD'), ...state.events.slice(-12).reverse().map(e => el('div', { class: 'mono dim', style: { fontSize: '12px', padding: '4px 0' } }, `Month ${e.turn}: ${e.text}`))]),
      el('div', { class: 'row', style: { marginTop: '18px', flexWrap: 'wrap' } }, [
        el('button', { class: 'btn', 'data-action': 'civ-export', onclick: exportState }, 'Export civilization JSON'),
        el('button', { class: 'btn', disabled: locked, onclick: () => { founding = true; render(); } }, 'Found another civilization'),
        app.civilizationBackup ? el('button', { class: 'btn', disabled: locked, onclick: () => app.restoreCivilizationBackup() }, 'Restore previous civilization') : null,
      ]),
    );
  };
  render();
  const importState = () => {
    const input = document.createElement('input'); input.type = 'file'; input.accept = 'application/json';
    input.onchange = async () => {
      try { const file = input.files?.[0]; if (!file) return; const state = normalizeCivilizationState(JSON.parse(await file.text())); if (!state) return app.toast('INVALID CIVILIZATION FILE'); app.adoptCivilization(state); }
      catch { app.toast('INVALID CIVILIZATION FILE'); }
    }; input.click();
  };
  return el('div', { class: 'screen' }, [el('div', { class: 'screen-header' }, [el('h1', {}, 'CIVILIZATION COMMAND'), el('span', { class: 'sub' }, 'SEEDED ORIGINS · POLITICS · PERSISTENT FLEETS')]), body,
    el('div', { class: 'screen-footer' }, [el('button', { class: 'btn', onclick: () => app.show('au_hub') }, '← AU Worlds'), el('div', { class: 'spacer' }), el('button', { class: 'btn', disabled: !!app.civilization?.pendingBattle, onclick: importState }, 'Import civilization')]),
  ]);
}
