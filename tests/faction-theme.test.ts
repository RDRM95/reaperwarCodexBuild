import { describe, expect, it } from 'vitest';
import { FACTIONS } from '@/data/factions';
import { FACTION_THEMES, PANEL_TITLES, panelTitle, themeFor, type PanelKey } from '@/ui/factionTheme';

/**
 * Owner's request, 15 Nov 2026: "unique hud and ui for each faction".
 *
 * Every fleet commanded the battle through the same blue Alliance console. Each of the eight founding factions now
 * has its own colours, panel shapes, banner and words for the panels. These tests hold that every faction has one,
 * that each can be told from the others, and that each can still be read.
 */
const rgb = (colour: string): [number, number, number] => {
  const hex = colour.match(/^#([0-9a-f]{6})$/i);
  if (hex) { const n = parseInt(hex[1], 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
  const parts = colour.match(/rgba?\(([^)]+)\)/)![1].split(',').map(Number);
  return [parts[0], parts[1], parts[2]];
};
const alpha = (colour: string): number => Number(colour.match(/rgba\(([^)]+)\)/)?.[1].split(',')[3] ?? 1);
/** WCAG relative luminance and contrast. */
const luminance = ([r, g, b]: [number, number, number]): number => {
  const c = [r, g, b].map((v) => { const s = v / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; });
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
};
const contrast = (a: [number, number, number], b: [number, number, number]): number => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};
const distance = (a: [number, number, number], b: [number, number, number]): number => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

describe('a console for each faction', () => {
  const themes = Object.values(FACTION_THEMES);

  it('each of the eight founding factions has its own, and any other fleet has the Alliance one', () => {
    for (const id of ['alliance', 'turian', 'asari', 'salarian', 'quarian', 'geth', 'cerberus', 'reaper']) {
      expect(FACTIONS[id as keyof typeof FACTIONS], id).toBeDefined();
      expect(themeFor(id).id).toBe(id);
    }
    expect(themes).toHaveLength(8);
    expect(themeFor('unsc').id).toBe('alliance');
    expect(themeFor(undefined).id).toBe('alliance');
  });

  it('the Alliance console is the interface as it was', () => {
    const v = FACTION_THEMES.alliance.vars;
    expect(v['--blue']).toBe('#4fa3ff');
    expect(v['--cyan']).toBe('#8fd3ff');
    expect(v['--panel']).toBe('rgba(8, 18, 32, 0.78)');
    expect(v['--btn']).toBe('rgba(20, 50, 90, 0.55)');
    expect(v['--btn-hover']).toBe('rgba(79, 163, 255, 0.28)');
    expect(v['--btn-on']).toBe('rgba(79, 163, 255, 0.4)');
    expect(v['--btn-on-edge']).toBe('rgba(143, 211, 255, 0.4)');
    expect(FACTION_THEMES.alliance.titles).toEqual({});
  });

  it('every console sets the same colours, so none shows another through', () => {
    const keys = Object.keys(FACTION_THEMES.alliance.vars).sort();
    for (const theme of themes) for (const key of keys) expect(theme.vars[key], `${theme.id} ${key}`).toBeDefined();
  });

  it('no two consoles have the same colour, banner or name', () => {
    for (const a of themes) for (const b of themes) {
      if (a.id >= b.id) continue;
      expect(distance(rgb(a.vars['--blue']), rgb(b.vars['--blue'])), `${a.id} / ${b.id}`).toBeGreaterThan(40);
      expect(a.name).not.toBe(b.name);
      expect(a.net).not.toBe(b.net);
    }
  });

  it('each can be read: headings and text stand out from its panels', () => {
    for (const theme of themes) {
      // A panel is translucent over space: what is behind it is close to black.
      const panel = rgb(theme.vars['--panel']).map((c) => c * alpha(theme.vars['--panel'])) as [number, number, number];
      expect(contrast(rgb(theme.vars['--blue']), panel), `${theme.id} heading`).toBeGreaterThan(4.5);
      expect(contrast(rgb(theme.vars['--text'] ?? '#dbe7f5'), panel), `${theme.id} text`).toBeGreaterThan(7);
      expect(contrast(rgb(theme.vars['--text-dim'] ?? '#8aa3c0'), panel), `${theme.id} small print`).toBeGreaterThan(4.5);
      expect(alpha(theme.vars['--panel'])).toBeGreaterThanOrEqual(0.7);
    }
  });

  it('a faction words its panels its own way, and never gives two panels the same heading', () => {
    const keys = Object.keys(PANEL_TITLES) as PanelKey[];
    for (const theme of themes) {
      const headings = keys.map((key) => panelTitle(theme, key));
      expect(new Set(headings).size, theme.id).toBe(keys.length);
      for (const heading of headings) {
        expect(heading).toBe(heading.toUpperCase());
        expect(heading.length).toBeLessThanOrEqual(32); // fits the narrowest panel's heading line
      }
    }
    expect(panelTitle(FACTION_THEMES.reaper, 'orders')).toBe('DIRECTIVES');
    expect(panelTitle(FACTION_THEMES.geth, 'comms')).toBe('DATA EXCHANGE');
    expect(panelTitle(FACTION_THEMES.turian, 'camera')).toBe('CAMERA'); // not reworded: the common word stands
  });
});
