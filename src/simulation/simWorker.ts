/// <reference lib="webworker" />
import { SimWorkerCore, transferables, type ToWorker } from './simWorkerCore';

/** Web Worker entry: the simulation runs here, off the thread that draws. */
const core = new SimWorkerCore();
self.onmessage = (event: MessageEvent<ToWorker>) => {
  const answer = core.handle(event.data);
  if (answer) (self as DedicatedWorkerGlobalScope).postMessage(answer, transferables(answer));
};
