import { Rng } from '@/core/rng';
import { SHIP_CLASSES } from '@/data/ships';
import type { BattleResult } from '@/simulation/types';
import { CANON_TECH, type TechModifiers } from '@/timelines/rules';
import type {
  CivilizationAction, CivilizationBattle, CivilizationBattleAction, CivilizationDoctrine,
  CivilizationEthics, CivilizationFaction, CivilizationFleetInput, CivilizationGovernment,
  CivilizationInput, CivilizationOrigin, CivilizationPolicy, CivilizationState, PoliticalDecision,
} from './types';

export const CIVILIZATION_ORIGINS: Record<CivilizationOrigin, string> = {
  modern: 'Modern independent civilization', early_beacon: 'Early Prothean warning',
  relay_free: 'Relay-independent FTL', hfy: 'HFY power fantasy', past_cycle: 'Generated past cycle',
};
export const CIVILIZATION_POLICIES: Record<CivilizationPolicy, { label: string; description: string }> = {
  balanced: { label: 'Balanced development', description: 'Maintain civilian legitimacy and steady industry and research.' },
  cooperative: { label: 'Coalition charter', description: 'Trade industrial output for research and cooperation; improve legitimacy.' },
  mobilized: { label: 'War economy', description: 'Increase industry while losing stability and research output each month.' },
  fortress: { label: 'Fortress doctrine', description: 'Prioritize armour and barriers; construction is slower and diplomatic trust falls.' },
};

const origins = Object.keys(CIVILIZATION_ORIGINS) as CivilizationOrigin[];
const ethics: CivilizationEthics[] = ['cooperative', 'militarist', 'supremacist', 'machine'];
const doctrines: CivilizationDoctrine[] = ['kinetic', 'energy', 'armour'];
const governments: CivilizationGovernment[] = ['council', 'directorate', 'collective'];
const policyIds = Object.keys(CIVILIZATION_POLICIES) as CivilizationPolicy[];
const clamp = (n: number, min: number, max: number) => Math.min(max, Math.max(min, n));
const number = (v: unknown, fallback: number, min: number, max: number) => typeof v === 'number' && Number.isFinite(v) ? clamp(v, min, max) : fallback;
const integer = (v: unknown, fallback: number, min: number, max: number) => Math.floor(number(v, fallback, min, max));
const object = (v: unknown): Record<string, unknown> => v !== null && typeof v === 'object' && !Array.isArray(v) ? v as Record<string, unknown> : {};
const clean = (v: unknown, fallback: string, max = 80) => typeof v === 'string' && v.trim() ? v.replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, max) : fallback;
const member = <T extends string>(v: unknown, allowed: readonly T[], fallback: T): T => allowed.includes(v as T) ? v as T : fallback;
const copy = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
const fail = (reason: string): CivilizationAction => ({ ok: false, reason });
const hullIds = (faction: CivilizationFaction) => [`${faction}_cruiser`, `${faction}_dreadnought`];
const cost = (classId: string) => SHIP_CLASSES[classId]?.pointValue ?? (classId === 'past_cycle_dreadnought' ? 1200 : classId === 'player_civ_dreadnought' ? 900 : classId === 'past_cycle_cruiser' ? 400 : 280);

function generatedName(seed: number, origin: CivilizationOrigin): string {
  const rng = new Rng(`civilization-name:${seed}:${origin}`);
  const root = rng.pick(['Aster', 'Veyra', 'Orison', 'Khelar', 'Ilyon', 'Thessa', 'Seru', 'Maran', 'Soreth', 'Nalor', 'Elyra', 'Vesper']);
  return `${root} ${rng.pick(origin === 'past_cycle' ? ['Continuum', 'Concordance', 'Ascendancy', 'Dynasty', 'Enclaves', 'Remnant'] : ['Commonwealth', 'Directorate', 'Concord', 'Union', 'Republic', 'Collective'])}`;
}

function record(state: CivilizationState, text: string): void {
  state.events.push({ turn: state.turn, text });
  state.events = state.events.slice(-50);
}
function constrain(state: CivilizationState): void {
  state.industry = clamp(state.industry, 0, 1_000_000);
  state.research = clamp(state.research, 0, 1_000_000);
  state.influence = clamp(state.influence, 0, 200);
  state.stability = clamp(state.stability, 0, 100);
  state.legitimacy = clamp(state.legitimacy, 0, 100);
  state.cooperation = clamp(state.cooperation, 0, 1);
}
function strategicLock(state: CivilizationState): CivilizationAction | undefined {
  return state.pendingBattle ? fail('A fleet engagement is pending. Resolve it or cancel the launch before changing the civilization.') : undefined;
}
function canPay(state: CivilizationState, amount: { industry?: number; research?: number; influence?: number }): boolean {
  return state.industry >= (amount.industry ?? 0) && state.research >= (amount.research ?? 0) && state.influence >= (amount.influence ?? 0);
}
function pay(state: CivilizationState, amount: { industry?: number; research?: number; influence?: number }): void {
  state.industry -= amount.industry ?? 0; state.research -= amount.research ?? 0; state.influence -= amount.influence ?? 0;
}

function decision(kind: PoliticalDecision['kind'], id: number): PoliticalDecision {
  const content = {
    assembly: {
      title: 'The assembly demands a settlement', text: 'Civilian reconstruction and naval procurement compete for the same industry.',
      choices: [
        { id: 'civilian_compact', label: 'Fund the civilian compact', description: '+12 stability, +8 legitimacy and +0.05 cooperation.', cost: { industry: 200 } },
        { id: 'fleet_levy', label: 'Impose a fleet levy', description: '+240 industry, −10 stability, −6 legitimacy and −0.05 cooperation.', cost: { influence: 18 } },
      ],
    },
    contact: {
      title: 'A neighbour offers an accord', text: 'Joint research offers access and trust; unilateral claims reinforce domestic authority.',
      choices: [
        { id: 'research_accord', label: 'Sign the research accord', description: '+100 research, +0.18 cooperation and +4 legitimacy.', cost: { influence: 18 } },
        { id: 'assert_claims', label: 'Assert sovereign claims', description: '+12 legitimacy and +5 stability, but −0.15 cooperation.', cost: { influence: 10 } },
      ],
    },
    security: {
      title: 'The security council requests emergency powers', text: 'Emergency centralization steadies command but alienates civilian and allied institutions.',
      choices: [
        { id: 'emergency_powers', label: 'Authorize emergency powers', description: '+12 stability, −10 legitimacy and −0.10 cooperation.', cost: { influence: 12 } },
        { id: 'independent_review', label: 'Fund an independent review', description: '+12 legitimacy, +0.08 cooperation and +3 stability.', cost: { industry: 150, research: 25 } },
      ],
    },
  }[kind];
  return { id, kind, ...content, choices: [...content.choices, {
    id: 'defer_decision', label: 'Defer the vote',
    description: 'No resource cost; −4 legitimacy and −2 stability. Ends the impasse for this month.', cost: {},
  }] };
}

export function createCivilization(input: CivilizationInput = {}): CivilizationState {
  const seed = integer(input.seed, 42, 0, 0xffffffff) >>> 0;
  const origin = member(input.origin, origins, 'modern');
  const faction: CivilizationFaction = origin === 'past_cycle' ? 'past_cycle' : 'player_civ';
  const name = clean(input.name, generatedName(seed, origin));
  const gov = member(input.government, governments, 'council');
  const ethic = member(input.ethics, ethics, 'cooperative');
  const doctrine = member(input.doctrine, doctrines, 'kinetic');
  const rng = new Rng(`civilization-charter:${seed}:${faction}`);
  const [cruiser, capital] = hullIds(faction);
  const budget = integer(input.startingBudget, 3600, 1000, 25000);
  const capitals = Math.min(4, Math.floor(budget * rng.range(0.30, 0.50) / cost(capital)));
  const cruisers = Math.min(48, Math.floor((budget - capitals * cost(capital)) / cost(cruiser)));
  const state: CivilizationState = {
    version: 1, id: `civ-${seed.toString(36)}-${Rng.hashString(`${name}:${origin}:${ethic}:${doctrine}:${gov}`).toString(36)}`,
    seed, name, faction, origin, ethics: ethic, doctrine, government: gov, policy: 'balanced', turn: 0,
    industry: origin === 'relay_free' ? 600 : 700, research: origin === 'early_beacon' ? 240 : 120, influence: 70,
    stability: ethic === 'supremacist' ? 66 : 74, legitimacy: gov === 'directorate' ? 62 : 76,
    cooperation: ethic === 'cooperative' ? 0.75 : ethic === 'supremacist' ? 0.2 : 0.45,
    technologyLevel: origin === 'early_beacon' ? 2 : 1,
    fleetCounts: { [cruiser]: cruisers, [capital]: capitals }, events: [], battleSerial: 0,
  };
  record(state, `${name} ratifies its founding charter. Fleet frames use ${civilizationFleetPoints(state)} of ${budget} starting points; every origin and political conversion is an AU simulation estimate.`);
  if (origin === 'relay_free') record(state, 'Relay-independent drive research diverts 40 industry each month and adds 6 research. It does not grant a combat-speed bonus or a galaxy map in this compact civilization mode.');
  if (origin === 'hfy') record(state, 'HFY deliberately grants a power-fantasy technology tier; it is not a balanced or canonical Reaper challenge.');
  return state;
}

export function civilizationFleetPoints(state: CivilizationState): number {
  return hullIds(state.faction).reduce((sum, id) => sum + cost(id) * (state.fleetCounts[id] ?? 0), 0);
}

/** Technology comes from the civilization's persistent choices. The returned
 * fleet owns real inventory and an explicit per-fleet override, not free damage
 * hidden in the simulation or a mutated shared ship catalogue. */
export function civilizationFleet(state: CivilizationState): CivilizationFleetInput {
  const t: TechModifiers = { ...CANON_TECH };
  const tech = 1 + Math.max(0, state.technologyLevel - 1) * 0.09;
  t.massAcceleratorDamage = tech; t.beamDamage = tech; t.armourStrength = tech;
  t.kineticBarrierStrength = tech; t.hullIntegrity = tech;
  t.fireRate = 1 + Math.max(0, state.technologyLevel - 1) * 0.025;
  if (state.origin === 'early_beacon') { t.kineticBarrierStrength *= 1.2; t.sensors *= 1.25; }
  if (state.origin === 'hfy') { t.massAcceleratorDamage *= 3.5; t.beamDamage *= 3.5; t.hullIntegrity *= 3; t.kineticBarrierStrength *= 3; t.fireRate *= 1.5; }
  if (state.origin === 'past_cycle') {
    const rng = new Rng(`civilization-archetype:${state.seed}`);
    t.massAcceleratorDamage *= rng.range(0.95, 1.2); t.kineticBarrierStrength *= rng.range(0.95, 1.2);
    t.armourStrength *= rng.range(0.95, 1.2);
  }
  if (state.doctrine === 'kinetic') { t.massAcceleratorDamage *= 1.2; t.massAcceleratorPenetration *= 1.15; t.beamDamage *= 0.9; }
  if (state.doctrine === 'energy') { t.beamDamage *= 1.25; t.kineticBarrierStrength *= 1.15; t.massAcceleratorDamage *= 0.9; }
  if (state.doctrine === 'armour') { t.armourStrength *= 1.3; t.hullIntegrity *= 1.2; t.speed *= 0.85; t.fireRate *= 0.95; }
  if (state.policy === 'fortress') { t.armourStrength *= 1.15; t.kineticBarrierStrength *= 1.15; t.speed *= 0.9; }
  if (state.ethics === 'militarist' || state.ethics === 'supremacist') t.accuracy *= 1.06;
  if (state.ethics === 'supremacist') { t.massAcceleratorDamage *= 1.08; t.beamDamage *= 1.08; }
  t.crewQuality = clamp((0.75 + state.stability / 200) * (0.9 + state.legitimacy / 1000), 0.65, 1.3);
  t.accuracy *= 0.96 + state.cooperation * 0.10;
  t.heatCapacity = 1 + Math.max(0, state.technologyLevel - 1) * 0.06;
  return { faction: state.faction, name: state.name, formation: state.doctrine === 'armour' ? 'defensive_screen' : state.doctrine === 'energy' ? 'strike_wedge' : 'line_abreast', counts: { ...state.fleetCounts }, techOverride: t };
}

export function advanceCivilization(state: CivilizationState): CivilizationAction {
  const locked = strategicLock(state); if (locked) return locked;
  if (state.decisionPending) return fail('Resolve the pending political decision before advancing another month.');
  if (state.turn >= 10000) return fail('This civilization has reached the supported turn limit.');
  state.turn++;
  const productive = 180 + state.stability * 3.5 + (state.government === 'directorate' ? 70 : 0) + (state.ethics === 'militarist' ? 35 : 0) - (state.origin === 'relay_free' ? 40 : 0) - (state.ethics === 'machine' ? 20 : 0);
  const multiplier = state.policy === 'mobilized' ? 1.35 : state.policy === 'fortress' ? 0.88 : state.policy === 'cooperative' ? 0.9 : 1;
  state.industry += Math.round(productive * multiplier);
  state.research += Math.round((24 + state.technologyLevel * 4 + state.cooperation * 14 + (state.origin === 'relay_free' ? 6 : 0) + (state.ethics === 'machine' ? 12 : 0)) * (state.policy === 'cooperative' ? 1.25 : state.policy === 'mobilized' ? 0.85 : 1));
  state.influence += state.government === 'council' ? 10 : 8;
  if (state.policy === 'mobilized') { state.stability -= 2; state.legitimacy -= 1; }
  else if (state.policy === 'cooperative') { state.cooperation += 0.015; state.legitimacy += 1; }
  else if (state.policy === 'balanced') state.stability += 0.5;
  if (state.government === 'collective') state.stability += 1;
  constrain(state);
  record(state, `Month ${state.turn}: industry and research arrive under ${CIVILIZATION_POLICIES[state.policy].label.toLowerCase()}.`);
  if (state.turn % 3 === 0) {
    const rng = new Rng(`civilization-politics:${state.seed}:${state.turn}`);
    state.decisionPending = decision(rng.pick(['assembly', 'contact', 'security'] as const), state.turn);
    record(state, state.decisionPending.title);
  }
  return { ok: true };
}

export function enactPolicy(state: CivilizationState, choice: string): CivilizationAction {
  const locked = strategicLock(state); if (locked) return locked;
  const pendingChoice = state.decisionPending?.choices.find(c => c.id === choice);
  if (pendingChoice) {
    if (!canPay(state, pendingChoice.cost)) return fail('Insufficient resources for that political decision.');
    pay(state, pendingChoice.cost);
    switch (choice) {
      case 'civilian_compact': state.stability += 12; state.legitimacy += 8; state.cooperation += 0.05; break;
      case 'fleet_levy': state.industry += 240; state.stability -= 10; state.legitimacy -= 6; state.cooperation -= 0.05; break;
      case 'research_accord': state.research += 100; state.cooperation += 0.18; state.legitimacy += 4; break;
      case 'assert_claims': state.legitimacy += 12; state.stability += 5; state.cooperation -= 0.15; break;
      case 'emergency_powers': state.stability += 12; state.legitimacy -= 10; state.cooperation -= 0.1; break;
      case 'independent_review': state.legitimacy += 12; state.cooperation += 0.08; state.stability += 3; break;
      case 'defer_decision': state.legitimacy -= 4; state.stability -= 2; break;
    }
    record(state, `Decision enacted: ${pendingChoice.label}.`); state.decisionPending = undefined; constrain(state);
    return { ok: true };
  }
  if (!policyIds.includes(choice as CivilizationPolicy)) return fail('That political choice is unavailable.');
  if (state.policy === choice) return fail('That development policy is already active.');
  if (!canPay(state, { influence: 15 })) return fail('Changing development policy costs 15 influence.');
  pay(state, { influence: 15 }); state.policy = choice as CivilizationPolicy;
  if (choice === 'cooperative') { state.cooperation += 0.05; state.legitimacy += 3; }
  if (choice === 'mobilized') { state.stability -= 5; state.legitimacy -= 3; }
  if (choice === 'fortress') { state.cooperation -= 0.05; state.stability += 3; }
  record(state, `Development policy changed to ${CIVILIZATION_POLICIES[state.policy].label}.`); constrain(state);
  return { ok: true };
}

export function buildCivilizationShips(state: CivilizationState, classId: string, amount = 1): CivilizationAction {
  const locked = strategicLock(state); if (locked) return locked;
  if (!hullIds(state.faction).includes(classId)) return fail('This civilization cannot construct that hull.');
  if (!Number.isInteger(amount) || amount < 1 || amount > 32) return fail('Choose between 1 and 32 whole hulls.');
  const existing = Object.values(state.fleetCounts).reduce((a, b) => a + b, 0);
  if (existing + amount > 256) return fail('The civilization fleet is limited to 256 hulls.');
  const total = cost(classId) * amount;
  if (state.industry < total) return fail(`Construction requires ${total} industry.`);
  state.industry -= total; state.fleetCounts[classId] = (state.fleetCounts[classId] ?? 0) + amount;
  record(state, `Shipyards deliver ${amount} ${SHIP_CLASSES[classId]?.name ?? classId.replaceAll('_', ' ')} hull${amount === 1 ? '' : 's'} for ${total} industry.`);
  return { ok: true };
}

export function researchCivilization(state: CivilizationState): CivilizationAction {
  const locked = strategicLock(state); if (locked) return locked;
  if (state.technologyLevel >= 6) return fail('The supported technology tree is complete.');
  const research = 180 * (state.technologyLevel + 1);
  if (!canPay(state, { research, industry: 100, influence: 8 })) return fail(`Research requires ${research} research, 100 industry and 8 influence.`);
  pay(state, { research, industry: 100, influence: 8 }); state.technologyLevel++;
  record(state, `Technology tier ${state.technologyLevel} completed. Upgraded armament, protection and heat systems apply to the actual fleet.`);
  return { ok: true };
}

export function beginCivilizationBattle(state: CivilizationState): CivilizationBattleAction {
  const locked = strategicLock(state); if (locked) return locked;
  if (Object.values(state.fleetCounts).reduce((a, b) => a + b, 0) <= 0) return fail('Construct at least one ship before deploying.');
  const serial = ++state.battleSerial;
  const battle: CivilizationBattle = {
    id: `${state.id}-battle-${serial}`, seed: Rng.hashString(`civilization-battle:${state.seed}:${serial}`),
    counts: { ...state.fleetCounts }, fleet: civilizationFleet(state),
  };
  state.pendingBattle = copy(battle);
  record(state, `Fleet deployed for engagement ${serial}. Strategic changes are locked until the fleet returns.`);
  return { ok: true, battle: copy(battle) };
}

export function cancelCivilizationBattle(state: CivilizationState, id: string): CivilizationAction {
  if (!state.pendingBattle || state.pendingBattle.id !== id) return fail('No matching fleet launch is pending.');
  state.pendingBattle = undefined; record(state, 'Fleet launch cancelled; inventory is unchanged.');
  return { ok: true };
}

/** Survivors should come from the civilization fleet, including escaped ships.
 * The result summary is a safe fallback for a battle containing only that fleet
 * on its perspective side; counts can never exceed the deployment snapshot. */
export function applyCivilizationBattleResult(state: CivilizationState, result: BattleResult, survivorCounts?: Record<string, number>): CivilizationAction {
  const pending = state.pendingBattle;
  if (!pending || result.configId !== pending.id || state.lastAppliedBattle === result.configId) return fail('No matching unresolved civilization engagement.');
  const side = result.sides[result.perspectiveSide];
  let deployed = 0, lost = 0;
  for (const id of hullIds(state.faction)) {
    const sent = pending.counts[id] ?? 0;
    const fallback = integer(side.lossesByClass[id] ? side.lossesByClass[id].deployed - side.lossesByClass[id].lost : 0, 0, 0, sent);
    // An explicit owner-filtered map is authoritative: a missing class means
    // zero survivors, even if allied fleets fielded the same catalogue hull.
    const remaining = survivorCounts ? integer(survivorCounts[id], 0, 0, sent) : fallback;
    state.fleetCounts[id] = remaining; deployed += sent; lost += sent - remaining;
  }
  const lossFraction = deployed ? lost / deployed : 0;
  state.stability -= lossFraction * 12; state.legitimacy -= lossFraction * 10;
  if (result.outcome === 'victory') { state.influence += 12; state.legitimacy += 5; state.cooperation += 0.03; state.industry += 150; }
  if (result.outcome === 'defeat') state.legitimacy -= 4;
  state.lastAppliedBattle = result.configId; state.pendingBattle = undefined; constrain(state);
  record(state, `${result.outcome === 'victory' ? 'Victory' : result.outcome === 'defeat' ? 'Defeat' : 'Draw'}: ${deployed - lost} of ${deployed} deployed hulls returned. Fleet losses and political consequences are now persistent.`);
  return { ok: true };
}

/** Restore only recognized bounded data. Derived fleet technology and pending
 * choices are rebuilt, so an imported object cannot inject formulas/effects. */
export function normalizeCivilizationState(raw: unknown): CivilizationState | undefined {
  const value = object(raw); if (value.version !== 1) return undefined;
  const state = createCivilization({ seed: integer(value.seed, 42, 0, 0xffffffff), name: clean(value.name, ''),
    origin: member(value.origin, origins, 'modern'), ethics: member(value.ethics, ethics, 'cooperative'),
    doctrine: member(value.doctrine, doctrines, 'kinetic'), government: member(value.government, governments, 'council') });
  if (typeof value.id === 'string' && /^civ-[a-z0-9]+-[a-z0-9]+$/.test(value.id) && value.id.length <= 80) state.id = value.id;
  state.turn = integer(value.turn, 0, 0, 10000); state.policy = member(value.policy, policyIds, 'balanced');
  state.industry = number(value.industry, 0, 0, 1_000_000); state.research = number(value.research, 0, 0, 1_000_000);
  state.influence = number(value.influence, 0, 0, 200); state.stability = number(value.stability, 50, 0, 100);
  state.legitimacy = number(value.legitimacy, 50, 0, 100); state.cooperation = number(value.cooperation, 0.5, 0, 1);
  state.technologyLevel = integer(value.technologyLevel, 1, 1, 6); state.battleSerial = integer(value.battleSerial, 0, 0, 1_000_000);
  let remainingCapacity = 256; const counts = object(value.fleetCounts);
  for (const id of hullIds(state.faction)) { const n = integer(counts[id], 0, 0, remainingCapacity); state.fleetCounts[id] = n; remainingCapacity -= n; }
  state.events = Array.isArray(value.events) ? value.events.slice(-50).map(rawEvent => {
    const event = object(rawEvent); return { turn: integer(event.turn, 0, 0, state.turn), text: clean(event.text, 'Historical entry.', 400) };
  }) : [];
  const pending = object(value.decisionPending);
  if (['assembly', 'contact', 'security'].includes(pending.kind as string)) state.decisionPending = decision(pending.kind as PoliticalDecision['kind'], integer(pending.id, state.turn, 0, state.turn));
  if (typeof value.lastAppliedBattle === 'string') state.lastAppliedBattle = clean(value.lastAppliedBattle, '', 160);
  const battle = object(value.pendingBattle), expected = `${state.id}-battle-${state.battleSerial}`;
  if (battle.id === expected && state.battleSerial > 0 && state.lastAppliedBattle !== expected) {
    const deployed = object(battle.counts), cleanCounts: Record<string, number> = {};
    for (const id of hullIds(state.faction)) cleanCounts[id] = integer(deployed[id], state.fleetCounts[id] ?? 0, 0, state.fleetCounts[id] ?? 0);
    state.pendingBattle = { id: expected, seed: Rng.hashString(`civilization-battle:${state.seed}:${state.battleSerial}`), counts: cleanCounts,
      fleet: { ...civilizationFleet(state), counts: { ...cleanCounts } } };
  }
  return state;
}
