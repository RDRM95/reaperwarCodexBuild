import { BattleSimulation } from './battle';
import type { FleetBatteryStatus, PrimaryBatteryStatus } from './fireControl';
import { SnapshotEncoder, type SimSnapshot } from './snapshot';
import type { BattleConfig, FleetOrders } from './types';

/** Messages from the drawing thread to the simulation worker. */
export type ToWorker =
  | { type: 'start'; config: BattleConfig }
  | { type: 'advance'; ticks: number; watchShipId?: string }
  | { type: 'issueOrders'; fleetId: string; patch: Partial<FleetOrders> }
  | { type: 'releasePrimaryVolley'; fleetId: string }
  | { type: 'orderShipsAttack'; shipIds: string[]; targetId: string };

/** The worker's answer to every message after `start`: the battle's state now. */
export interface FromWorker {
  type: 'snapshot';
  snapshot: SimSnapshot;
  /** Ticks stepped for this answer; 0 for the answer to a command. */
  advanced: number;
  /** Every fleet's commanded-battery state. */
  fleetBattery: FleetBatteryStatus[];
  /** The watched ship's main battery, or null when it has none. */
  primaryBattery: PrimaryBatteryStatus | null;
}

/**
 * The simulation's side of the worker protocol, without the worker: it owns the real simulation, steps it when
 * asked and answers with a snapshot. Kept apart from the `self.onmessage` wrapper so tests can drive it directly.
 */
export class SimWorkerCore {
  private sim?: BattleSimulation;
  private encoder?: SnapshotEncoder;
  private watchShipId?: string;

  handle(message: ToWorker): FromWorker | undefined {
    if (message.type === 'start') {
      this.sim = new BattleSimulation(message.config);
      this.encoder = new SnapshotEncoder(this.sim);
      // The drawing thread deploys the same battle itself to have ships on its first frame, so the deployment is
      // not sent: encoding it here only marks those ships and events as already known.
      this.encoder.encode();
      return undefined;
    }
    const sim = this.sim, encoder = this.encoder;
    if (!sim || !encoder) throw new Error('simulation worker: message before start');
    let advanced = 0;
    switch (message.type) {
      case 'advance':
        this.watchShipId = message.watchShipId;
        while (advanced < message.ticks && !sim.finished) { sim.step(); advanced++; }
        break;
      case 'issueOrders': sim.issueOrders(message.fleetId, message.patch); break;
      case 'releasePrimaryVolley': sim.releasePrimaryVolley(message.fleetId); break;
      case 'orderShipsAttack': sim.orderShipsAttack(message.shipIds, message.targetId); break;
    }
    return {
      type: 'snapshot', snapshot: encoder.encode(), advanced,
      fleetBattery: [...sim.fleets.keys()].map(id => sim.fleetBatteryStatus(id)),
      primaryBattery: (this.watchShipId ? sim.primaryBatteryStatus(this.watchShipId) : undefined) ?? null,
    };
  }
}

/** The buffers of an answer that can be handed over instead of copied. */
export function transferables(message: FromWorker): ArrayBuffer[] {
  const s = message.snapshot;
  return [s.ships.buffer, s.weapons.buffer, s.projectiles.buffer, s.missiles.buffer, s.flashes.buffer] as ArrayBuffer[];
}
