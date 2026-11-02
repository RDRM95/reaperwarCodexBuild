import { setImmediate } from 'node:timers/promises';
import { afterEach } from 'vitest';

// Battle/campaign tests execute thousands of synchronous fixed steps. Yield to
// Node's event loop between tests so Vitest can receive worker RPC acknowledgments
// on slower runners, instead of accumulating a whole file's reporting messages.
// This does not yield inside a simulation or change its deterministic state.
afterEach(async () => { await setImmediate(); });
