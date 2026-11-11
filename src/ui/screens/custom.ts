import { scaleCounts } from '@/core/hardwareProfile';
import type { App } from '../app';
import { el } from '../dom';
import { buildCustomBattle, type CustomBattleInput, type CustomFaction, type CustomFleetInput } from '@/scenarios';
import { FACTIONS } from '@/data/factions';
import { SHIP_CLASS_LIST, getShipClass } from '@/data/ships';
import { CROSSOVER_FACTION_IDS, MASS_EFFECT_FACTION_IDS, SANDBOX_FACTION_IDS, isCrossoverFaction } from '@/data/types';
import { isShipAllowedInRules } from '@/timelines/lore';
import { FORMATION_LABELS, type Environment, type FormationType } from '@/simulation/types';
import { storage } from '@/core/storage';

const ENVIRONMENTS: { id: Environment; label: string }[] = [
  { id: 'earth_orbit', label: 'Earth orbit' },
  { id: 'palaven_orbit', label: 'Palaven orbit' },
  { id: 'thessia_orbit', label: 'Thessia orbit' },
  { id: 'rannoch_orbit', label: 'Rannoch orbit' },
  { id: 'surkesh_orbit', label: 'Sur’Kesh orbit' },
  { id: 'citadel', label: 'The Citadel' },
  { id: 'deep_space', label: 'Deep space' },
];

/** Default fleet compositions per faction (fixed, not scaled by timeline). */
export const FACTION_DEFAULTS: Record<CustomFaction, { name: string; formation: FormationType; counts: Record<string, number> }> = {
  alliance: { name: 'Alliance Task Force', formation: 'line_abreast', counts: { alliance_dreadnought: 8, alliance_carrier: 1, alliance_cruiser: 16, alliance_frigate: 30, alliance_frigate_thanix: 1 } },
  turian: { name: 'Hierarchy battle group', formation: 'line_abreast', counts: { turian_dreadnought: 8, turian_cruiser: 16, turian_frigate: 28 } },
  asari: { name: 'Republics fleet', formation: 'defensive_screen', counts: { destiny_ascension: 1, asari_dreadnought: 3, asari_cruiser: 14 } },
  salarian: { name: 'Union Third Fleet', formation: 'line_abreast', counts: { salarian_dreadnought: 2, salarian_cruiser: 10, salarian_frigate: 16 } },
  cerberus: { name: 'Cerberus strike fleet', formation: 'strike_wedge', counts: { cerberus_dreadnought: 0, cerberus_cruiser: 10, cerberus_frigate: 16 } },
  geth: { name: 'Geth Consensus fleet', formation: 'strike_wedge', counts: { geth_dreadnought: 1, geth_cruiser: 10, geth_frigate: 16 } },
  quarian: { name: 'Migrant Fleet', formation: 'defensive_screen', counts: { quarian_liveship: 1, quarian_heavy: 4, quarian_cruiser: 16 } },
  reaper: { name: 'Reaper harvest group', formation: 'strike_wedge', counts: { reaper_capital: 4, reaper_destroyer: 8, harbinger: 0 } },
  unsc: { name: 'UNSC battle group', formation: 'line_abreast', counts: { unsc_marathon: 6, unsc_infinity: 1 } },
  covenant: { name: 'Covenant battle group', formation: 'strike_wedge', counts: { covenant_ccs: 4, covenant_cas: 1 } },
  imperium: { name: 'Imperial Navy battlegroup', formation: 'line_abreast', counts: { imperium_lunar: 3, imperium_retribution: 1 } },
  chaos: { name: 'Chaos war fleet', formation: 'strike_wedge', counts: { chaos_murder: 3, chaos_desolator: 1 } },
  skynet: { name: 'Skynet orbital network', formation: 'strike_wedge', counts: { skynet_hunter: 8, skynet_harvester: 1 } },
  prothean: { name: 'Prothean imperial fleet', formation: 'defensive_screen', counts: { prothean_cruiser: 6, prothean_dreadnought: 2 } },
  past_cycle: { name: 'Past-cycle expedition', formation: 'defensive_screen', counts: { past_cycle_cruiser: 6, past_cycle_dreadnought: 2 } },
  player_civ: { name: 'Player civilization fleet', formation: 'line_abreast', counts: { player_civ_cruiser: 6, player_civ_dreadnought: 2 } },
  axiom_guard: { name: 'Axiom protective fleet', formation: 'defensive_screen', counts: { axiom_ancient: 1, axiom_warden: 12 } },
  exile_hegemony: { name: 'Exile Hegemony reclamation fleet', formation: 'strike_wedge', counts: { exile_ark: 3, exile_raider: 18 } },
  terminus_compact: { name: 'Terminus Compact battle group', formation: 'defensive_screen', counts: { compact_siege: 6, compact_gunship: 36 } },
};
const CUSTOM_FACTIONS: CustomFaction[] = [...MASS_EFFECT_FACTION_IDS, ...SANDBOX_FACTION_IDS, ...CROSSOVER_FACTION_IDS];

/** Above this many hulls on one side the briefing warns about performance; there is no cap. */
const PERF_WARN_HULLS = 150;

const DEFAULT_INPUT: CustomBattleInput = {
  seed: 42,
  rulesId: 'canon_me3',
  rosterMode: 'mass_effect',
  environment: 'deep_space',
  theatreLayout: 'three_dimensional',
  startingDistanceKm: 76,
  sideA: { faction: 'alliance', name: 'Alliance Task Force', formation: 'line_abreast', counts: { alliance_dreadnought: 8, alliance_carrier: 1, alliance_cruiser: 16, alliance_frigate: 30, alliance_frigate_thanix: 1 } },
  sideB: { faction: 'reaper', name: 'Reaper harvest group', formation: 'strike_wedge', counts: { reaper_capital: 4, reaper_destroyer: 8, harbinger: 0 } },
  extraA: [],
  extraB: [],
  reinforcementTime: 0,
  reinforcementFaction: 'reaper',
  reinforcementCounts: {},
  maxDuration: 420,
};

const newFleet = (fac: CustomFaction): CustomFleetInput => ({ faction: fac, name: FACTION_DEFAULTS[fac].name, formation: FACTION_DEFAULTS[fac].formation, counts: { ...FACTION_DEFAULTS[fac].counts }, arrivalTime: 0 });

export function renderCustom(app: App, params?: { template?: CustomBattleInput }): HTMLElement {
  let input: CustomBattleInput = JSON.parse(JSON.stringify(params?.template ?? DEFAULT_INPUT));
  let rosterNotice = '';
  if (!params?.template) input.rulesId = app.prefs.lastTimelineId;
  if (!params?.template) void storage.get<CustomBattleInput | undefined>('customBattle', undefined).then((saved) => {
    if (saved && saved.sideA && saved.sideB) {
      const copy: CustomBattleInput = JSON.parse(JSON.stringify(saved));
      input = { ...DEFAULT_INPUT, ...copy, sideA: { ...DEFAULT_INPUT.sideA, ...copy.sideA }, sideB: { ...DEFAULT_INPUT.sideB, ...copy.sideB }, extraA: copy.extraA ?? [], extraB: copy.extraB ?? [] };
      // Older saves carried a Reaper-keyed reinforcement roster regardless of side B's faction.
      if (!saved.reinforcementFaction) input.reinforcementFaction = input.sideB.faction;
      if (!saved.rosterMode) input.rosterMode = hasCrossoverFleet() ? 'multiverse' : 'mass_effect';
      render();
    }
  });

  const body = el('div', { class: 'screen-body' });
  const currentRules = () => app.getTimeline(input.rulesId);
  const allowedFactions = (): CustomFaction[] => currentRules().category === 'canon' || currentRules().strictLore ? [...MASS_EFFECT_FACTION_IDS]
    : input.rosterMode === 'multiverse' ? CUSTOM_FACTIONS : CUSTOM_FACTIONS.filter(faction => !isCrossoverFaction(faction));
  const allowedClass = (id: string, faction: CustomFaction) => {
    const cls = SHIP_CLASS_LIST.find(c => c.id === id && c.faction === faction);
    return cls && isShipAllowedInRules(cls, currentRules()) ? cls : undefined;
  };
  const hasCrossoverFleet = () => [input.sideA, input.sideB, ...(input.extraA ?? []), ...(input.extraB ?? [])]
    .some(f => isCrossoverFaction(f.faction)) || isCrossoverFaction(input.reinforcementFaction ?? input.sideB.faction);
  const normaliseRoster = () => {
    const rules = currentRules();
    input.rulesId = rules.id;
    input.rosterMode ??= hasCrossoverFleet() ? 'multiverse' : 'mass_effect';
    if (rules.strictLore) input.rosterMode = 'mass_effect';
    else if (input.rosterMode === 'multiverse' && rules.category === 'canon') input.rulesId = 'multiverse_crossover';
    const permitted = new Set(allowedFactions());
    let removedHulls = 0, removedFleets = 0;
    const count = (counts: Record<string, number>) => Object.values(counts).reduce((sum, n) => sum + Math.max(0, Number(n) || 0), 0);
    const cleanCounts = (counts: Record<string, number>, faction: CustomFaction) => {
      const clean: Record<string, number> = {};
      for (const [id, raw] of Object.entries(counts ?? {})) {
        const n = Math.max(0, Math.floor(Number(raw) || 0));
        if (allowedClass(id, faction)) clean[id] = n;
        else removedHulls += n;
      }
      return clean;
    };
    const cleanMain = (f: CustomFleetInput, fallback: CustomFaction) => {
      if (!permitted.has(f.faction)) {
        removedHulls += count(f.counts); removedFleets++;
        f.faction = fallback; f.name = FACTION_DEFAULTS[fallback].name; f.counts = {};
      } else f.counts = cleanCounts(f.counts, f.faction);
    };
    cleanMain(input.sideA, 'alliance'); cleanMain(input.sideB, 'reaper');
    for (const side of ['extraA', 'extraB'] as const) input[side] = (input[side] ?? []).filter(f => {
      if (!permitted.has(f.faction)) { removedHulls += count(f.counts); removedFleets++; return false; }
      f.counts = cleanCounts(f.counts, f.faction); return true;
    });
    const reinforcementFaction = input.reinforcementFaction ?? input.sideB.faction;
    if (!permitted.has(reinforcementFaction)) {
      removedHulls += count(input.reinforcementCounts ?? {}); removedFleets++;
      input.reinforcementFaction = input.sideB.faction; input.reinforcementCounts = {}; input.reinforcementTime = 0;
    } else input.reinforcementCounts = cleanCounts(input.reinforcementCounts ?? {}, reinforcementFaction);
    if (removedHulls || removedFleets) rosterNotice = `${currentRules().strictLore ? 'Strict lore' : 'Mass Effect roster'} removed ${removedHulls} excluded hull${removedHulls === 1 ? '' : 's'}${removedFleets ? ` from ${removedFleets} crossover fleet${removedFleets === 1 ? '' : 's'}` : ''}. Any empty side needs permitted ships before launch.`;
  };
  const points = (counts: Record<string, number>, faction: CustomFaction) => Object.entries(counts).reduce((a, [id, n]) => a + ((SHIP_CLASS_LIST.find((c) => c.id === id && c.faction === faction)?.pointValue ?? 0) * n), 0);
  const power = (value: number) => `${Math.round(value).toLocaleString()} relative power`;
  const hulls = (counts: Record<string, number>, faction: CustomFaction) => Object.entries(counts).reduce((a, [id, n]) => a + (SHIP_CLASS_LIST.some((c) => c.id === id && c.faction === faction) ? n : 0), 0);
  const sideFleets = (side: 'A' | 'B'): CustomFleetInput[] => (side === 'A' ? [input.sideA, ...(input.extraA ?? [])] : [input.sideB, ...(input.extraB ?? [])]);
  const sideHulls = (side: 'A' | 'B') => sideFleets(side).reduce((a, f) => a + hulls(f.counts, f.faction), 0);
  const sidePoints = (side: 'A' | 'B') => sideFleets(side).reduce((a, f) => a + points(f.counts, f.faction), 0);

  /** One fleet card. `key` is the data-count prefix: 'sideA'/'sideB' for the main fleets (kept for the tests), 'A2'/'B3'… for extras. */
  const fleetCard = (f: CustomFleetInput, key: string, title: string, onRemove?: () => void) => {
    const classes = SHIP_CLASS_LIST.filter((c) => c.faction === f.faction && c.role !== 'fighter' && isShipAllowedInRules(c, currentRules()));
    return el('div', { class: 'entry-block', 'data-fleet-card': key }, [
      el('div', { class: 'row', style: { justifyContent: 'space-between' } }, [el('b', {}, title), el('span', { class: 'mono dim', 'data-power': key }, `${hulls(f.counts, f.faction)} hulls · ${power(points(f.counts, f.faction))}`)]),
      el('div', { class: 'row' }, [
        el('label', { class: 'field', style: { flex: '1' } }, ['Faction', el('select', { 'data-faction': key, onchange: (e: Event) => {
          const fac = (e.target as HTMLSelectElement).value as CustomFaction;
          f.faction = fac;
          f.counts = { ...FACTION_DEFAULTS[fac].counts };
          f.name = FACTION_DEFAULTS[fac].name;
          f.formation = FACTION_DEFAULTS[fac].formation;
          render();
        } }, allowedFactions().map((fac) => el('option', { value: fac, selected: f.faction === fac }, FACTIONS[fac].name)))]),
        el('label', { class: 'field', style: { flex: '1' } }, ['Formation', el('select', { onchange: (e: Event) => (f.formation = (e.target as HTMLSelectElement).value as FormationType) }, (Object.keys(FORMATION_LABELS) as FormationType[]).map((k) => el('option', { value: k, selected: f.formation === k }, FORMATION_LABELS[k])))]),
      ]),
      el('div', { class: 'row' }, [
        el('label', { class: 'field', style: { flex: '2' } }, ['Fleet name', el('input', { type: 'text', value: f.name, onchange: (e: Event) => (f.name = (e.target as HTMLInputElement).value) })]),
        el('label', { class: 'field', style: { flex: '1' } }, ['Arrives at (s)', el('input', { type: 'number', min: 0, value: f.arrivalTime ?? 0, 'data-arrival': key, onchange: (e: Event) => (f.arrivalTime = Math.max(0, Number((e.target as HTMLInputElement).value) || 0)) })]),
      ]),
      el('table', {}, [
        el('tbody', {}, classes.map((c) => el('tr', {}, [
          el('td', {}, [c.name, el('div', { class: 'dim', style: { fontSize: '10px' } }, `${power(c.pointValue)} each${c.designProvenance.provenance === 'AU_MODIFIED' || isCrossoverFaction(c.faction) ? ' · AU estimate' : ' · simulation estimate'}`)]),
          el('td', { class: 'num', style: { width: '110px' } }, el('input', { type: 'number', min: 0, value: f.counts[c.id] ?? 0, 'data-count': `${key}:${c.id}`, style: { width: '80px' }, onchange: (e: Event) => {
            f.counts[c.id] = Math.max(0, Math.floor(Number((e.target as HTMLInputElement).value) || 0));
            render();
          } })),
        ]))),
      ]),
      onRemove ? el('button', { class: 'btn small danger', 'data-action': `remove-${key}`, onclick: onRemove }, 'Remove fleet') : null,
    ]);
  };

  const sideEditor = (side: 'A' | 'B', title: string, cls: string) => {
    const main = side === 'A' ? input.sideA : input.sideB;
    const extras = side === 'A' ? (input.extraA ??= []) : (input.extraB ??= []);
    const n = sideHulls(side);
    return el('div', { class: `panel ${cls}` }, [
      el('div', { class: 'panel-title' }, [title, el('span', { class: 'mono', 'data-power': side }, `${n} hulls · ${power(sidePoints(side))}`)]),
      n > PERF_WARN_HULLS ? el('div', { class: 'dim', style: { color: 'var(--orange)', fontSize: '11px', marginBottom: '6px' } }, `${n} hulls on one side: no cap applies, but very large battles run slower on modest machines (lower graphics quality in Settings if needed).`) : null,
      fleetCard(main, side === 'A' ? 'sideA' : 'sideB', `${main.name} (main fleet)`),
      ...extras.map((f, i) => fleetCard(f, `${side}${i + 2}`, `${f.name} (allied fleet ${i + 1})`, () => {
        extras.splice(i, 1);
        render();
      })),
      el('div', { class: 'row' }, [
        el('button', { class: 'btn small', 'data-action': `add-fleet-${side}`, onclick: () => {
          const used = new Set(sideFleets(side).map((f) => f.faction));
          const next = allowedFactions().find((fac) => !used.has(fac) && fac !== 'reaper') ?? 'alliance';
          extras.push(newFleet(next));
          render();
        } }, '+ Add a fleet of another faction'),
        el('small', { class: 'dim' }, 'United fleets: every faction can fight on either side; allied fleets form up beside the main fleet.'),
      ]),
    ]);
  };

  const render = () => {
    normaliseRoster();
    const rf = input.reinforcementFaction ?? input.sideB.faction;
    body.replaceChildren(
      ...(rosterNotice ? [el('p', { class: 'dim', role: 'status', 'data-action': 'roster-exclusions', style: { color: 'var(--orange)' } }, rosterNotice)] : []),
      el('div', { class: 'grid3' }, [
        sideEditor('A', 'SIDE A — PLAYER', ''),
        sideEditor('B', 'SIDE B — OPPONENT', 'red'),
        el('div', { class: 'col' }, [
          el('div', { class: 'panel orange' }, [
            el('div', { class: 'panel-title' }, 'CONDITIONS'),
            el('label', { class: 'field' }, ['Faction roster', el('select', { 'data-action': 'roster-mode', onchange: (e: Event) => {
              input.rosterMode = (e.target as HTMLSelectElement).value as 'mass_effect' | 'multiverse';
              if (input.rosterMode === 'multiverse' && (currentRules().category === 'canon' || currentRules().strictLore)) input.rulesId = 'multiverse_crossover';
              rosterNotice = ''; render();
            } }, [el('option', { value: 'mass_effect', selected: input.rosterMode !== 'multiverse' }, 'Mass Effect factions'), el('option', { value: 'multiverse', selected: input.rosterMode === 'multiverse' }, 'Multiverse crossover (AU)')])]),
            el('label', { class: 'field' }, ['Technology / timeline', el('select', { 'data-action': 'custom-timeline', onchange: (e: Event) => {
              input.rulesId = (e.target as HTMLSelectElement).value;
              if (currentRules().category === 'canon' || currentRules().strictLore) input.rosterMode = 'mass_effect';
              rosterNotice = ''; render();
            } }, app.allTimelines().map((t) => el('option', { value: t.id, selected: input.rulesId === t.id }, t.name)))]),
            input.rosterMode === 'multiverse' ? el('p', { class: 'dim', 'data-action': 'crossover-estimate-note', style: { fontSize: '11px' } }, 'Crossover ships and relative power are AU simulation estimates. Settings retain different power tiers; equal hull counts are not equal forces.') : null,
            currentRules().strictLore ? el('p', { class: 'dim', 'data-action': 'strict-roster-note', style: { fontSize: '11px' } }, 'Strict lore allows Mass Effect hulls only and excludes AU-only designs. Unknown numerical specifications remain labelled simulation estimates.') : null,
            el('label', { class: 'field' }, ['Battlefield', el('select', { onchange: (e: Event) => (input.environment = (e.target as HTMLSelectElement).value as Environment) }, ENVIRONMENTS.map((x) => el('option', { value: x.id, selected: input.environment === x.id }, x.label)))]),
            el('label', { class: 'field' }, ['Battlespace layout', el('select', { 'data-action': 'theatre-layout', onchange: (e: Event) => {
              input.theatreLayout = (e.target as HTMLSelectElement).value as 'three_dimensional' | 'legacy_plane';
            } }, [
              el('option', { value: 'three_dimensional', selected: input.theatreLayout === 'three_dimensional' }, 'OPEN 3D — MULTI-LEVEL FLEETS'),
              el('option', { value: 'legacy_plane', selected: input.theatreLayout !== 'three_dimensional' }, 'ORIGINAL — REPLAY COMPATIBLE'),
            ])]),
            el('label', { class: 'field' }, [`Starting distance: ${input.startingDistanceKm} km`, el('input', { type: 'range', 'data-action': 'starting-distance', min: 30, max: 600, step: 2, value: input.startingDistanceKm, oninput: (e: Event) => {
              input.startingDistanceKm = Number((e.target as HTMLInputElement).value);
              (e.target as HTMLElement).parentElement!.firstChild!.textContent = `Starting distance: ${input.startingDistanceKm} km`;
            } })]),
            el('label', { class: 'field' }, ['Random seed', el('input', { type: 'number', value: input.seed, onchange: (e: Event) => (input.seed = Number((e.target as HTMLInputElement).value) || 0) })]),
            el('label', { class: 'field' }, ['Time limit (s)', el('input', { type: 'number', value: input.maxDuration ?? 420, min: 60, onchange: (e: Event) => (input.maxDuration = Math.max(60, Number((e.target as HTMLInputElement).value) || 420)) })]),
          ]),
          el('div', { class: 'panel red' }, [
            el('div', { class: 'panel-title' }, 'SIDE B REINFORCEMENTS'),
            el('div', { class: 'mono dim', 'data-power': 'reinforcements' }, `${hulls(input.reinforcementCounts ?? {}, rf)} hulls · ${power(points(input.reinforcementCounts ?? {}, rf))}${input.reinforcementTime ? '' : ' · not scheduled'}`),
            el('p', { class: 'dim', style: { fontSize: '10px' } }, 'This optional wave is shown separately from the main and allied fleet totals.'),
            el('label', { class: 'field' }, ['Arrival time (s, 0 = none)', el('input', { type: 'number', 'data-action': 'reinforcement-time', value: input.reinforcementTime ?? 0, min: 0, onchange: (e: Event) => {
              input.reinforcementTime = Math.max(0, Number((e.target as HTMLInputElement).value) || 0); render();
            } })]),
            el('label', { class: 'field' }, ['Reinforcement faction', el('select', { 'data-faction': 'reinforcements', onchange: (e: Event) => {
              input.reinforcementFaction = (e.target as HTMLSelectElement).value as CustomFaction;
              input.reinforcementCounts = {};
              render();
            } }, allowedFactions().map((fac) => el('option', { value: fac, selected: rf === fac }, FACTIONS[fac].name)))]),
            ...SHIP_CLASS_LIST.filter((c) => c.faction === rf && c.role !== 'fighter' && isShipAllowedInRules(c, currentRules())).map((c) => el('label', { class: 'field' }, [c.name, el('input', { type: 'number', min: 0, value: input.reinforcementCounts?.[c.id] ?? 0, 'data-count': `reinforcements:${c.id}`, onchange: (e: Event) => {
              input.reinforcementCounts = { ...(input.reinforcementCounts ?? {}), [c.id]: Math.max(0, Math.floor(Number((e.target as HTMLInputElement).value) || 0)) };
              render();
            } })])),
          ]),
          el('div', { class: 'panel' }, [
            el('div', { class: 'panel-title' }, 'PRESETS'),
            el('div', { class: 'col' }, [
              ...([['unsc', 'covenant', 'UNSC vs Covenant (Halo crossover, AU)'], ['imperium', 'chaos', 'Imperium vs Chaos (Warhammer 40,000 crossover, AU)']] as const).map(([a, b, label]) => el('button', { class: 'btn small', 'data-action': `preset-${a}-${b}`, onclick: () => {
                input.rosterMode = 'multiverse'; input.rulesId = 'multiverse_crossover';
                input.sideA = newFleet(a); input.sideB = newFleet(b); input.extraA = []; input.extraB = [];
                input.reinforcementFaction = b; input.reinforcementCounts = {}; input.reinforcementTime = 0;
                input.environment = 'deep_space'; input.startingDistanceKm = 120;
                rosterNotice = ''; render();
              } }, label)),
              el('button', { class: 'btn small', onclick: () => {
                input = JSON.parse(JSON.stringify(DEFAULT_INPUT));
                rosterNotice = '';
                render();
              } }, 'Reference engagement (8 DN / 16 CA / 30 FF vs 4 capitals / 8 destroyers)'),
              el('button', { class: 'btn small', onclick: () => {
                input.sideA = newFleet('alliance');
                input.sideA.counts = { alliance_dreadnought: 2, alliance_carrier: 0, alliance_cruiser: 6, alliance_frigate: 12, alliance_frigate_thanix: 1 };
                input.extraA = [];
                input.sideB = newFleet('reaper');
                input.sideB.counts = { reaper_capital: 0, reaper_destroyer: 4, harbinger: 0 };
                input.extraB = [];
                render();
              } }, 'Destroyer hunt (small engagement)'),
              // Bigger or smaller battles in one click: every fleet on both sides, reinforcements included.
              ...([[0.5, 'Halve fleets'], [2, 'Double fleets'], [4, 'Fleets ×4']] as const).map(([factor, label]) => el('button', { class: 'btn small', 'data-action': `scale-fleets-${factor}`, onclick: () => {
                for (const fleet of [input.sideA, input.sideB, ...(input.extraA ?? []), ...(input.extraB ?? [])]) fleet.counts = scaleCounts(fleet.counts, factor);
                if (input.reinforcementCounts) input.reinforcementCounts = scaleCounts(input.reinforcementCounts, factor);
                render();
              } }, label)),
              el('button', { class: 'btn small', 'data-action': 'preset-sword', onclick: () => {
                input.sideA = { faction: 'alliance', name: 'Sword Fleet (Alliance)', formation: 'line_abreast', counts: { alliance_dreadnought: 6, alliance_carrier: 2, alliance_cruiser: 16, alliance_frigate: 24, alliance_frigate_thanix: 1 }, arrivalTime: 0 };
                input.extraA = [
                  { faction: 'turian', name: 'Sword Fleet (Hierarchy)', formation: 'line_abreast', counts: { turian_dreadnought: 5, turian_cruiser: 10, turian_frigate: 16 }, arrivalTime: 0 },
                  { faction: 'asari', name: 'Sword Fleet (Republics)', formation: 'defensive_screen', counts: { destiny_ascension: 1, asari_dreadnought: 2, asari_cruiser: 8 }, arrivalTime: 0 },
                  { faction: 'salarian', name: 'Salarian First Fleet', formation: 'line_abreast', counts: { salarian_dreadnought: 2, salarian_cruiser: 8, salarian_frigate: 12 }, arrivalTime: 0 },
                  { faction: 'quarian', name: 'Migrant Fleet detachment', formation: 'defensive_screen', counts: { quarian_heavy: 3, quarian_cruiser: 10 }, arrivalTime: 0 },
                  { faction: 'geth', name: 'Geth fleet', formation: 'strike_wedge', counts: { geth_dreadnought: 1, geth_cruiser: 8, geth_frigate: 12 }, arrivalTime: 0 },
                ];
                input.sideB = { faction: 'reaper', name: 'Reaper blockade', formation: 'strike_wedge', counts: { reaper_capital: 6, reaper_destroyer: 14, harbinger: 1 }, arrivalTime: 0 };
                input.extraB = [{ faction: 'cerberus', name: 'Cerberus strike group', formation: 'strike_wedge', counts: { cerberus_cruiser: 6, cerberus_frigate: 10 }, arrivalTime: 45 }];
                input.reinforcementFaction = 'reaper';
                input.reinforcementCounts = { reaper_capital: 3, reaper_destroyer: 8 };
                input.reinforcementTime = 90;
                input.environment = 'earth_orbit';
                render();
              } }, 'Sword Fleet at Earth (united fleets vs Harbinger + Cerberus)'),
              el('button', { class: 'btn small', onclick: () => {
                input.sideA = newFleet('alliance');
                input.sideA.counts = { alliance_dreadnought: 12, alliance_carrier: 2, alliance_cruiser: 24, alliance_frigate: 40, alliance_frigate_thanix: 1 };
                input.extraA = [];
                input.sideB = newFleet('reaper');
                input.sideB.counts = { reaper_capital: 5, reaper_destroyer: 10, harbinger: 1 };
                input.extraB = [];
                render();
              } }, 'Harbinger at Earth (large engagement)'),
            ]),
          ]),
        ]),
      ]),
    );
  };
  render();

  return el('div', { class: 'screen' }, [
    el('div', { class: 'screen-header' }, [el('h1', {}, 'CUSTOM BATTLE'), el('span', { class: 'sub' }, 'SCENARIO BUILDER · UNITED FLEETS · NO HULL CAP')]),
    body,
    el('div', { class: 'screen-footer' }, [
      el('button', { class: 'btn', onclick: () => app.show('menu') }, '← Main menu'),
      el('div', { class: 'spacer' }),
      el('button', { class: 'btn', 'data-action': 'save-custom', onclick: () => {
        normaliseRoster();
        void storage.set('customBattle', JSON.parse(JSON.stringify(input)) as CustomBattleInput);
        app.toast('CUSTOM BATTLE SAVED');
      } }, 'Save setup'),
      el('button', { class: 'btn primary', 'data-action': 'launch-custom', onclick: () => {
        normaliseRoster();
        if (sideHulls('A') === 0 || sideHulls('B') === 0) return app.toast('BOTH SIDES NEED AT LEAST ONE SHIP');
        void storage.set('customBattle', JSON.parse(JSON.stringify(input)) as CustomBattleInput);
        app.selectTimeline(input.rulesId);
        app.startBattle(buildCustomBattle(input, app.getTimeline(input.rulesId)));
      } }, 'Launch →'),
    ]),
  ]);
}

export { getShipClass };
