import { describe, expect, it } from 'vitest';
import { dot, normalize, sub } from '@/core/vec3';
import { WEAPONS } from '@/data/weapons';
import { buildCustomBattle } from '@/scenarios';
import { BattleSimulation } from '@/simulation/battle';
import { engagementBand } from '@/simulation/ai';
import { inWeaponArc } from '@/simulation/fireControl';
import { CANON_ME3 } from '@/timelines/presets';
import { cloneRules } from '@/timelines/rules';

const cases = [
  { faction: 'unsc' as const, classId: 'unsc_marathon', weaponId: 'unsc_archer', mainId: 'unsc_mac', magazine: 24 },
  { faction: 'covenant' as const, classId: 'covenant_ccs', weaponId: 'covenant_plasma_torpedo', mainId: 'covenant_plasma_lance', magazine: 20 },
];

function battery(c: (typeof cases)[number]) {
  const rules = cloneRules(CANON_ME3); rules.id = 'crossover_missile_test'; rules.category = 'au';
  const sim = new BattleSimulation(buildCustomBattle({ seed: 90, rulesId: rules.id, environment: 'deep_space', startingDistanceKm: 60, maxDuration: 300,
    sideA: { faction: c.faction, name: 'Forward battery', formation: 'line_abreast', counts: { [c.classId]: 1 } },
    sideB: { faction: 'unsc', name: 'Target', formation: 'line_abreast', counts: { unsc_infinity: 1 } },
  }, rules));
  const shooter = sim.ships.find(s => s.side === 'A')!, target = sim.ships.find(s => s.side === 'B')!;
  target.hull = target.maxHull = 1e9; target.barriers = target.maxBarriers = 1e9;
  // Keep the target stationary and harmless; the firing ship retains its real
  // battery definitions, normal targeting, heat, guidance and reload clocks.
  sim.issueOrders(target.fleetId, { order: 'hold_formation' });
  for (const mount of target.weapons) mount.cooldown = 1e6;
  return { sim, shooter, target };
}

describe('guided crossover launch-bank engagement envelopes', () => {
  for (const c of cases) {
    it(`${c.faction}: both side banks support a forward weapon-standoff engagement`, () => {
      const { sim, shooter, target } = battery(c);
      const launchers = shooter.weapons.filter(w => w.def.id === c.weaponId);
      expect(launchers.some(w => w.facing > 0)).toBe(true);
      expect(launchers.some(w => w.facing < 0)).toBe(true);
      for (const launcher of launchers) expect(inWeaponArc(shooter, launcher, target.pos)).toBe(true);
      const band = engagementBand(shooter);
      const distance = Math.hypot(target.pos.x - shooter.pos.x, target.pos.y - shooter.pos.y, target.pos.z - shooter.pos.z);
      expect(distance).toBeGreaterThan(band.min); expect(distance).toBeLessThan(band.max);
      for (let i = 0; i < 800; i++) sim.step();
      const missiles = sim.events.filter(e => e.type === 'weapon_fired' && e.shipId === shooter.id && e.weaponId === c.weaponId);
      expect(missiles.length).toBeGreaterThan(0);
      for (const facingSign of [-1, 1]) expect(missiles.some(e => e.type === 'weapon_fired' && Math.sign(shooter.weapons[e.weaponIndex].facing) === facingSign)).toBe(true);
      expect(sim.events.some(e => e.type === 'weapon_fired' && e.shipId === shooter.id && e.weaponId === c.mainId)).toBe(true);
      expect(dot(shooter.heading, normalize(sub(target.pos, shooter.pos)))).toBeGreaterThan(0.98);
      expect(WEAPONS[c.mainId].arc).toBeLessThanOrEqual(18);
    });

    it(`${c.faction}: a forward launcher obeys its existing reload and finite magazine`, () => {
      const { sim, shooter, target } = battery(c);
      sim.issueOrders(shooter.fleetId, { order: 'hold_formation' });
      const launcher = shooter.weapons.find(w => w.def.id === c.weaponId)!;
      for (const mount of shooter.weapons) mount.cooldown = mount === launcher ? 0 : 1e6;
      for (let i = 0; i < 5400; i++) sim.step();
      const shots = sim.events.filter(e => e.type === 'weapon_fired' && e.shipId === shooter.id && e.weaponIndex === launcher.index);
      expect(shots).toHaveLength(c.magazine);
      expect(launcher.ammo).toBe(0);
      for (let i = 1; i < shots.length; i++) expect(shots[i].t - shots[i - 1].t).toBeGreaterThanOrEqual(WEAPONS[c.weaponId].cooldown * 0.95 - 0.051);
      expect(inWeaponArc(shooter, launcher, target.pos)).toBe(true);
    });
  }
});
