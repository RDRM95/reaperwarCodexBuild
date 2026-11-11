import { BattleSimulation } from './battle';
import type { FleetBatteryStatus, PrimaryBatteryStatus } from './fireControl';
import type { FromWorker, ToWorker } from './simWorkerCore';
import { SimMirror, SnapshotEncoder } from './snapshot';
import type { BattleConfig, FleetOrders } from './types';

/**
 * A battle that is simulated somewhere else. It is the drawing thread's mirror plus the commands and queries the
 * interface uses on a simulation, so the view, the HUD and the overlay can be given one in place of a
 * `BattleSimulation`.
 *
 * Time is asked for, not taken: `advance` is called once a frame with how much simulated time has passed. The
 * simulation is kept one tick ahead of what is drawn, so the snapshot for the next tick is normally already here
 * when the frame that needs it comes, and the picture does not wait on the worker.
 */
export class RemoteBattle extends SimMirror {
  /** Simulated seconds that have passed and are not yet covered by an applied tick. */
  accumulator = 0;
  private readonly inbox: FromWorker[] = [];
  private pending = false;
  private readonly fleetBattery = new Map<string, FleetBatteryStatus>();
  private primaryBattery: PrimaryBatteryStatus | null = null;
  private watchShipId?: string;

  constructor(config: BattleConfig, private readonly post: (message: ToWorker) => void, private readonly tickSeconds: number) {
    super(config);
    // Deploy here as well, without ever stepping, so there are ships to draw on the first frame. Deployment is
    // deterministic, so these are the ships the worker has.
    const deployed = new BattleSimulation(config);
    this.apply(new SnapshotEncoder(deployed).encode());
    for (const id of deployed.fleets.keys()) this.fleetBattery.set(id, deployed.fleetBatteryStatus(id));
    post({ type: 'start', config });
  }

  /** Give an answer from the worker to the mirror. It is applied by the next `advance`. */
  receive(message: FromWorker): void {
    if (message.advanced > 0) this.pending = false;
    this.inbox.push(message);
  }

  /**
   * Once a frame: `seconds` of simulated time have passed (0 while paused). Applies the snapshots that are due,
   * asks for the next, and returns how far the picture is into the current tick, 0 to 1.
   */
  advance(seconds: number, spiralLimit: number): number {
    this.accumulator = Math.min(this.accumulator + seconds, spiralLimit + this.tickSeconds);
    while (this.inbox.length) {
      const next = this.inbox[0];
      // An answer to a command applies at once. A stepped answer waits until the picture has used up the tick
      // before it, then takes as much of the accumulated time as it covers.
      if (next.advanced > 0 && this.accumulator < this.tickSeconds) break;
      this.inbox.shift();
      this.apply(next.snapshot);
      for (const status of next.fleetBattery) this.fleetBattery.set(status.fleetId, status);
      this.primaryBattery = next.primaryBattery;
      this.accumulator = Math.max(0, this.accumulator - next.advanced * this.tickSeconds);
    }
    if (!this.pending && !this.finished && !this.inbox.some(message => message.advanced > 0)) {
      this.pending = true;
      this.post({ type: 'advance', ticks: Math.max(1, Math.floor(this.accumulator / this.tickSeconds)), watchShipId: this.watchShipId });
    }
    return Math.min(1, this.accumulator / this.tickSeconds);
  }

  /** A mirror is never stepped: the worker steps the simulation. */
  step(): void { throw new Error('a remote battle is advanced by its worker, not stepped'); }

  issueOrders(fleetId: string, patch: Partial<FleetOrders>): void {
    // Shown at once; the worker's answer then replaces it with what the simulation made of the order.
    const fleet = this.fleets.get(fleetId);
    if (fleet) Object.assign(fleet.orders, patch);
    this.post({ type: 'issueOrders', fleetId, patch });
  }

  releasePrimaryVolley(fleetId: string): boolean {
    const status = this.fleetBatteryStatus(fleetId);
    if (this.finished || status.total === 0 || status.volleyRemaining > 0) return false;
    this.post({ type: 'releasePrimaryVolley', fleetId });
    return true;
  }

  orderShipsAttack(shipIds: string[], targetId: string): void { this.post({ type: 'orderShipsAttack', shipIds, targetId }); }

  /** The watched ship's main battery as of the last answer; asking for a ship makes it the watched one. */
  primaryBatteryStatus(shipId: string): PrimaryBatteryStatus | undefined {
    this.watchShipId = shipId;
    return this.primaryBattery?.shipId === shipId ? this.primaryBattery : undefined;
  }

  fleetBatteryStatus(fleetId: string): FleetBatteryStatus {
    return this.fleetBattery.get(fleetId) ?? { fleetId, ready: 0, cooling: 0, total: 0, volleyRemaining: 0, held: this.fleets.get(fleetId)?.orders.primaryFire === 'hold' };
  }
}
