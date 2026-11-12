import type { App } from '../app';
import { el } from '../dom';
import { SCENARIOS, defaultWorldState, getScenario } from '@/scenarios';
import { stageThreeDimensionalTheatre } from '@/scenarios/theatre';
import { getShipClass } from '@/data/ships';
import { resolveQuickBattle, type QuickBattleReport } from '@/simulation/quickBattle';

export function renderBriefing(app: App, params?: { scenarioId?: string }): HTMLElement {
  let scenarioId = params?.scenarioId ?? app.prefs.lastScenarioId;
  if (!SCENARIOS.some((s) => s.id === scenarioId) || scenarioId === 'custom') scenarioId = 'battle_of_earth';
  let scenario = getScenario(scenarioId);
  let timelineId = app.prefs.lastTimelineId;
  let seed = Math.floor(Math.random() * 100000);
  let worldState = defaultWorldState(scenario);
  let theatreLayout: 'three_dimensional' | 'legacy_plane' = 'three_dimensional';

  /** Campaign-linked scenarios receive the saved war's fleets through world state. */
  const campaignWorldState = (): Record<string, string> => {
    const c = app.campaign;
    if (!c) return {};
    const allied = c.fleets.filter((f) => f.allegiance === 'allied').map((f) => ({ name: f.name, faction: f.faction, counts: f.counts }));
    const reaper: Record<string, number> = {};
    for (const f of c.fleets.filter((x) => x.allegiance === 'reaper')) for (const [k, n] of Object.entries(f.counts)) reaper[k] = (reaper[k] ?? 0) + n;
    return { campaignAllied: JSON.stringify(allied), campaignReaper: JSON.stringify(reaper) };
  };
  const body = el('div', { class: 'screen-body' });
  const estimatedOutput = el('div', { class:'panel', 'data-action':'instant-battle-report',
    style: { display:'none',maxHeight:'450px',overflowY:'auto' } });
  let lastEstimate:QuickBattleReport|null=null;
  const calculate = () => {
    const rules=app.getTimeline(timelineId);
    if(rules.strictLore&&scenario.auOnly)return app.toast('CHOOSE AN AU TIMELINE FOR THIS BATTLE');
    try {
      const config=scenario.build(rules,seed,{...worldState,...campaignWorldState()});
      const result=resolveQuickBattle(config);
      lastEstimate=result;
      const rows=(side:'A'|'B')=>{
        const summary=result.battle.sides[side];
        const losses=Object.values(summary.lossesByClass)
          .sort((a,b)=>b.lost-a.lost)
          .slice(0,24)
          .map(cls=>el('tr',{},[
            el('td',{},cls.name),el('td',{class:'num'},String(cls.deployed)),
            el('td',{class:'num'},String(cls.lost)),el('td',{class:'num'},String(cls.deployed-cls.lost))
          ]));
        return el('div',{class:'panel'},[
          el('div',{class:'panel-title'},'SIDE '+side+' — '+summary.destroyed.toLocaleString('en-GB')+' LOST'),
          el('p',{},summary.survivors.toLocaleString('en-GB')+' survivors / '+summary.deployed.toLocaleString('en-GB')+' deployed'),
          el('table',{},[
            el('thead',{},el('tr',{},['Ship type','Deployed','Lost','Survived'].map(label=>el('th',{},label)))),
            el('tbody',{},losses)
          ])
        ]);
      };
      estimatedOutput.replaceChildren(
        el('div',{class:'panel-title'},'INSTANT NUMERICAL BATTLE — APPROXIMATE, NOT A SIMULATION'),
        el('h3',{},result.battle.winner==='draw'?'INCONCLUSIVE':'SIDE '+result.battle.winner+' FAVOURED'),
        el('p',{},result.shipsAnalysed.toLocaleString('en-GB')+
          ' vessels · '+Math.round(result.battle.duration)+' simulated seconds (estimate)'),
        el('div',{class:'grid2'},[rows('A'),rows('B')]),
        el('p',{class:'dim'},result.warnings.join(' ')),
        el('button',{class:'btn small','data-action':'export-instant-report',onclick:()=>{
          if(!lastEstimate)return;
          const blob=new Blob([JSON.stringify(lastEstimate,null,2)],{type:'application/json'});
          const url=URL.createObjectURL(blob);
          const link=document.createElement('a');link.href=url;link.download='reaper-war-instant-report.json';
          document.body.append(link);link.click();link.remove();URL.revokeObjectURL(url);
        }},'Export JSON')
      );
      estimatedOutput.style.display='block';
    }catch(err){app.toast('INSTANT CALCULATOR: '+String(err));}
  };
  const instantButton = el('button',{class:'btn','data-action':'instant-resolve',onclick:calculate},
    'Σ Instant battle results (no simulation)');
  const launchButton = el('button', { class: 'btn primary', 'data-action': 'launch', onclick: () => {
    const rules = app.getTimeline(timelineId);
    if (rules.strictLore && scenario.auOnly) return app.toast('CHOOSE A CANON SCENARIO FOR STRICT LORE');
    const config=stageThreeDimensionalTheatre(scenario.build(rules, seed, { ...worldState, ...campaignWorldState(), theatre_layout: theatreLayout }));
    const hullCount=config.fleets.reduce((n,f)=>n+f.ships.reduce((k,c)=>k+c.count,0),0);
    if(hullCount>12000 && !window.confirm(
      hullCount.toLocaleString('en-GB')+' real-time ships may stall this browser. Use Instant battle results instead, or continue with a very large 3D battle?'
    ))return;
    app.playUi('ui_confirm');
    app.selectTimeline(timelineId);
    app.startBattle(config);
  } }, 'Launch battle →');
  const render = () => {
    body.replaceChildren();
    const rules = app.getTimeline(timelineId);
    launchButton.disabled = !!rules.strictLore && !!scenario.auOnly;
    const config = scenario.build(rules, seed, { ...worldState, ...campaignWorldState() });
    const fleetSummary = (side: 'A' | 'B') =>
      config.fleets
        .filter((f) => f.side === side)
        .map((f) =>
          el('div', { class: 'entry-block' }, [
            el('b', {}, f.name + (f.arrivalTime ? ` (arrives by T+${f.arrivalTime}s)` : '')),
            el('div', { class: 'dim mono', style: { fontSize: '11px', marginTop: '4px' } }, f.ships.map((s) => `${s.count}× ${getShipClass(s.classId).name}`).join(' · ')),
          ]),
        );

    const scenarioList = el('div', { class: 'col' }, SCENARIOS.filter((s) => s.id !== 'custom').map((s) =>
      el('button', { class: `btn ${s.id === scenario.id ? 'active' : ''}`, disabled: !!rules.strictLore && !!s.auOnly, title: rules.strictLore && s.auOnly ? 'Alternate-history scenario: choose an AU timeline to play.' : s.subtitle, onclick: () => {
        app.playUi('ui_click');
        scenario = s;
        worldState = defaultWorldState(s);
        if (s.auOnly && s.recommendedRules.length > 0 && !s.recommendedRules.includes(timelineId)) timelineId = s.recommendedRules[0];
        render();
      } }, [s.name, s.auOnly ? el('span', { class: 'tag' }, 'AU') : null]),
    ));

    const timelineSelect = el('select', { 'data-action': 'briefing-timeline', onchange: (e: Event) => {
      timelineId = (e.target as HTMLSelectElement).value;
      render();
    } }, app.allTimelines().map((t) => el('option', { value: t.id, selected: t.id === timelineId }, `${t.name}${t.category === 'canon' ? '' : ` [${t.category.toUpperCase()}]`}`)));

    const worldStateControls = (scenario.worldState ?? []).map((o) =>
      el('label', { class: 'field' }, [
        el('span', {}, [o.label, ' ', el('span', { class: `badge ${o.kind === 'player_dependent' ? 'inferred' : o.kind === 'au' ? 'au' : 'estimate'}` }, o.kind.replace('_', ' '))]),
        el('select', { onchange: (e: Event) => {
          worldState = { ...worldState, [o.id]: (e.target as HTMLSelectElement).value };
          render();
        } }, o.choices.map((c) => el('option', { value: c.id, selected: (worldState[o.id] ?? o.default) === c.id, title: c.description }, c.label))),
        el('small', {}, o.choices.find((c) => c.id === (worldState[o.id] ?? o.default))?.description ?? ''),
      ]),
    );

    const warn = scenario.auOnly && rules.category === 'canon' ? el('p', { style: { color: 'var(--orange)' } }, 'This scenario is written for an alternate-universe timeline. It will run under canon rules, but the briefing assumes AU technology.') : null;
    const canonNote = !scenario.auOnly && rules.category !== 'canon' ? el('p', { style: { color: 'var(--orange)' } }, `ALTERNATE UNIVERSE: ${rules.name}. Results do not represent canon Mass Effect 3.`) : null;

    body.append(
      el('div', { class: 'grid3' }, [
        el('div', { class: 'panel' }, [el('div', { class: 'panel-title' }, 'SCENARIO'), scenarioList]),
        el('div', { class: 'panel' }, [
          el('div', { class: 'panel-title' }, 'BRIEFING'),
          el('h2', {}, scenario.name),
          el('div', { class: 'dim mono', style: { fontSize: '11px', marginBottom: '10px' } }, scenario.subtitle),
          el('p', {}, scenario.description),
          ...scenario.briefing.map((b) => el('p', { style: { borderLeft: '2px solid var(--line)', paddingLeft: '10px' } }, b)),
          el('p', { class: 'mono dim', style: { fontSize: '11px' } }, `OBJECTIVE: ${scenario.objective}`),
          warn,
          canonNote,
          rules.strictLore ? el('p', { class: 'dim', 'data-action': 'strict-lore-note' }, 'Strict Lore excludes AU-only hulls and refits. The Alliance main gun uses the sourced two-second base cycle; heat, damage and firing solutions can delay shots. Other rates and compressed-space physics remain simulation estimates.') : null,
          rules.strictLore && scenario.auOnly ? el('p', { style: { color: 'var(--orange)' } }, 'Choose a canon scenario or an AU timeline to launch this alternate-history battle.') : null,
        ]),
        el('div', { class: 'col' }, [
          el('div', { class: 'panel orange' }, [
            el('div', { class: 'panel-title' }, 'TIMELINE & WORLD STATE'),
            el('label', { class: 'field' }, ['Timeline', timelineSelect]),
            el('p', { class: 'dim', style: { fontSize: '12px' } }, rules.tagline),
            el('p', { class: 'dim', style: { fontSize: '11px' } }, 'Weapon cycles use simulated seconds. Multiple guns fire independently; 4× playback makes a four-second cycle appear to take one real second. Fleet Database lists individual mount cycles.'),
            el('label', { class: 'field' }, ['Battlespace layout', el('select', { 'data-action': 'briefing-theatre', onchange: (e: Event) => {
              theatreLayout = (e.target as HTMLSelectElement).value as 'three_dimensional' | 'legacy_plane';
            } }, [
              el('option', { value: 'three_dimensional', selected: theatreLayout === 'three_dimensional' }, 'OPEN 3D — FLEET APPROACHES'),
              el('option', { value: 'legacy_plane', selected: theatreLayout === 'legacy_plane' }, 'ORIGINAL — SAVED REPLAY LAYOUT'),
            ])]),
            ...worldStateControls,
            el('label', { class: 'field' }, ['Random seed', el('input', { type: 'number', value: seed, onchange: (e: Event) => {
              seed = Number((e.target as HTMLInputElement).value) || 0;
            } })]),
          ]),
          el('div', { class: 'panel' }, [el('div', { class: 'panel-title' }, 'ORDER OF BATTLE — ALLIED'), ...fleetSummary('A')]),
          el('div', { class: 'panel red' }, [el('div', { class: 'panel-title' }, 'ORDER OF BATTLE — HOSTILE'), ...fleetSummary('B')]),
        ]),
      ]),
    );
    body.append(estimatedOutput);
  };
  render();

  const footer = el('div', { class: 'screen-footer' }, [
    el('button', { class: 'btn', onclick: () => app.show('menu') }, '← Main menu'),
    el('div', { class: 'spacer' }),
    instantButton,
    launchButton,
  ]);

  return el('div', { class: 'screen' }, [
    el('div', { class: 'screen-header' }, [el('h1', {}, 'QUICK BATTLE'), el('span', { class: 'sub' }, 'MISSION BRIEFING')]),
    body,
    footer,
  ]);
}
