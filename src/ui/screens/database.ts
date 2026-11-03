import type { App } from '../app';
import { el, fmtNum, provenanceBadge, setChildren } from '../dom';
import { SHIP_CLASS_LIST } from '@/data/ships';
import { WEAPONS, getWeapon } from '@/data/weapons';
import { FACTIONS } from '@/data/factions';
import { applyRulesToShip, applyRulesToWeapon } from '@/timelines/rules';
import type { ShipClassDef } from '@/data/types';

export function renderDatabase(app: App): HTMLElement {
  const rules = app.currentRules();
  const strictLore = 'strictLore' in rules && rules.strictLore === true;
  let current: ShipClassDef = SHIP_CLASS_LIST[0];
  const nav = el('div', { class: 'codex-nav scroll' });
  const bodyPane = el('div', { class: 'codex-body scroll' });
  const seconds = (value: number): string => `${fmtNum(value, 2)} s`;
  const mountFacing = (degrees: number, arc: number): string => {
    if (arc >= 360) return 'all-round';
    const facing = ((degrees + 180) % 360 + 360) % 360 - 180;
    const name = Math.abs(facing) < 45 ? 'forward' : Math.abs(facing) > 135 ? 'aft' : facing > 0 ? 'starboard' : 'port';
    return `${name} (${fmtNum(degrees)}°)`;
  };

  const statRow = (label: string, base: { value: number; provenance: string; note?: string }, effective: number, unit = '') => {
    const changed = Math.abs(effective - base.value) > 1e-6;
    return el('tr', {}, [
      el('td', {}, [label, ' ', provenanceBadge(base.provenance), base.note ? el('div', { class: 'dim', style: { fontSize: '10px' } }, base.note) : null]),
      el('td', { class: 'num' }, fmtNum(base.value, 2) + unit),
      el('td', { class: `num ${changed ? 'better' : ''}`, style: changed ? { color: 'var(--orange)' } : {} }, [fmtNum(effective, 2) + unit, changed ? el('span', { class: 'badge au', style: { marginLeft: '6px' } }, 'AU') : null]),
    ]);
  };

  const renderEntry = () => {
    const c = current;
    const eff = applyRulesToShip(c, rules);
    const f = FACTIONS[c.faction];
    setChildren(bodyPane,
      el('h2', {}, c.name),
      el('div', { class: 'dim mono', style: { fontSize: '11px', marginBottom: '6px' } }, `${f.name.toUpperCase()} · ${c.role.replace('_', ' ').toUpperCase()}`),
      el('p', {}, [provenanceBadge(c.designProvenance.provenance), ' ', c.designProvenance.value]),
      el('p', {}, c.description),
      el('table', {}, [
        el('thead', {}, el('tr', {}, [el('th', {}, 'Statistic'), el('th', {}, 'Catalogue baseline'), el('th', {}, `${rules.name}`)])),
        el('tbody', {}, [
          statRow('Length', c.lengthM, c.lengthM.value, ' m'),
          statRow('Hull integrity', c.hull, eff.hull),
          statRow('Armour', c.armour, eff.armour),
          statRow('Kinetic barriers', c.barriers, eff.barriers),
          statRow('Barrier regen /s', c.barrierRegen, eff.barrierRegen),
          statRow('Max combat speed', c.maxSpeed, eff.maxSpeed, ' km/s'),
          statRow('Acceleration', c.acceleration, eff.acceleration, ' km/s²'),
          statRow('Turn rate', c.turnRate, eff.turnRate, ' °/s'),
          statRow('Sensor range', c.sensorRange, eff.sensorRange, ' km'),
        ]),
      ]),
      el('p', { class: 'dim', style: { fontSize: '12px' } }, 'The catalogue baseline includes simulation estimates and AU designs. Provenance describes each listed value; it does not make every performance number canonical.'),
      el('h3', { style: { marginTop: '16px' } }, 'Armament'),
      el('p', { class: 'dim', 'data-cadence-help': 'independent-mounts', style: { fontSize: '12px' } }, 'Each row is a hardpoint group; its count is independently reloading mounts. Broadside guns and point defence fire separately from the spinal cannon, so several shots can appear between main-gun reloads. All timings below are simulated seconds: 4× speed plays a four-second reload in about one real second when the machine keeps up.'),
      el('p', { class: 'dim', 'data-cadence-help': 'provenance', style: { fontSize: '12px' } }, 'Weapon badges identify the weapon concept. Mount counts, exact firing rates and beam timings are simulation estimates unless a separate Codex anchor is shown. Heat, weapon damage, alignment, ammunition and coordinated salvo timing can delay a shot.'),
      el('table', { 'data-table': 'weapon-cadence' }, [
        el('thead', {}, el('tr', {}, [el('th', {}, 'Weapon / concept'), el('th', {}, 'Mounts / facing'), el('th', {}, 'Damage'), el('th', {}, 'Nominal cycle / mount'), el('th', {}, 'Range'), el('th', {}, 'Penetration')])),
        el('tbody', {}, c.hardpoints.map((hp) => {
          const base = getWeapon(hp.weaponId);
          const w = applyRulesToWeapon(base, c.faction, c, rules, WEAPONS);
          const changed = w.substitutedFrom || Math.abs(w.damage - base.damage) > 1e-6;
          const beam = (w.kind === 'reaper_beam' || w.kind === 'thanix') && (w.beamDuration ?? 0) > 0;
          const codexAnchor = strictLore && base.id === 'alliance_dn_main' && w.id === base.id;
          const cycle = el('td', { 'data-stat': 'mount-cycle', style: { minWidth: '150px' } }, [
            el('div', {}, beam ? `${seconds(w.beamDuration!)} burst + ${seconds(w.cooldown)} recharge` : `${seconds(w.cooldown)} ${w.burst ? 'shot interval' : 'reload'}`),
            beam ? el('div', { class: 'dim', style: { fontSize: '11px' } }, `≈ ${seconds(w.beamDuration! + w.cooldown)} between burst starts`) : null,
            w.burst ? el('div', { class: 'dim', style: { fontSize: '11px' } }, `${w.burst.shots}-shot burst; ${seconds(w.burst.recovery)} recovery`) : null,
            el('div', { style: { fontSize: '10px', marginTop: '4px' } }, codexAnchor
              ? [el('span', { class: 'badge canon' }, 'Codex anchor'), ' Everest base: 2 s; effective reload follows this timeline.']
              : el('span', { class: 'badge estimate' }, 'rate estimate')),
            Math.abs(w.cooldown - base.cooldown) > 1e-6 || w.substitutedFrom
              ? el('div', { class: 'dim', style: { fontSize: '10px' } }, `Original catalogue reload: ${seconds(base.cooldown)}`) : null,
          ]);
          return el('tr', { 'data-weapon': w.id, 'data-facing': hp.facing }, [
            el('td', {}, [w.name, ' ', el('span', { title: 'Provenance of the weapon concept; numerical cadence is identified separately.' }, provenanceBadge(w.provenance.provenance)), w.substitutedFrom ? el('div', { class: 'dim', style: { fontSize: '10px' } }, `replaces ${base.name} in this timeline`) : null]),
            el('td', { title: `${w.arc}° firing arc; mount count is a simulation estimate.` }, `${hp.count} × ${mountFacing(hp.facing, w.arc)}`),
            el('td', { class: 'num', style: changed ? { color: 'var(--orange)' } : {} }, `${fmtNum(w.damage)}${w.beamDuration ? ` /s × ${w.beamDuration}s` : ''}`),
            cycle,
            el('td', { class: 'num' }, `${fmtNum(w.range)} km`),
            el('td', { class: 'num' }, w.penetration.toFixed(2) + (w.armourBypass ? ` (+${fmtNum(w.armourBypass * 100)}% bypass)` : '')),
          ]);
        })),
      ]),
      c.hardpoints.some(hp => hp.weaponId === 'alliance_dn_main')
        ? el('p', { class: 'dim', 'data-cadence-help': 'everest-anchor', style: { fontSize: '12px' } }, strictLore
          ? 'Strict lore uses the Everest Codex reference of one main-gun round every two seconds as its base cadence. Other performance figures remain inferred or estimated; readiness can extend the interval.'
          : 'The Everest Codex reference is one main-gun round every two seconds. The balanced catalogue uses a four-second Alliance dreadnought reload; Strict Lore selects the two-second reference cadence.') : null,
      c.fighterComplement ? el('p', { class: 'dim' }, `Carries ${c.fighterComplement.count} fighters.`) : null,
      el('p', { class: 'dim', style: { fontSize: '12px' } }, `Point value ${c.pointValue}. All hull/armour/barrier figures are simulation estimates on a scale where one Everest-class dreadnought round ≈ 1,000 points.`),
    );
    for (const b of nav.querySelectorAll<HTMLButtonElement>('[data-class]')) b.classList.toggle('active', b.dataset.class === c.id);
  };

  const factions = [...new Set(SHIP_CLASS_LIST.map((c) => c.faction))];
  for (const fid of factions) {
    nav.append(el('div', { class: 'cat' }, FACTIONS[fid].name.toUpperCase()));
    for (const c of SHIP_CLASS_LIST.filter((x) => x.faction === fid)) {
      nav.append(el('button', { class: 'btn', 'data-class': c.id, onclick: () => {
        current = c;
        app.playUi('ui_click');
        renderEntry();
      } }, c.name));
    }
  }
  renderEntry();

  return el('div', { class: 'screen' }, [
    el('div', { class: 'screen-header' }, [el('h1', {}, 'FLEET DATABASE'), el('span', { class: 'sub' }, `EFFECTIVE STATS UNDER: ${rules.name.toUpperCase()}`)]),
    el('div', { class: 'screen-body' }, [el('div', { class: 'codex' }, [nav, bodyPane])]),
    el('div', { class: 'screen-footer' }, [el('button', { class: 'btn', onclick: () => app.show('menu') }, '← Main menu'), el('button', { class: 'btn', onclick: () => app.show('timelines') }, 'Change timeline')]),
  ]);
}
