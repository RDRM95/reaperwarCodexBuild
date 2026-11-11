import type { BattleSimulation } from './battle';

/**
 * What the interface needs from a battle, whether it is the simulation itself or a mirror of one that runs in a
 * worker. Everything here is public on `BattleSimulation`; render and interface code should take this type, not the
 * class, so it works with either.
 */
export type BattleLike = Pick<BattleSimulation,
  'config' | 'rules' | 'time' | 'tick' | 'ships' | 'shipById' | 'fleets' | 'projectiles' | 'missiles' | 'flashes' | 'events' |
  'finished' | 'result' | 'onEvent' | 'getShip' | 'step' | 'issueOrders' | 'releasePrimaryVolley' | 'orderShipsAttack' |
  'primaryBatteryStatus' | 'fleetBatteryStatus'>;
