/**
 * The in-game benchmark: a fixed battle, measured on the machine it runs on.
 *
 * Frame rate cannot be measured from a cloud machine with a software renderer. This runs a known battle on the
 * player's own graphics card at their own settings and reports what the frames cost and where the main thread's
 * time went, as text that can be copied out.
 */

/** What one frame cost: the time since the previous frame, and the main thread's work in it, by part (ms). */
export interface FrameSample {
  frame: number;
  sim: number;
  update: number;
  render: number;
  overlay: number;
  hud: number;
  drawCalls: number;
}

export interface BenchmarkContext {
  scene: string;
  ships: number;
  seconds: number;
  quality: string;
  bloom: string;
  simulationThread: string;
  /** Drawing-buffer size in device pixels, and the pixel ratio in use. */
  width: number;
  height: number;
  pixelRatio: number;
  /** What the browser says it is drawing with. A software renderer here means the numbers are not the GPU's. */
  renderer: string;
  triangles: number;
}

export interface BenchmarkReport extends BenchmarkContext {
  frames: number;
  fps: { average: number; onePercentLow: number; pointOnePercentLow: number };
  frameMs: { median: number; p95: number; p99: number; worst: number };
  /** Mean main-thread milliseconds a frame, by part, and their sum. */
  workMs: { sim: number; update: number; render: number; overlay: number; hud: number; total: number };
  /** Share of frames in which the main thread's own work took longer than the median frame: these are hitches. */
  longFrames: number;
  drawCalls: { mean: number; most: number };
  /** True if the renderer string names a software rasteriser. */
  software: boolean;
}

const mean = (values: readonly number[]): number => (values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0);
const round = (value: number, places = 1): number => Math.round(value * 10 ** places) / 10 ** places;

/** The value below which `share` of the sorted values fall. */
function quantile(sorted: readonly number[], share: number): number {
  if (!sorted.length) return 0;
  return sorted[Math.min(sorted.length - 1, Math.floor(share * sorted.length))];
}

/** Frames a second over the slowest `share` of frames: the figure that says how bad the stutters are. */
function lowFps(sortedDescending: readonly number[], share: number): number {
  const count = Math.max(1, Math.round(sortedDescending.length * share));
  const worst = mean(sortedDescending.slice(0, count));
  return worst > 0 ? 1000 / worst : 0;
}

export const isSoftwareRenderer = (renderer: string): boolean => /swiftshader|llvmpipe|software|basic render/i.test(renderer);

export function summariseBenchmark(samples: readonly FrameSample[], context: BenchmarkContext): BenchmarkReport {
  const frameTimes = samples.map((s) => s.frame);
  const ascending = [...frameTimes].sort((a, b) => a - b);
  const descending = [...ascending].reverse();
  const part = (key: 'sim' | 'update' | 'render' | 'overlay' | 'hud'): number => mean(samples.map((s) => s[key]));
  const work = { sim: part('sim'), update: part('update'), render: part('render'), overlay: part('overlay'), hud: part('hud') };
  const median = quantile(ascending, 0.5);
  const totals = samples.map((s) => s.sim + s.update + s.render + s.overlay + s.hud);
  const calls = samples.map((s) => s.drawCalls);
  return {
    ...context,
    frames: samples.length,
    fps: {
      average: round(samples.length ? 1000 / mean(frameTimes) : 0),
      onePercentLow: round(lowFps(descending, 0.01)),
      pointOnePercentLow: round(lowFps(descending, 0.001)),
    },
    frameMs: { median: round(median, 2), p95: round(quantile(ascending, 0.95), 2), p99: round(quantile(ascending, 0.99), 2), worst: round(descending[0] ?? 0, 2) },
    workMs: {
      sim: round(work.sim, 2), update: round(work.update, 2), render: round(work.render, 2), overlay: round(work.overlay, 2), hud: round(work.hud, 2),
      total: round(work.sim + work.update + work.render + work.overlay + work.hud, 2),
    },
    longFrames: round(samples.length ? totals.filter((t) => t > median).length / samples.length : 0, 3),
    drawCalls: { mean: Math.round(mean(calls)), most: calls.length ? Math.max(...calls) : 0 },
    software: isSoftwareRenderer(context.renderer),
  };
}

/** The report as plain text, to be read on screen and pasted elsewhere. */
export function formatBenchmark(r: BenchmarkReport): string {
  const lines = [
    `REAPER WAR BENCHMARK — ${r.scene}`,
    `${r.ships} ships, ${r.seconds} s measured, ${r.frames} frames`,
    `Renderer: ${r.renderer}${r.software ? '  (SOFTWARE RENDERER: these are not GPU figures)' : ''}`,
    `Drawing ${r.width} x ${r.height} (pixel ratio ${round(r.pixelRatio, 2)}), quality ${r.quality}, bloom ${r.bloom}, simulation on ${r.simulationThread}`,
    '',
    `Frames a second: average ${r.fps.average}, 1% low ${r.fps.onePercentLow}, 0.1% low ${r.fps.pointOnePercentLow}`,
    `Frame time, ms: median ${r.frameMs.median}, 95th ${r.frameMs.p95}, 99th ${r.frameMs.p99}, worst ${r.frameMs.worst}`,
    '',
    `Main-thread work a frame, ms: ${r.workMs.total} in all`,
    `  simulation ${r.workMs.sim}, scene update ${r.workMs.update}, draw submission ${r.workMs.render}, tactical overlay ${r.workMs.overlay}, interface ${r.workMs.hud}`,
    `Frames whose own work outlasted the median frame: ${round(r.longFrames * 100, 1)} %`,
    `Draw calls: ${r.drawCalls.mean} on average, ${r.drawCalls.most} at most; ${r.triangles.toLocaleString('en-GB')} triangles`,
  ];
  return lines.join('\n');
}

/** How long the benchmark lets the battle develop before it measures, and for how long it measures. */
export const BENCHMARK_WARM_UP_BATTLE_SECONDS = 25;
export const BENCHMARK_MEASURE_SECONDS = 30;

export type BenchmarkScene = 'standard' | 'large';
export const BENCHMARK_SCENES: Record<BenchmarkScene, { label: string; description: string }> = {
  standard: { label: 'Final Battle of Earth (about 300 ships)', description: 'A scripted battle of ordinary size, measured from first contact.' },
  large: { label: 'Fleet action (2,208 ships)', description: 'Two thousand ships: what large custom battles cost.' },
};
