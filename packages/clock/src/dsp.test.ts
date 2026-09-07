import { createClock } from "./dsp";

/**
 * The engine, driven directly.
 *
 * Runs in node with no `AudioWorkletProcessor` stub: `dsp.ts` imports nothing
 * from the worklet global scope. `worklet.test.ts` is where the stub lives.
 *
 * Two things live here. The first describe block proves the extraction out of
 * `ClockWorkletProcessor.process()` was faithful. The second is the timing net:
 * what a clock is *for* is being on time, and until it was written nothing in
 * this repository measured that.
 *
 * ## The 16384 Hz blind spot
 *
 * `worklet.test.ts` runs at 16384 Hz, where a beat at 120 BPM is 8192 samples =
 * exactly 64 blocks. The phase reaches 1.0 precisely and wraps on a block
 * boundary every time, so a clock that renders one value per render quantum is
 * indistinguishable there from one that renders per sample. That is a sound
 * instinct for a snapshot test, and it is why this module's central defect has
 * been invisible for a year.
 *
 * At 44100 Hz a beat is 22050 samples = 172.27 blocks and nothing divides. Every
 * rate/tempo pair below is chosen so it does not divide. Do not "simplify" them
 * to 16384.
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

describe("timing", () => {
  /**
   * Every bound below was measured against this engine with `renderEdges`, at
   * the rate and tempo named next to it, over 600 s. Reproduce before trusting.
   *
   * 600 s is 26.5 M samples per render and the whole block costs ~400 ms of
   * wall clock, because nothing retains a buffer: `renderEdges` scans each
   * block for edges and keeps only the indices.
   */
  const RATES = [44100, 48000];
  const TEMPOS = [60, 120, 137.3, 400];
  const SECONDS = 600;

  it("keeps every beat within one render quantum of its ideal time", () => {
    // Measured at 44100/120 over 600 s: deviation in [-2.902, 0.000] ms, which
    // is exactly one render quantum (128 / 44100 = 2.902 ms) and no more. The
    // sign is one-sided negative because the block-constant fill takes its
    // value from the top of the block: an edge can only arrive early, never
    // late. At 48000/120 the range is [-1.333, 0.000] ms.
    //
    // This is the weak half of what a clock should promise, and ticket 03
    // tightens it to one sample. It is asserted now so that 03 has something
    // to tighten rather than something to invent.
    for (const sampleRate of RATES) {
      const quantumMs = (1000 * BLOCK) / sampleRate;
      for (const bpm of TEMPOS) {
        const edges = renderEdges(
          createClock(sampleRate),
          sampleRate,
          SECONDS,
          {
            bpm,
          },
        );
        expect(edges.length).toBeGreaterThan(500);
        for (const d of deviationMs(edges, sampleRate, bpm)) {
          expect(Math.abs(d)).toBeLessThanOrEqual(quantumMs);
        }
      }
    }
  });

  it("does not accumulate drift", () => {
    // The property that separates "the edge is quantised" from "the tempo is
    // wrong". The accumulator is exact, so the deviation at beat 1200 is drawn
    // from the same bounded set as the deviation at beat 1 - it does not grow.
    // Measured at 44100/120 over 600 s: first beat 0.000 ms, last -1.406 ms,
    // and the beat period only ever takes two values, 22016 or 22144 samples,
    // straddling the ideal 22050.
    //
    // This is why ticket 03 is a change to how the phase is *rendered* and not
    // a rewrite of the accumulator.
    for (const sampleRate of RATES) {
      const quantumMs = (1000 * BLOCK) / sampleRate;
      for (const bpm of TEMPOS) {
        const edges = renderEdges(
          createClock(sampleRate),
          sampleRate,
          SECONDS,
          {
            bpm,
          },
        );
        const dev = deviationMs(edges, sampleRate, bpm);
        expect(Math.abs(dev[dev.length - 1])).toBeLessThanOrEqual(quantumMs);

        // And the periods themselves straddle the ideal rather than sitting to
        // one side of it, which a wrong tempo could not do.
        const ideal = (sampleRate * 60) / bpm;
        const periods = beatPeriods(edges);
        expect(Math.min(...periods)).toBeLessThanOrEqual(ideal);
        expect(Math.max(...periods)).toBeGreaterThanOrEqual(ideal);
      }
    }
  });

  it("holds a constant offset between two clocks, not a growing one", () => {
    // The README used to say two `Clock` nodes *drift* unless built in the same
    // render quantum. They do not. Both increments are identical, so a clock
    // born 37 blocks late holds the same offset forever: measured at 44100/120
    // over 600 s, all 1200 beats are 4736 samples apart - 37 x 128, to the
    // sample, on the first beat and on the last.
    //
    // The distinction is the whole reason ticket 05 is possible: an offset is
    // repairable by a reset inlet, and drift would not be.
    const sampleRate = 44100;
    const late = 37;
    const first = renderEdges(createClock(sampleRate), sampleRate, SECONDS, {
      bpm: 120,
    });
    const second = renderEdges(createClock(sampleRate), sampleRate, SECONDS, {
      bpm: 120,
      startBlock: late,
    });
    const n = Math.min(first.length, second.length);
    const offsets = new Set(
      Array.from({ length: n }, (_, i) => second[i] - first[i]),
    );
    expect(n).toBeGreaterThan(1000);
    expect([...offsets]).toEqual([late * BLOCK]);
  });

  it("fires immediately and stays silent while stopped, at 44100", () => {
    // Both are covered at 16384 in `worklet.test.ts`. Restated here so the
    // rate matrix is uniform: nothing about them should depend on the rate.
    const sampleRate = 44100;
    expect(
      renderEdges(createClock(sampleRate), sampleRate, 1, { bpm: 120 })[0],
    ).toBe(0);
    expect(
      renderEdges(createClock(sampleRate), sampleRate, 1, { bpm: 0 }),
    ).toEqual([]);
  });

  it("holds the gate for `pulseWidth` of the beat, in samples", () => {
    // `worklet.test.ts` counts blocks - 31 of 64 for `pulseWidth: 0.5`. This is
    // the same quantisation from the other side, and it is the reading that
    // survives ticket 03. Measured at 44100/120: the gate is high for 22016 x
    // pulseWidth samples, plus or minus one quantum.
    for (const sampleRate of RATES) {
      const quantum = BLOCK;
      for (const pulseWidth of [0.25, 0.5, 0.75]) {
        const { highs, periods } = renderGateWidths(
          createClock(sampleRate),
          sampleRate,
          30,
          { bpm: 120, pulseWidth },
        );
        // Drop the first: it starts at sample 0 with no preceding period.
        highs.slice(1).forEach((high, i) => {
          expect(Math.abs(high - pulseWidth * periods[i])).toBeLessThanOrEqual(
            quantum,
          );
        });
      }
    }
  });
});

/**
 * Sample indices where the signal crosses from non-positive to positive.
 *
 * Sample-indexed, unlike the block-indexed helper in `worklet.test.ts`: after
 * ticket 03 a block is no longer one value and the block-indexed reading stops
 * meaning anything.
 */
function risingEdgesOf(
  signal: ArrayLike<number>,
  offset: number,
  prev: number,
) {
  const edges: number[] = [];
  for (let i = 0; i < signal.length; i++) {
    if (signal[i] > 0 && !(prev > 0)) edges.push(offset + i);
    prev = signal[i];
  }
  return { edges, prev };
}

/** Successive differences between edges, in samples. */
function beatPeriods(edges: number[]) {
  return edges.slice(1).map((edge, i) => edge - edges[i]);
}

/** Signed deviation of each edge from its ideal beat time, in milliseconds. */
function deviationMs(edges: number[], sampleRate: number, bpm: number) {
  const ideal = (sampleRate * 60) / bpm;
  return edges.map((edge, i) => ((edge - i * ideal) / sampleRate) * 1000);
}

/**
 * Render `seconds` of gate and return the rising-edge sample indices.
 *
 * Keeps no buffer: a 600 s render at 44100 is 26.5 M samples, and the whole
 * point of the net is that it is cheap enough to actually get run. `startBlock`
 * delays construction by that many blocks, for the two-clock offset test.
 */
function renderEdges(
  clock: ReturnType<typeof createClock>,
  sampleRate: number,
  seconds: number,
  params: { bpm?: number; pulseWidth?: number; startBlock?: number } = {},
) {
  const phaseOut = new Float32Array(BLOCK);
  const gateOut = new Float32Array(BLOCK);
  const blocks = Math.floor((sampleRate * seconds) / BLOCK);
  const startBlock = params.startBlock ?? 0;
  const edges: number[] = [];
  let prev = 0;
  for (let b = startBlock; b < blocks; b++) {
    clock(phaseOut, gateOut, params.bpm ?? 120, params.pulseWidth ?? 0.5);
    const found = risingEdgesOf(gateOut, b * BLOCK, prev);
    edges.push(...found.edges);
    prev = found.prev;
  }
  return edges;
}

/** Gate high-sample counts per pulse, with the beat period each one sits in. */
function renderGateWidths(
  clock: ReturnType<typeof createClock>,
  sampleRate: number,
  seconds: number,
  params: { bpm?: number; pulseWidth?: number } = {},
) {
  const phaseOut = new Float32Array(BLOCK);
  const gateOut = new Float32Array(BLOCK);
  const blocks = Math.floor((sampleRate * seconds) / BLOCK);
  const highs: number[] = [];
  const edges: number[] = [];
  let prev = 0;
  let count = 0;
  for (let b = 0; b < blocks; b++) {
    clock(phaseOut, gateOut, params.bpm ?? 120, params.pulseWidth ?? 0.5);
    for (let i = 0; i < BLOCK; i++) {
      if (gateOut[i] > 0) {
        if (!(prev > 0)) {
          edges.push(b * BLOCK + i);
          count = 0;
        }
        count++;
      } else if (prev > 0) {
        highs.push(count);
      }
      prev = gateOut[i];
    }
  }
  return { highs, periods: beatPeriods(edges) };
}

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
