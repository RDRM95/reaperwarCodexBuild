import { describe, expect, it } from 'vitest';
import { formatBenchmark, isSoftwareRenderer, summariseBenchmark, type BenchmarkContext, type FrameSample } from '@/ui/benchmark';

/**
 * The in-game benchmark's arithmetic. The owner plays on an RTX 5090 and frame rate cannot be measured from a cloud
 * machine with a software renderer; the benchmark is how real figures come back.
 */
describe('benchmark report', () => {
  const context: BenchmarkContext = { scene: 'Test', ships: 310, seconds: 30, quality: 'ultra', bloom: 'auto', simulationThread: 'its own thread',
    width: 3840, height: 2160, pixelRatio: 1, renderer: 'ANGLE (NVIDIA, NVIDIA GeForce RTX 5090 Direct3D11 vs_5_0 ps_5_0)', triangles: 2_000_000 };
  const frame = (ms: number, work = 2): FrameSample => ({ frame: ms, sim: 0, update: work / 2, render: work / 2, overlay: 0, hud: 0, drawCalls: 400 });

  it('averages frames by time, and reads the lows off the slowest frames', () => {
    // 990 frames of 5 ms and ten of 50 ms: 5.45 s in all.
    const samples = [...Array.from({ length: 990 }, () => frame(5)), ...Array.from({ length: 10 }, () => frame(50, 45))];
    const report = summariseBenchmark(samples, context);
    expect(report.frames).toBe(1000);
    expect(report.fps.average).toBeCloseTo(1000 / 5.45, 1);
    // The slowest 1 % are the ten 50 ms frames: 20 a second. The slowest 0.1 % is one of them.
    expect(report.fps.onePercentLow).toBe(20);
    expect(report.fps.pointOnePercentLow).toBe(20);
    expect(report.frameMs.median).toBe(5);
    expect(report.frameMs.p99).toBe(50);
    expect(report.frameMs.worst).toBe(50);
    // Ten frames in a thousand did more work than a median frame lasts.
    expect(report.longFrames).toBe(0.01);
    expect(report.workMs.total).toBeCloseTo((990 * 2 + 10 * 45) / 1000, 2);
    expect(report.drawCalls).toEqual({ mean: 400, most: 400 });
    expect(report.software).toBe(false);
  });

  it('says so when the browser is not drawing with the graphics card', () => {
    expect(isSoftwareRenderer('ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero)), SwiftShader driver)')).toBe(true);
    expect(isSoftwareRenderer('llvmpipe (LLVM 15.0.7, 256 bits)')).toBe(true);
    expect(isSoftwareRenderer(context.renderer)).toBe(false);
    const report = summariseBenchmark([frame(16)], { ...context, renderer: 'Google SwiftShader' });
    expect(report.software).toBe(true);
    expect(formatBenchmark(report)).toContain('SOFTWARE RENDERER');
  });

  it('prints every figure a reader needs, and survives an empty run', () => {
    const text = formatBenchmark(summariseBenchmark([frame(7), frame(7), frame(9)], context));
    for (const wanted of ['310 ships', 'RTX 5090', '3840 x 2160', 'quality ultra', 'Frames a second: average', '1% low', 'Main-thread work a frame', 'Draw calls: 400']) expect(text).toContain(wanted);
    const empty = summariseBenchmark([], context);
    expect(empty.fps.average).toBe(0);
    expect(empty.frameMs.worst).toBe(0);
    expect(formatBenchmark(empty)).toContain('0 frames');
  });
});
