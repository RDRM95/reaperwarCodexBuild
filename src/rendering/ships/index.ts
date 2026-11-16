import * as THREE from 'three';
import { SHIP_CLASSES } from '@/data/ships';
import { buildNormandySR1 } from './normandySR1';
import { buildAxiomAncient, buildAxiomWarden, buildExileArk, buildExileRaider, buildCompactSiege, buildCompactGunship } from './expansion';
import { buildAllianceCarrier, buildAllianceCruiser, buildAllianceDreadnought, buildAllianceFighter, buildAllianceFrigate, buildAllianceAegis, buildAllianceOmaha, buildAllianceValkyrie } from './alliance';
import { buildAsariCruiser, buildAsariDreadnought, buildDestinyAscension } from './asari';
import { buildCerberusOmaha } from './cerberusOmaha';
import { buildCerberusCruiser, buildCerberusDreadnought, buildCerberusFighter, buildCerberusFrigate } from './cerberus';
import { buildGethCruiser, buildGethDreadnought, buildGethFighter, buildGethFrigate } from './geth';
import { buildQuarianCruiser, buildQuarianFighter, buildQuarianHeavy, buildQuarianLiveship } from './quarian';
import { buildHarbinger, buildReaperAscendant, buildReaperCapital, buildReaperDestroyer } from './reaper';
import { buildReaperOculus } from './oculus';
import { buildSalarianCruiser, buildSalarianDreadnought, buildSalarianFighter, buildStgFrigate } from './salarian';
import { buildTurianCruiser, buildTurianDreadnought, buildTurianFighter, buildTurianFrigate } from './turian';
import { buildAllianceTitan, buildTurianImperator } from './hyperDreadnought';
import type { BuiltShip } from './types';
import { buildChaosDesolator, buildChaosMurder, buildCovenantCas, buildCovenantCcs, buildImperiumLunar, buildImperiumRetribution, buildUnscInfinity, buildUnscMarathon } from './crossover';
import { buildPastCycleCruiser, buildPastCycleDreadnought, buildPlayerCivCruiser, buildPlayerCivDreadnought, buildProtheanCruiser, buildProtheanDreadnought, buildSkynetHarvester, buildSkynetHunter } from './auHumanity';

export type { BuiltShip } from './types';

const BUILDERS: Record<string, () => BuiltShip> = {
  alliance_normandy_sr1: buildNormandySR1,
  axiom_ancient: buildAxiomAncient,
  axiom_warden: buildAxiomWarden,
  exile_ark: buildExileArk,
  exile_raider: buildExileRaider,
  compact_siege: buildCompactSiege,
  compact_gunship: buildCompactGunship,
  alliance_dreadnought: buildAllianceDreadnought,
  alliance_omaha: buildAllianceOmaha,
  alliance_valkyrie: buildAllianceValkyrie,
  alliance_aegis_command: buildAllianceAegis,
  alliance_titan: buildAllianceTitan,
  alliance_carrier: buildAllianceCarrier,
  alliance_cruiser: buildAllianceCruiser,
  alliance_frigate: () => buildAllianceFrigate(false),
  alliance_frigate_thanix: () => buildAllianceFrigate(true),
  alliance_fighter: buildAllianceFighter,
  turian_dreadnought: buildTurianDreadnought,
  turian_imperator: buildTurianImperator,
  turian_cruiser: buildTurianCruiser,
  turian_frigate: buildTurianFrigate,
  turian_fighter: buildTurianFighter,
  asari_dreadnought: buildAsariDreadnought,
  asari_cruiser: buildAsariCruiser,
  destiny_ascension: buildDestinyAscension,
  salarian_dreadnought: buildSalarianDreadnought,
  salarian_cruiser: buildSalarianCruiser,
  salarian_frigate: buildStgFrigate,
  salarian_fighter: buildSalarianFighter,
  cerberus_omaha: buildCerberusOmaha,
  cerberus_dreadnought: buildCerberusDreadnought,
  cerberus_cruiser: buildCerberusCruiser,
  cerberus_frigate: buildCerberusFrigate,
  cerberus_fighter: buildCerberusFighter,
  geth_dreadnought: buildGethDreadnought,
  geth_cruiser: buildGethCruiser,
  geth_frigate: buildGethFrigate,
  geth_fighter: buildGethFighter,
  quarian_liveship: buildQuarianLiveship,
  quarian_heavy: buildQuarianHeavy,
  quarian_cruiser: buildQuarianCruiser,
  quarian_fighter: buildQuarianFighter,
  reaper_oculus: buildReaperOculus,
  reaper_capital: buildReaperCapital,
  reaper_ascendant: buildReaperAscendant,
  reaper_destroyer: buildReaperDestroyer,
  harbinger: buildHarbinger,
  unsc_marathon: buildUnscMarathon,
  unsc_infinity: buildUnscInfinity,
  covenant_ccs: buildCovenantCcs,
  covenant_cas: buildCovenantCas,
  imperium_lunar: buildImperiumLunar,
  imperium_retribution: buildImperiumRetribution,
  chaos_murder: buildChaosMurder,
  chaos_desolator: buildChaosDesolator,
  prothean_cruiser: buildProtheanCruiser,
  prothean_dreadnought: buildProtheanDreadnought,
  past_cycle_cruiser: buildPastCycleCruiser,
  past_cycle_dreadnought: buildPastCycleDreadnought,
  player_civ_cruiser: buildPlayerCivCruiser,
  player_civ_dreadnought: buildPlayerCivDreadnought,
  skynet_hunter: buildSkynetHunter,
  skynet_harvester: buildSkynetHarvester,
};

/** A model is drawn at its stated length to within this share of it. */
export const LENGTH_TOLERANCE = 0.005;

/**
 * Hold a model to the length it states. A builder lays a hull out in proportions of a length L and says the ship
 * is L long, but a bow, a drive block or a fin can run past the ends: twelve hulls were drawn 3 to 7 % longer than
 * their catalogue length, and the Destiny Ascension (a fan broader than most hulls are long) 14 % shorter. Every
 * part is scaled about the model's origin by the same factor, so proportions, markers and materials are as built.
 */
export function fitToLength(built: BuiltShip): BuiltShip {
  built.group.updateMatrixWorld(true);
  const drawn = new THREE.Box3().setFromObject(built.group).getSize(new THREE.Vector3()).z;
  if (!(drawn > 0) || Math.abs(drawn - built.lengthUnits) <= built.lengthUnits * LENGTH_TOLERANCE) return built;
  const k = built.lengthUnits / drawn;
  const scaled = new Set<THREE.BufferGeometry>();
  built.group.traverse((o) => {
    if (o !== built.group) o.position.multiplyScalar(k);
    const mesh = o as THREE.Mesh;
    if (mesh.isMesh && mesh.geometry && !scaled.has(mesh.geometry)) {
      // A builder may hand out a geometry it keeps for another class: scale a copy.
      mesh.geometry = mesh.geometry.clone().scale(k, k, k);
      scaled.add(mesh.geometry);
    }
  });
  for (const node of built.engineNodes) node.multiplyScalar(k);
  built.muzzle?.multiplyScalar(k);
  built.group.updateMatrixWorld(true);
  return built;
}

/** Cache of template groups per class; instances are cloned (sharing geometry). */
const templates = new Map<string, BuiltShip>();

export function getShipTemplate(classId: string): BuiltShip {
  let t = templates.get(classId);
  if (!t) {
    const builder = BUILDERS[classId];
    if (!builder) throw new Error(`No ship model builder for ${classId}`);
    // A piloted fighter's exhaust discs stand a metre proud of a thirty-metre craft, and its own tests hold it to that.
    const cls = SHIP_CLASSES[classId];
    t = cls?.role === 'fighter' && cls.faction !== 'reaper' ? builder() : fitToLength(builder());
    templates.set(classId, t);
  }
  return t;
}

export function instantiateShip(classId: string): BuiltShip {
  const t = getShipTemplate(classId);
  const group = t.group.clone(true);
  group.traverse((o) => {
    if ((o as THREE.Mesh).isMesh) (o as THREE.Mesh).matrixAutoUpdate = true;
  });
  return { ...t, group, engineNodes: t.engineNodes.map((v) => v.clone()), muzzle: t.muzzle?.clone() };
}

export const hasModel = (classId: string): boolean => classId in BUILDERS;
export const MODELLED_CLASS_IDS = Object.keys(BUILDERS);
