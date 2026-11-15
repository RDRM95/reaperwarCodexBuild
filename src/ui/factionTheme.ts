/**
 * The battle interface belongs to the fleet that is using it.
 *
 * Every fleet commanded the battle through the same blue Alliance console. Each of the eight founding factions now has
 * its own: its colours, the cut of its panels, its lettering, a banner with its name, and its own words for the same
 * panels (a Reaper does not read "FLEET ORDERS"; a geth platform has no "communications"). The layout, the controls
 * and what they do are the same for all of them, so nothing has to be learned twice.
 */

/** The panels whose headings a faction may word its own way. */
export type PanelKey = 'simulation' | 'camera' | 'timeline' | 'allied' | 'hostile' | 'target' | 'orders' | 'intel' | 'comms' | 'losses';

export const PANEL_TITLES: Record<PanelKey, string> = {
  simulation: 'SIMULATION',
  camera: 'CAMERA',
  timeline: 'TIMELINE',
  allied: 'ALLIED FLEET',
  hostile: 'HOSTILE CONTACTS',
  target: 'TARGET / SELECTION',
  orders: 'FLEET ORDERS',
  intel: 'REAPER INTELLIGENCE ASSESSMENT',
  comms: 'FLEET COMMUNICATIONS',
  losses: 'SHIP LOSSES BY CLASS',
};

export interface FactionTheme {
  /** Written to `data-faction` on the interface, for the rules in style.css that are about shape, not colour. */
  id: string;
  /** The banner over the fleet list. */
  name: string;
  net: string;
  /** Custom properties set on the interface: they override the defaults in `:root`. */
  vars: Record<string, string>;
  titles: Partial<Record<PanelKey, string>>;
}

const rgba = (hex: string, alpha: number): string => {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
};

/** The properties every theme sets, from its three colours and the dark it sits on. */
function palette(accent: string, bright: string, button: string, panel: string, extra: Record<string, string> = {}): Record<string, string> {
  return {
    '--blue': accent,
    '--cyan': bright,
    '--line': rgba(accent, 0.45),
    '--line-strong': rgba(bright, 0.85),
    '--panel': panel,
    '--btn': rgba(button, 0.55),
    '--btn-hover': rgba(accent, 0.28),
    '--btn-press': rgba(accent, 0.45),
    '--btn-on': rgba(accent, 0.4),
    '--btn-on-edge': rgba(bright, 0.4),
    ...extra,
  };
}

export const FACTION_THEMES: Record<string, FactionTheme> = {
  alliance: {
    id: 'alliance', name: 'SYSTEMS ALLIANCE NAVY', net: 'FLEET COMMAND NET',
    vars: palette('#4fa3ff', '#8fd3ff', '#14325a', 'rgba(8, 18, 32, 0.78)'),
    titles: {},
  },
  turian: {
    id: 'turian', name: 'TURIAN HIERARCHY', net: 'FLEET COMMAND · BY RANK',
    vars: palette('#7fd1e8', '#c9eef7', '#183e4a', 'rgba(8, 20, 26, 0.82)'),
    titles: { allied: 'HIERARCHY FLEET', orders: 'COMMAND DIRECTIVES', comms: 'CHAIN OF COMMAND', target: 'DESIGNATED TARGET' },
  },
  asari: {
    id: 'asari', name: 'ASARI REPUBLICS', net: 'HIGH COMMAND CONCORD',
    vars: palette('#c08cff', '#e3d0ff', '#3a1e60', 'rgba(20, 12, 36, 0.78)'),
    titles: { allied: 'REPUBLIC FLEET', orders: 'FLEET COUNSEL', comms: 'CONCORD CHANNEL' },
  },
  salarian: {
    id: 'salarian', name: 'SALARIAN UNION', net: 'SPECIAL TASKS GROUP · ANALYSIS',
    vars: palette('#9fe08c', '#d3f7c8', '#1e4828', 'rgba(8, 22, 14, 0.8)'),
    titles: { allied: 'UNION FLEET', hostile: 'HOSTILE CONTACTS · ASSESSED', orders: 'OPERATIONAL PLAN', comms: 'INTELLIGENCE FEED', target: 'SUBJECT' },
  },
  quarian: {
    id: 'quarian', name: 'MIGRANT FLEET', net: 'ADMIRALTY BOARD · KEELAH SE’LAI',
    vars: palette('#f0d08c', '#ffe9bd', '#503460', 'rgba(24, 16, 30, 0.8)'),
    titles: { allied: 'THE FLOTILLA', orders: 'ADMIRALTY ORDERS', comms: 'FLEET CHANNEL', losses: 'SHIPS LOST' },
  },
  geth: {
    id: 'geth', name: 'GETH CONSENSUS', net: 'SHARED RUNTIME · 1,183 PROCESSES',
    vars: palette('#d8e6ff', '#ffffff', '#282e3c', 'rgba(6, 8, 12, 0.74)', { '--text-dim': '#9aa6b8' }),
    titles: { simulation: 'RUNTIME', camera: 'OPTICS', allied: 'PLATFORMS', hostile: 'HOSTILE PLATFORMS', target: 'FOCUS', orders: 'CONSENSUS', comms: 'DATA EXCHANGE', losses: 'PLATFORMS LOST' },
  },
  cerberus: {
    id: 'cerberus', name: 'CERBERUS', net: 'PROJECT COMMAND · EYES ONLY',
    vars: palette('#ff9a3c', '#ffffff', '#46280c', 'rgba(14, 12, 10, 0.86)', { '--orange': '#ffd23c' }),
    titles: { allied: 'CERBERUS ASSETS', hostile: 'OPPOSITION', orders: 'OPERATIVE ORDERS', comms: 'SECURE CHANNEL', target: 'ASSET / TARGET' },
  },
  reaper: {
    id: 'reaper', name: 'HARVEST FLEET', net: 'WE ARE EACH A NATION',
    vars: palette('#ff3b2f', '#ff9a8c', '#500e0a', 'rgba(14, 4, 4, 0.86)', { '--text': '#ecd9d5', '--text-dim': '#a07872', '--orange': '#ff6a3c' }),
    titles: { simulation: 'CYCLE', camera: 'OBSERVATION', allied: 'HARVEST FLEET', hostile: 'ORGANIC RESISTANCE', target: 'DESIGNATED', orders: 'DIRECTIVES', intel: 'HARVEST ASSESSMENT', comms: 'SIGNAL', losses: 'UNITS LOST' },
  },
};

/** The console for a faction: its own if it is one of the eight, otherwise the Alliance's. */
export function themeFor(faction: string | undefined): FactionTheme {
  return (faction && FACTION_THEMES[faction]) || FACTION_THEMES.alliance;
}

/** A panel's heading in a faction's words. */
export function panelTitle(theme: FactionTheme, key: PanelKey): string {
  return theme.titles[key] ?? PANEL_TITLES[key];
}

/** Dress an interface element in a faction's console. */
export function applyTheme(root: HTMLElement, theme: FactionTheme): void {
  root.dataset.faction = theme.id;
  for (const [name, value] of Object.entries(theme.vars)) root.style.setProperty(name, value);
}
