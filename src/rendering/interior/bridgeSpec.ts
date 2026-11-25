/**
 * What a warship's bridge is, before any of it is built: its measures, its fittings and its colours. Pure data
 * and choices, so it can be tested without a renderer.
 *
 * The bridge is a ship's, not an aircraft's: the commanding officer stands on a raised deck behind a rail, with
 * the helm seated in a pit ahead and below, crew stations down both sides, a tactical plot on the rail and the
 * windows wrapping the bow. The pattern is the Systems Alliance's; the other navies keep the same deck (the same
 * instruments in the same places, so nothing is learned twice) in their own colours, glazing and fittings.
 *
 * Everything is in metres in the seat's own frame: the eye at the origin, x to starboard, y up, the bow at −z.
 */
export type BridgeTier = 'compact' | 'standard' | 'flag';

export interface BridgePalette {
  /** Wall and frame paint, the deck, and the darker fittings (chairs, consoles): linear-light RGB, 0 to 1. */
  wall: readonly [number, number, number];
  deck: readonly [number, number, number];
  fitting: readonly [number, number, number];
  /** The stripe a navy paints on its rail and consoles. */
  stripe: readonly [number, number, number];
  /** The room's strip lights, the haptic interface (what the crew work at), and the plot. Hex colours. */
  light: number;
  haptic: number;
  plot: number;
  /** The room's strip lights at action stations when the hull is failing. */
  alert: number;
}

export interface BridgeSpec {
  tier: BridgeTier;
  faction: string;
  /** Painted over the windows. */
  navy: string;
  /** Half the room's width at the commanding officer's deck. */
  halfWidth: number;
  /** Half the width of the windows across the bow, and how far ahead of the eye they stand. */
  noseHalfWidth: number;
  nose: number;
  /** Where the room's straight sides end and the windows of either bow begin (ahead of the eye). */
  shoulder: number;
  /** The wall behind the eye. */
  aft: number;
  /** The raised deck the eye stands on, and the main deck round it (heights from the eye). */
  dais: number;
  deck: number;
  ceiling: number;
  /** The windows: their sill, the bar across their head, and how far the glazing carries on overhead. */
  sill: number;
  brow: number;
  skylight: number;
  /** Bars that divide the windows across the bow, and whether the frames are arched. */
  mullions: number;
  arched: boolean;
  /** Crew stations down each side, and seats at the helm. */
  stations: number;
  helms: 1 | 2;
  /** Whether anyone sits: a geth bridge has stations and no chairs. */
  seated: boolean;
  palette: BridgePalette;
}

const lin = (hex: number): readonly [number, number, number] => {
  const c = (v: number): number => { const s = v / 255; return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; };
  return [c((hex >> 16) & 255), c((hex >> 8) & 255), c(hex & 255)];
};

/** Each navy's bridge. The Alliance's is the pattern: blue-grey paint, cold white strip lights, amber haptics.
 * The bars across the windows are an even number on every bridge: an odd one stands dead ahead. */
const NAVIES: Record<string, { navy: string; mullions: number; arched: boolean; seated: boolean; palette: BridgePalette }> = {
  alliance: { navy: 'SYSTEMS ALLIANCE NAVY', mullions: 2, arched: false, seated: true,
    palette: { wall: lin(0x6f7c8c), deck: lin(0x3a424d), fitting: lin(0x2b313a), stripe: lin(0x2f6fd0), light: 0xbfdcff, haptic: 0xff9a3c, plot: 0x6fc2ff, alert: 0xff3a2a } },
  turian: { navy: 'TURIAN HIERARCHY', mullions: 4, arched: false, seated: true,
    palette: { wall: lin(0x7a858c), deck: lin(0x343c42), fitting: lin(0x23292e), stripe: lin(0x9a2a2a), light: 0xd4f2ff, haptic: 0x7fe0ff, plot: 0x9fe8ff, alert: 0xff4030 } },
  asari: { navy: 'ASARI REPUBLICS', mullions: 0, arched: true, seated: true,
    palette: { wall: lin(0x8a86a8), deck: lin(0x3e3a55), fitting: lin(0x2c2940), stripe: lin(0x7a4fd0), light: 0xdcd0ff, haptic: 0xc08cff, plot: 0xb9a8ff, alert: 0xff4a6a } },
  salarian: { navy: 'SALARIAN UNION', mullions: 2, arched: true, seated: true,
    palette: { wall: lin(0x76887c), deck: lin(0x34423a), fitting: lin(0x232e28), stripe: lin(0x3f9a5a), light: 0xd4ffe0, haptic: 0x7fffa8, plot: 0x9fe08c, alert: 0xff5a3a } },
  quarian: { navy: 'MIGRANT FLEET', mullions: 6, arched: false, seated: true,
    palette: { wall: lin(0x7c7468), deck: lin(0x3c362e), fitting: lin(0x2a2622), stripe: lin(0x7a4fb0), light: 0xffe2b8, haptic: 0xc9a6ff, plot: 0xd9b8ff, alert: 0xff4a2a } },
  geth: { navy: 'GETH CONSENSUS', mullions: 4, arched: false, seated: false,
    palette: { wall: lin(0x4c5560), deck: lin(0x242a30), fitting: lin(0x181c20), stripe: lin(0x3fa0a0), light: 0xa8ffe8, haptic: 0x8fffd0, plot: 0x8fffd0, alert: 0xff6a4a } },
  cerberus: { navy: 'CERBERUS', mullions: 2, arched: false, seated: true,
    palette: { wall: lin(0xb4b4ae), deck: lin(0x2a2b2e), fitting: lin(0x18191c), stripe: lin(0xe07a1a), light: 0xfff0d8, haptic: 0xffb14a, plot: 0xffc46a, alert: 0xff3020 } },
};

/**
 * The navy a faction's bridge is fitted out as. The founding navies have their own; every faction descended from
 * one (the human branches, the Black Fleet) takes its parent's; anything else is fitted on the Alliance pattern.
 */
export function bridgeNavy(faction: string): string {
  if (faction in NAVIES) return faction;
  if (faction.startsWith('cerberus')) return 'cerberus';
  for (const navy of Object.keys(NAVIES)) if (faction.startsWith(navy)) return navy;
  return 'alliance';
}

/** A frigate's bridge is close and narrow; a dreadnought's is a flag bridge. */
export function bridgeTier(role: string): BridgeTier {
  if (role === 'frigate') return 'compact';
  return role === 'dreadnought' || role === 'reaper_capital' ? 'flag' : 'standard';
}

const SCALE: Record<BridgeTier, number> = { compact: 0.82, standard: 1, flag: 1.22 };

export function bridgeSpec(role: string, faction: string): BridgeSpec {
  const tier = bridgeTier(role), k = SCALE[tier], navy = NAVIES[bridgeNavy(faction)];
  return {
    tier, faction, navy: navy.navy,
    // A small bridge is narrower more than it is shorter: the helm still needs its length.
    halfWidth: 3.0 * k, noseHalfWidth: 1.9 * k, nose: 3.7 * (0.5 + 0.5 * k), shoulder: 1.4 * k, aft: 2.2 * k,
    // Heights are a crew's, whatever the size of the room: the eye is 1.7 m above its deck on every bridge.
    dais: -1.7, deck: -2.1, ceiling: 1.6 + 0.25 * k,
    sill: -1.05, brow: 0.95 + 0.1 * k, skylight: 1.5 * k,
    // A small bridge's windows are narrow: more than two bars across them and they are a cage.
    mullions: tier === 'compact' ? Math.min(navy.mullions, 2) : navy.mullions, arched: navy.arched,
    stations: tier === 'compact' ? 1 : tier === 'standard' ? 2 : 3,
    helms: 2,
    seated: navy.seated,
    palette: navy.palette,
  };
}

/**
 * How much of the picture is window when looking straight ahead, as shares of the picture's height: where the
 * sill and the bar across the head of the windows fall, 0 at the bottom and 1 at the top. `fov` is the whole
 * vertical field of view in degrees.
 */
export function windowBand(spec: BridgeSpec, fov: number): { sill: number; brow: number } {
  const half = Math.tan((fov * Math.PI) / 360);
  const at = (y: number): number => 0.5 + (y / spec.nose) / half / 2;
  return { sill: at(spec.sill), brow: at(spec.brow) };
}
