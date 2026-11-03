import type { TechModifiers } from '@/timelines/rules';
import type { FormationType } from '@/simulation/types';

export type CivilizationFaction = 'player_civ' | 'past_cycle';
export type CivilizationOrigin = 'modern' | 'early_beacon' | 'relay_free' | 'hfy' | 'past_cycle';
export type CivilizationEthics = 'cooperative' | 'militarist' | 'supremacist' | 'machine';
export type CivilizationDoctrine = 'kinetic' | 'energy' | 'armour';
export type CivilizationGovernment = 'council' | 'directorate' | 'collective';
export type CivilizationPolicy = 'balanced' | 'cooperative' | 'mobilized' | 'fortress';

export interface CivilizationInput {
  seed?: number;
  name?: string;
  origin?: CivilizationOrigin;
  ethics?: CivilizationEthics;
  doctrine?: CivilizationDoctrine;
  government?: CivilizationGovernment;
  /** A one-off starting fleet allowance, in catalogue points. */
  startingBudget?: number;
}

export interface CivilizationEvent { turn: number; text: string }
export interface PoliticalChoice {
  id: string;
  label: string;
  description: string;
  cost: { industry?: number; research?: number; influence?: number };
}
export interface PoliticalDecision {
  id: number;
  kind: 'assembly' | 'contact' | 'security';
  title: string;
  text: string;
  choices: PoliticalChoice[];
}

export interface CivilizationFleetInput {
  faction: CivilizationFaction;
  name: string;
  formation: FormationType;
  counts: Record<string, number>;
  techOverride: Partial<TechModifiers>;
}

export interface CivilizationBattle {
  id: string;
  seed: number;
  counts: Record<string, number>;
  fleet: CivilizationFleetInput;
}

/** Plain JSON. No generated functions or mutable global catalogue entries. */
export interface CivilizationState {
  version: 1;
  id: string;
  seed: number;
  name: string;
  faction: CivilizationFaction;
  origin: CivilizationOrigin;
  ethics: CivilizationEthics;
  doctrine: CivilizationDoctrine;
  government: CivilizationGovernment;
  policy: CivilizationPolicy;
  /** Abstract monthly turns; not a full galaxy/economy simulation. */
  turn: number;
  industry: number;
  research: number;
  influence: number;
  stability: number;
  legitimacy: number;
  cooperation: number;
  technologyLevel: number;
  fleetCounts: Record<string, number>;
  events: CivilizationEvent[];
  decisionPending?: PoliticalDecision;
  battleSerial: number;
  pendingBattle?: CivilizationBattle;
  lastAppliedBattle?: string;
}

export interface CivilizationAction { ok: boolean; reason?: string }
export interface CivilizationBattleAction extends CivilizationAction { battle?: CivilizationBattle }
