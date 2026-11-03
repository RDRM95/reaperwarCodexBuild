import type { App } from '../app';
import { el } from '../dom';
import { FACTION_DEFAULTS } from './custom';
import { isCrossoverFaction, type FactionId } from '@/data/types';
import type { CustomBattleInput } from '@/scenarios';
import { techFor, type RuleSet } from '@/timelines/rules';

export function auBattleTemplate(rules: RuleSet, faction: FactionId = rules.preferredFaction ?? 'alliance'): CustomBattleInput {
  const fleet = FACTION_DEFAULTS[faction];
  return {
    seed: 42, rulesId: rules.id, rosterMode: isCrossoverFaction(faction) ? 'multiverse' : 'mass_effect',
    environment: 'deep_space', startingDistanceKm: 90, maxDuration: 420,
    sideA: { faction, name: rules.family === 'human_au' || rules.family === 'hfy' ? rules.name : fleet.name, formation: fleet.formation, counts: { ...fleet.counts } },
    sideB: { faction: 'reaper', name: 'Reaper harvest force', formation: 'strike_wedge', counts: { reaper_capital: 4, reaper_destroyer: 8 } },
    extraA: rules.id === 'aligned_humanity' ? [{ faction: 'cerberus', name: 'Concordant Earth intelligence fleet', formation: 'strike_wedge', counts: { cerberus_cruiser: 6, cerberus_frigate: 8 } }] : [],
    extraB: [], reinforcementTime: 0, reinforcementCounts: {}, reinforcementFaction: 'reaper',
  };
}

export function renderAuHub(app: App): HTMLElement {
  const rules = app.allTimelines().filter(r => r.category !== 'canon');
  const openFleet = (r: RuleSet, faction?: FactionId) => {
    app.selectTimeline(r.id); app.show('custom', { template: auBattleTemplate(r, faction) });
  };
  const card = (r: RuleSet) => {
    const t = techFor(r, r.preferredFaction ?? 'alliance');
    return el('article', { class: 'panel', 'data-au-profile': r.id }, [
      el('div', { class: 'panel-title' }, [r.name, el('span', { class: `badge ${r.family === 'hfy' ? 'au' : 'estimate'}` }, r.family === 'hfy' ? 'HFY' : 'AU')]),
      el('p', { class: 'dim' }, r.tagline), el('p', {}, r.description),
      el('div', { class: 'mono dim', style: { fontSize: '11px' } }, `Kinetic ×${t.massAcceleratorDamage.toFixed(2)} · armour ×${t.armourStrength.toFixed(2)} · barriers ×${t.kineticBarrierStrength.toFixed(2)} · coordination ${(r.strategic.alliedCoordination * 100).toFixed(0)}%`),
      el('details', { style: { marginTop: '10px' } }, [el('summary', {}, 'Branch history and mechanics'), el('ul', {}, r.historyChanges.map(h => el('li', {}, h)))]),
      el('div', { class: 'row', style: { marginTop: '12px', flexWrap: 'wrap' } }, [
        el('button', { class: 'btn small primary', 'data-au-action': `fleet-${r.id}`, onclick: () => openFleet(r) }, 'Build a fleet →'),
        el('button', { class: 'btn small', onclick: () => { app.selectTimeline(r.id); app.toast('AU TIMELINE SELECTED'); } }, 'Select timeline'),
        r.campaignCompatible !== false ? el('button', { class: 'btn small', 'data-au-action': `campaign-${r.id}`, onclick: () => { app.selectTimeline(r.id); app.show('campaign_setup'); } }, 'Galactic campaign') : null,
        r.id === 'past_cycles' ? el('button', { class: 'btn small', 'data-action': 'generate-past-cycle', onclick: () => app.show('civilization', { found: true, origin: 'past_cycle' }) }, 'Generate a civilization') : null,
      ]),
    ]);
  };
  const section = (title: string, note: string, entries: RuleSet[]) => el('section', { style: { marginBottom: '26px' } }, [
    el('h2', {}, title), el('p', { class: 'dim' }, note), el('div', { class: 'grid2' }, entries.map(card)),
  ]);
  return el('div', { class: 'screen' }, [
    el('div', { class: 'screen-header' }, [el('h1', {}, 'AU WORLDS & CIVILIZATIONS'), el('span', { class: 'sub' }, 'SPECULATIVE HISTORIES · ACTUAL FLEETS')]),
    el('div', { class: 'screen-body' }, [
      el('p', {}, 'Choose a different path through Mass Effect technology and history. Each branch changes actual fleet rules or strategic mechanics. Ordinary AUs retain the Reaper threat; HFY branches deliberately change that challenge. Every divergence is labelled as an AU estimate.'),
      el('div', { class: 'panel orange', style: { marginBottom: '24px' } }, [
        el('h2', {}, 'Found your own civilization'),
        el('p', {}, 'Choose an origin, ethics, government and fleet doctrine. Manage monthly resources, political decisions, research and ship construction. Deploy the inventory you built; casualties and political consequences persist when the fleet returns.'),
        el('div', { class: 'row', style: { flexWrap: 'wrap' } }, [
          el('button', { class: 'btn primary', 'data-action': 'open-civilization', onclick: () => app.show('civilization') }, app.civilization ? 'Continue civilization →' : 'Create player civilization →'),
          el('button', { class: 'btn', 'data-action': 'open-past-cycle', onclick: () => app.show('civilization', { found: true, origin: 'past_cycle' }) }, 'Seeded past-cycle generator'),
        ]),
      ]),
      section('Humanity takes another path', 'Aligned Alliance/Cerberus, First Contact victors, centuries of warning, early eezo and independent FTL.', rules.filter(r => r.category !== 'custom' && (r.family === 'human_au' || (!r.family && r.category === 'au')))),
      section('Historical alternatives', 'Original past-cycle and surviving Prothean forces use declared AU hardware. These battle sandboxes do not relabel the modern 2186 campaign.', rules.filter(r => r.family === 'historical_au')),
      section('HFY — deliberate power fantasies', 'These branches intentionally let humanity become the dominant encounter.', rules.filter(r => r.family === 'hfy')),
      section('Crossover battles', 'A shared simulator scale with unequal fleet tiers. Every cross-setting conversion is an estimate.', rules.filter(r => r.family === 'crossover')),
      el('div', { class: 'panel', style: { marginBottom: '22px' } }, [
        el('div', { class: 'panel-title' }, 'EARTHS FROM OTHER SETTINGS'),
        el('p', { class: 'dim' }, 'UNSC, Imperial Terra and a Skynet orbital extrapolation can face Reapers or any other roster. These are original stand-in hulls, not assertions that the settings share canonical physics.'),
        el('div', { class: 'row', style: { flexWrap: 'wrap' } }, (['unsc', 'imperium', 'skynet'] as const).map(f => el('button', { class: 'btn', 'data-action': `earth-${f}`, onclick: () => openFleet(app.getTimeline('multiverse_crossover'), f) }, `${f === 'unsc' ? 'UNSC Earth' : f === 'imperium' ? 'Imperial Terra' : 'Skynet Earth'} vs Reapers →`))),
      ]),
      rules.some(r => r.category === 'custom' && !r.family) ? section('Your custom timelines', 'Player-authored rules remain separate from canonical profiles.', rules.filter(r => r.category === 'custom' && !r.family)) : null,
    ]),
    el('div', { class: 'screen-footer' }, [el('button', { class: 'btn', onclick: () => app.show('menu') }, '← Main menu'), el('div', { class: 'spacer' }), el('button', { class: 'btn', onclick: () => app.show('timelines') }, 'Timeline editor')]),
  ]);
}
