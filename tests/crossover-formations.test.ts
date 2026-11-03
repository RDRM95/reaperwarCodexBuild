import { describe, expect, it } from 'vitest';
import { distance } from '@/core/vec3';
import { getShipClass } from '@/data/ships';
import { buildCustomBattle } from '@/scenarios';
import { assignSlots, type SlotShip } from '@/simulation/formations';
import { BattleSimulation } from '@/simulation/battle';
import { FORMATION_LABELS, type FormationType } from '@/simulation/types';
import { CANON_ME3 } from '@/timelines/presets';
import { cloneRules } from '@/timelines/rules';

const formations = Object.keys(FORMATION_LABELS) as FormationType[];
const members = (classes: string[]): SlotShip[] => classes.map((id, i) => {
  const cls = getShipClass(id);
  return { id: `${id}-${i}`, role: cls.role, lengthKm: cls.lengthM.value / 1000 };
});

describe('physical clearance for small fleets of oversized hulls', () => {
  for (const formation of formations) it(`${formation}: separates carriers, heavy cruisers and mixed capital groups at deployment`, () => {
    for (const classes of [
      ['imperium_lunar', 'imperium_lunar', 'imperium_retribution'],
      ['chaos_murder', 'chaos_murder', 'chaos_desolator'],
      ['unsc_infinity', 'unsc_marathon', 'unsc_marathon'],
      ['covenant_cas', 'covenant_ccs', 'covenant_ccs'],
    ]) {
      const ships = members(classes), slots = assignSlots(ships, formation);
      expect(assignSlots(ships, formation)).toEqual(slots);
      for (let i = 0; i < ships.length; i++) {
        const p = slots.get(ships[i].id)!;
        expect(Number.isFinite(p.x + p.y + p.z)).toBe(true);
        for (let j = 0; j < i; j++) {
          expect(distance(p, slots.get(ships[j].id)!)).toBeGreaterThanOrEqual((ships[i].lengthKm + ships[j].lengthKm) * 0.55 - 1e-8);
        }
      }
    }
  });

  it('applies physical clearance to oversized hulls in every layout tier, including future light-role rosters', () => {
    for (const [role, lengthKm] of [['dreadnought', 8], ['cruiser', 5], ['frigate', 2], ['fighter', 0.4]] as const) {
      const ships: SlotShip[] = [{ id: `${role}-a`, role, lengthKm }, { id: `${role}-b`, role, lengthKm }];
      for (const formation of formations) {
        const slots = assignSlots(ships, formation);
        expect(distance(slots.get(ships[0].id)!, slots.get(ships[1].id)!)).toBeGreaterThanOrEqual(lengthKm * 1.1 - 1e-8);
      }
    }
  });

  it('the real builder and battle deployment keep two Lunar cruisers clear of their Retribution', () => {
    const rules = cloneRules(CANON_ME3); rules.id = 'crossover_clearance_test'; rules.category = 'au';
    const sim = new BattleSimulation(buildCustomBattle({ seed: 7, rulesId: rules.id, environment: 'deep_space', startingDistanceKm: 100,
      sideA: { faction: 'imperium', name: 'Imperial squadron', formation: 'line_abreast', counts: { imperium_lunar: 2, imperium_retribution: 1 } },
      sideB: { faction: 'chaos', name: 'Raider', formation: 'line_abreast', counts: { chaos_murder: 1 } },
    }, rules));
    const fleet = sim.ships.filter(s => s.side === 'A');
    expect(fleet).toHaveLength(3);
    for (let i = 0; i < fleet.length; i++) for (let j = 0; j < i; j++) {
      expect(distance(fleet[i].pos, fleet[j].pos)).toBeGreaterThanOrEqual(fleet[i].radiusKm + fleet[j].radiusKm);
    }
    const capital = fleet.find(s => s.classId === 'imperium_retribution')!;
    expect(capital.pos).toEqual(sim.fleets.get(capital.fleetId)!.anchor);
  });
});
