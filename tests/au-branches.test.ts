import { describe, expect, it } from 'vitest';
import { advanceTick, createCampaign, fleetsAt, INDEPENDENT_TRANSIT_WEEKS, orderMove } from '@/campaign/engine';
import { relayPath } from '@/campaign/galaxy';
import type { CampaignState } from '@/campaign/state';
import { getShipClass } from '@/data/ships';
import { WEAPONS } from '@/data/weapons';
import { CANON_ME3, getPreset, PRESETS, PRIME_APEX } from '@/timelines/presets';
import { applyRulesToShip, applyRulesToWeapon, CANON_TECH, TECH_KEYS } from '@/timelines/rules';
import { exportRuleSet, importRuleSet, validateRuleSet } from '@/timelines/schema';

const ordinaryBranches = ['aligned_humanity', 'iron_dawn', 'beacon_1800', 'relay_free_humanity', 'prothean_victory', 'past_cycles'];

/** Keep economy/tick execution real while removing unrelated battle CPU and
 * AI orders from the travel assertions. The original campaign tests retain
 * invasion, combat and coalition coverage. */
function quietCampaign(rulesId = 'relay_free_humanity') {
  const state = createCampaign({ seed: 39, rules: getPreset(rulesId), worldState: {} });
  const fleet = state.fleets.find(f => f.name === 'Alliance Fifth Fleet')!;
  state.fleets = [fleet];
  // Preserve the strategic threat so an otherwise empty test map does not
  // end the campaign on week one. No reserve spawns before week six.
  state.reaper.reinforcementPool = 1;
  state.crucible.available = false;
  return { state, fleet };
}

describe('distinct, declared Mass Effect AU branches', () => {
  it('registers unique labelled branches with meaningful history and leaves original presets unchanged', () => {
    expect(new Set(PRESETS.map(p => p.id)).size).toBe(PRESETS.length);
    for (const id of [...ordinaryBranches, 'hfy_terran_ascendancy']) {
      const rules = getPreset(id);
      expect(rules.category).toBe('au'); expect(rules.strictLore).not.toBe(true);
      expect(rules.historyChanges.length).toBeGreaterThanOrEqual(3);
      expect(rules.family).toBeDefined(); expect(rules.preferredFaction).toBeDefined();
    }
    expect(CANON_ME3.organic).toEqual(CANON_TECH);
    expect(PRIME_APEX.organic.fireRate).toBe(1.1);
    expect(PRIME_APEX.special.hadesRounds).toBe(true);
    const clone = getPreset('beacon_1800'); clone.factionOverrides.alliance!.armourStrength = 99;
    expect(getPreset('beacon_1800').factionOverrides.alliance!.armourStrength).toBe(1.4);
  });

  it('ordinary AUs do not weaken or secretly inflate Reaper technology and fleets', () => {
    for (const id of ordinaryBranches) {
      const rules = getPreset(id);
      for (const key of TECH_KEYS) expect(rules.reaper[key]).toBe(1);
      expect(rules.fleetStrength.reaper).toBe(1);
      expect(rules.strategic.reaperCompetence).toBe(1);
      expect(rules.special.hyperMassAccelerators).toBe(false);
      expect(rules.special.hadesRounds).toBe(false);
    }
  });

  it('aligned humans cooperate in the actual campaign while Iron Dawn pays political and manoeuvring costs', () => {
    const aligned = createCampaign({ seed: 4, rules: getPreset('aligned_humanity'), worldState: {} });
    const iron = createCampaign({ seed: 4, rules: getPreset('iron_dawn'), worldState: {} });
    expect(aligned.fleets.filter(f => f.faction === 'cerberus').every(f => f.allegiance === 'allied' && f.playerControlled)).toBe(true);
    expect(iron.factions.turian.cooperation).toBeLessThan(aligned.factions.turian.cooperation);
    const cls = getShipClass('alliance_dreadnought');
    const heavy = applyRulesToShip(cls, iron.rules), joint = applyRulesToShip(cls, aligned.rules);
    expect(heavy.armour).toBeGreaterThan(joint.armour);
    expect(heavy.maxSpeed).toBeLessThan(joint.maxSpeed);
    expect(WEAPONS.alliance_dn_main.cooldown).toBe(4);
  });

  it('the 1800 warning produces defensive preparation and an explicit 290-year branch', () => {
    const rules = getPreset('beacon_1800'), cls = getShipClass('alliance_dreadnought');
    expect(rules.historyChanges.join(' ')).toContain('1800');
    expect(rules.historyChanges.join(' ')).toContain('2090');
    expect(rules.historyChanges.join(' ')).toContain('290 years');
    const prepared = applyRulesToShip(cls, rules), canon = applyRulesToShip(cls, CANON_ME3);
    expect(prepared.barriers).toBeGreaterThan(canon.barriers * 1.5);
    expect(prepared.heatCapacity).toBeGreaterThan(canon.heatCapacity);
    expect(rules.fleetStrength.alliance).toBeGreaterThan(2);
  });

  it('labels the much stronger human power fantasy separately from ordinary AUs', () => {
    const rules = getPreset('hfy_terran_ascendancy'), cls = getShipClass('alliance_dreadnought');
    expect(rules.family).toBe('hfy'); expect(rules.description).toContain('power fantasy');
    const fantasy = applyRulesToWeapon(WEAPONS.alliance_dn_main, cls.faction, cls, rules, WEAPONS);
    const ordinary = applyRulesToWeapon(WEAPONS.alliance_dn_main, cls.faction, cls, getPreset('iron_dawn'), WEAPONS);
    expect(fantasy.damage).toBeGreaterThan(ordinary.damage * 5);
    expect(rules.strategic.conventionalVictoryPossible).toBe(true);
  });

  it('historical branches refuse to misrepresent themselves as the 2186 campaign', () => {
    for (const id of ['prothean_victory', 'past_cycles', 'multiverse_crossover']) {
      const rules = getPreset(id);
      expect(rules.campaignCompatible).toBe(false);
      expect(() => createCampaign({ seed: 1, rules, worldState: {} })).toThrow(/battle sandbox/);
    }
  });

  it('round-trips safe AU metadata and new travel rules without permitting canon claims', () => {
    const result = importRuleSet(exportRuleSet(getPreset('relay_free_humanity')));
    expect(result.ok).toBe(true); expect(result.rules?.family).toBe('human_au');
    expect(result.rules?.preferredFaction).toBe('alliance');
    expect(result.rules?.strategic.relayIndependentHumanFTL).toBe(true);
    const history = importRuleSet(exportRuleSet(getPreset('prothean_victory')));
    expect(history.rules?.preferredFaction).toBe('prothean'); expect(history.rules?.campaignCompatible).toBe(false);
    const invalid = validateRuleSet({ name: 'Bad grouping', category: 'canon', family: 'definitely_canon', preferredFaction: 'unknown', campaignCompatible: 'yes', strategic: { relayIndependentHumanFTL: 'fast' } });
    expect(invalid.rules?.category).toBe('custom'); expect(invalid.rules?.strictLore).toBeUndefined();
    expect(invalid.rules?.family).toBeUndefined(); expect(invalid.rules?.preferredFaction).toBeUndefined();
    expect(invalid.rules?.campaignCompatible).toBe(true); expect(invalid.rules?.strategic.relayIndependentHumanFTL).toBe(false);
  });
});

describe('relay-independent FTL is strategic travel, not combat speed', () => {
  it('leaves ordinary relay movement and combat speeds unchanged', () => {
    const { state, fleet } = quietCampaign('canon_me3');
    expect(orderMove(state, fleet.id, 'athena').ok).toBe(true);
    expect(fleet.route).toEqual(['widow', 'athena']); expect(fleet.destination).toBe('widow');
    expect(fleet.transitWeeksRemaining).toBeUndefined();
    const cls = getShipClass('alliance_dreadnought');
    expect(applyRulesToShip(cls, getPreset('relay_free_humanity')).maxSpeed).toBe(applyRulesToShip(cls, CANON_ME3).maxSpeed);
    expect(orderMove(state, fleet.id, 'athena', 'independent')).toEqual({ ok: false, reason: 'This fleet has no relay-independent FTL drive.' });
  });

  it('crosses directly in three real campaign ticks without intermediate-system presence', () => {
    const { state, fleet } = quietCampaign();
    expect(orderMove(state, fleet.id, 'tikkun').ok).toBe(true);
    expect(relayPath('sol', 'tikkun').length - 1).toBeGreaterThanOrEqual(INDEPENDENT_TRANSIT_WEEKS);
    expect(fleet.destination).toBe('tikkun'); expect(fleet.route).toEqual(['tikkun']);
    expect(fleet.transitWeeksRemaining).toBe(3);
    expect(fleetsAt(state, 'sol')).not.toContain(fleet);
    expect(fleetsAt(state, 'tikkun')).not.toContain(fleet);
    for (let week = 1; week < INDEPENDENT_TRANSIT_WEEKS; week++) {
      advanceTick(state, { interactive: true });
      expect(fleet.location).toBe('sol'); expect(fleet.transitWeeksRemaining).toBe(INDEPENDENT_TRANSIT_WEEKS - week);
      expect(fleetsAt(state, 'sol')).not.toContain(fleet);
    }
    advanceTick(state, { interactive: true });
    expect(fleet.location).toBe('tikkun'); expect(fleet.destination).toBeUndefined();
    expect(fleet.transitWeeksRemaining).toBeUndefined(); expect(fleet.travelMode).toBeUndefined();
    expect(fleetsAt(state, 'tikkun')).toContain(fleet);
    expect(state.events.some(e => e.text.includes('AU transit estimate'))).toBe(true);
  });

  it('retains explicit relay routing and refuses a mid-crossing teleport or course change', () => {
    const { state, fleet } = quietCampaign();
    expect(orderMove(state, fleet.id, 'tikkun', 'relay').ok).toBe(true);
    expect(fleet.route).toEqual(relayPath('sol', 'tikkun').slice(1)); expect(fleet.travelMode).toBeUndefined();
    expect(orderMove(state, fleet.id, 'athena', 'independent').ok).toBe(true);
    expect(fleet.route).toEqual(['athena']);
    const before = JSON.stringify(fleet);
    expect(orderMove(state, fleet.id, 'sol').ok).toBe(false);
    expect(orderMove(state, fleet.id, 'widow').ok).toBe(false);
    expect(JSON.stringify(fleet)).toBe(before);
  });

  it('keeps non-human fleet consent and relay restrictions in force', () => {
    const state = createCampaign({ seed: 4, rules: getPreset('relay_free_humanity'), worldState: {} });
    const turian = state.fleets.find(f => f.faction === 'turian')!;
    state.factions.turian.cooperation = 0.2;
    expect(orderMove(state, turian.id, 'sol').ok).toBe(false);
    state.factions.turian.cooperation = 0.9;
    expect(orderMove(state, turian.id, 'sol', 'independent').ok).toBe(false);
    expect(orderMove(state, turian.id, 'sol').ok).toBe(true);
    expect(turian.travelMode).toBeUndefined(); expect(turian.route).toEqual(relayPath(turian.location, 'sol').slice(1));
  });

  it('cannot use an immediate FTL departure to duplicate or evade a pending battle', () => {
    const { state, fleet } = quietCampaign();
    state.pending = { system: 'sol', alliedFleetIds: [fleet.id], reaperFleetIds: [], playerInvolved: true };
    expect(orderMove(state, fleet.id, 'tikkun', 'independent').ok).toBe(false);
    expect(fleet.destination).toBeUndefined(); expect(fleet.transitWeeksRemaining).toBeUndefined();
    expect(fleetsAt(state, 'sol')).toContain(fleet);
  });

  it('preserves the pending crossing across a plain saved-state round trip', () => {
    const { state, fleet } = quietCampaign();
    orderMove(state, fleet.id, 'tikkun'); advanceTick(state, { interactive: true });
    const restored = JSON.parse(JSON.stringify(state)) as CampaignState;
    for (let i = 0; i < 2; i++) { advanceTick(state, { interactive: true }); advanceTick(restored, { interactive: true }); }
    expect(restored.fleets).toEqual(state.fleets);
    expect(restored.fleets[0].location).toBe('tikkun');
  });

  it('does not teleport shipyard deliveries into a crossing fleet or spend them on no recipient', () => {
    const { state, fleet } = quietCampaign();
    const before = { ...fleet.counts };
    state.factions.alliance.productionPool = 10000;
    orderMove(state, fleet.id, 'tikkun'); advanceTick(state, { interactive: true });
    expect(fleet.counts).toEqual(before); expect(state.factions.alliance.built).toBe(0);
    expect(state.factions.alliance.productionPool).toBeGreaterThanOrEqual(10000);
    advanceTick(state, { interactive: true }); advanceTick(state, { interactive: true });
    expect(state.factions.alliance.built).toBeGreaterThan(0);
  });
});
