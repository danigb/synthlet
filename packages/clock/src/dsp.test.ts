import { createClock } from "./dsp";

/**
 * The engine, driven directly.
 *
 * Runs in node with no `AudioWorkletProcessor` stub: `dsp.ts` imports nothing
 * from the worklet global scope. `worklet.test.ts` is where the stub lives.
 *
 * This file proves the extraction out of `ClockWorkletProcessor.process()` is
 * faithful. It asserts nothing about *timing* - the phase is still one value
 * per block here, jitter and skew are unmeasured, and correcting either is a
 * later ticket. What it does that `worklet.test.ts` cannot is vary the sample
 * rate: 44100 and 48000 are rates where a beat is not a whole number of
 * blocks, and reaching them through the stub means re-importing the module
 * under a new global.
 */

/** One render quantum - the block size the processor is actually called with. */
const BLOCK = 128;

/** 16384: the rate `worklet.test.ts` runs at, where a beat is 64 blocks
 * exactly. 44100 and 48000: the two a browser actually hands you. */
const RATES = [16384, 44100, 48000];

describe("createClock", () => {
  it("matches the shipped phase expression at every sample rate", () => {
    // The oracle is the expression this module shipped with, recomputed here
    // rather than imported: Euclid subdivides the clock by multiplying this
    // ramp, so it cannot move without a ticket that says so.
    for (const sampleRate of RATES) {
      const blocks = blocksPerBeat(sampleRate, 120) * 3;
      const expected: number[] = [];
      let p = 0;
      const increment = 120 / 60 / sampleRate;
      for (let i = 0; i < blocks; i++) {
        let nextPhase = p + BLOCK * increment;
        if (nextPhase > 1) nextPhase -= 1;
        expected.push(nextPhase < p ? 1 : p);
        p = nextPhase;
      }

      const { phase } = render(createClock(sampleRate), blocks);
      expect(phase).toEqual(expected.map(Math.fround));
    }
  });

  it("rises the gate on the block the phase reaches 1", () => {
    // The relationship between the two outputs: the gate is taken from the
    // phase *after* the wrap, so its rising edge lands on the plateau block.
    for (const sampleRate of RATES) {
      const blocks = blocksPerBeat(sampleRate, 120) * 3;
      const { phase, gate } = render(createClock(sampleRate), blocks);
      const plateaus = phase.flatMap((v, i) => (v === 1 ? [i] : []));
      expect(plateaus).toHaveLength(2);
      // Plus one at startup: a clock fires its first beat immediately.
      expect(risingEdges(gate)).toEqual([0, ...plateaus]);
    }
  });

  it("holds the gate for `pulseWidth` of the beat", () => {
    const sampleRate = 44100;
    const perBeat = blocksPerBeat(sampleRate, 120);
    const widths = [0.25, 0.5, 0.75];
    const highs = widths.map(
      (pulseWidth) =>
        render(createClock(sampleRate), perBeat, { pulseWidth }).gate.filter(
          (v) => v === 1,
        ).length,
    );
    // Not an exact block count: at 44100 a beat is 172.27 blocks, which is the
    // whole reason this file exists. Monotonic in the width, and within a
    // block of the fraction, is what the block-constant gate can promise.
    expect(highs).toEqual([...highs].sort((a, b) => a - b));
    highs.forEach((high, i) => {
      expect(Math.abs(high - widths[i] * perBeat)).toBeLessThanOrEqual(1);
    });
  });

  it("emits no gate while it is stopped", () => {
    // bpm 0 never advances the phase, so a phase-derived gate would otherwise
    // latch open at 0 forever. The guard is on the increment, not the tempo.
    const { gate } = render(createClock(44100), 10, { bpm: 0 });
    expect(gate).toEqual(new Array(10).fill(0));
  });

  it("re-derives the increment when the tempo changes", () => {
    const clock = createClock(44100);
    render(clock, 4);
    const slow = render(clock, 1, { bpm: 60 }).phase[0];
    const fast = render(clock, 1, { bpm: 240 }).phase[0];
    // Both are read *before* their own block advances the phase, so compare
    // the deltas the two tempi produced rather than the values themselves.
    const afterSlow = render(clock, 1, { bpm: 240 }).phase[0];
    expect(fast - slow).toBeCloseTo((BLOCK * 60) / 60 / 44100, 9);
    expect(afterSlow - fast).toBeCloseTo((BLOCK * 240) / 60 / 44100, 9);
  });

  it("renders the phase with no gate output", () => {
    // `outputs[1]` is absent whenever nothing is connected to `.gate`.
    const clock = createClock(44100);
    const phaseOut = new Float32Array(BLOCK);
    expect(() => clock(phaseOut, undefined, 120, 0.5)).not.toThrow();
    clock(phaseOut, undefined, 120, 0.5);
    expect(phaseOut[0]).toBeGreaterThan(0);
  });
});

/** Blocks in one beat, rounded down - only 16384/120 is a whole number. */
function blocksPerBeat(sampleRate: number, bpm: number) {
  return Math.floor((sampleRate * 60) / bpm / BLOCK);
}

function risingEdges(values: number[]) {
  return values.flatMap((v, i) => (v > 0 && !(values[i - 1] > 0) ? [i] : []));
}

// Both outputs are filled with a single value per block, so one sample each is
// the whole block.
function render(
  clock: ReturnType<typeof createClock>,
  blocks: number,
  params: { bpm?: number; pulseWidth?: number } = {},
) {
  const phase: number[] = [];
  const gate: number[] = [];
  for (let i = 0; i < blocks; i++) {
    const phaseOut = new Float32Array(BLOCK);
    const gateOut = new Float32Array(BLOCK);
    clock(phaseOut, gateOut, params.bpm ?? 120, params.pulseWidth ?? 0.5);
    phase.push(phaseOut[0]);
    gate.push(gateOut[0]);
  }
  return { phase, gate };
}
