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

describe("createClock", () => {
  /**
   * The two tests that stood here until clock ticket 03 were oracle tests: they
   * re-implemented the block-constant expression the engine shipped with and
   * asserted equality with it. They were written as ticket 01's proof that
   * extracting the engine out of the processor changed nothing, and they did
   * that job. Once the engine renders per sample they can only assert the
   * defect, so they are gone rather than adjusted - do not restore them.
   *
   * What replaces them is the property they were reaching for.
   */
  it("emits a ramp that rises every sample and wraps once per beat", () => {
    for (const sampleRate of RATES) {
      const samplesPerBeat = (sampleRate * 60) / 120;
      const phase = renderPhase(createClock(sampleRate), sampleRate, 3, {
        bpm: 120,
      });

      const wraps = phase.flatMap((v, i) =>
        i > 0 && v < phase[i - 1] ? [i] : [],
      );
      // A wrap every beat, on the sample it is due on.
      wraps.forEach((wrap, i) => {
        expect(Math.abs(wrap - (i + 1) * samplesPerBeat)).toBeLessThanOrEqual(
          1,
        );
      });
      expect(wraps.length).toBeGreaterThan(2);

      // Strictly increasing everywhere else. At 44100/120 that is 22050
      // distinct values in a beat, not the 172 the block fill produced.
      const beat = phase.slice(0, wraps[0]);
      expect(new Set(beat).size).toBe(beat.length);
      for (let i = 1; i < beat.length; i++) {
        expect(beat[i]).toBeGreaterThan(beat[i - 1]);
      }

      // `[0, 1)`: nothing emits exactly 1.0. The old `> 1` wrap let it through
      // for a whole block, and that plateau is what `Euclid` failed to see as
      // a step boundary.
      expect(phase.every((v) => v >= 0 && v < 1)).toBe(true);
    }
  });

  it("rises the gate on the sample the phase wraps", () => {
    // One accumulator, both outputs read from it at the same sample, so they
    // cannot describe different instants. This is defect 2 of ticket 03 closed
    // by construction rather than by adjustment.
    for (const sampleRate of RATES) {
      const phase = renderPhase(createClock(sampleRate), sampleRate, 3, {
        bpm: 120,
      });
      const wraps = phase.flatMap((v, i) =>
        i > 0 && v < phase[i - 1] ? [i] : [],
      );
      const edges = renderEdges(createClock(sampleRate), sampleRate, 3, {
        bpm: 120,
      });
      // Plus one at startup: a clock fires its first beat immediately.
      expect(edges).toEqual([0, ...wraps]);
    }
  });

  it("holds the gate for `pulseWidth` of the beat", () => {
    const sampleRate = 44100;
    for (const pulseWidth of [0.25, 0.5, 0.75]) {
      const { highs, periods } = renderGateWidths(
        createClock(sampleRate),
        sampleRate,
        10,
        { bpm: 120, pulseWidth },
      );
      highs.slice(1).forEach((high, i) => {
        expect(Math.abs(high - pulseWidth * periods[i])).toBeLessThanOrEqual(1);
      });
    }
  });

  it("emits no gate while it is stopped", () => {
    // bpm 0 never advances the phase, so a phase-derived gate would otherwise
    // latch open at 0 forever. The guard is on the increment, not the tempo.
    expect(renderEdges(createClock(44100), 44100, 1, { bpm: 0 })).toEqual([]);
  });

  it("re-derives the increment when the tempo changes", () => {
    const clock = createClock(44100);
    const phaseOut = new Float32Array(BLOCK);
    const slow = new Float32Array(BLOCK);
    const fast = new Float32Array(BLOCK);
    clock(phaseOut, undefined, 60, 0.5);
    clock(slow, undefined, 60, 0.5);
    clock(fast, undefined, 240, 0.5);
    // Float32 storage, so the difference of two adjacent ramp values carries
    // about seven digits - hence 9 rather than 12.
    expect(slow[1] - slow[0]).toBeCloseTo(60 / 60 / 44100, 9);
    expect(fast[1] - fast[0]).toBeCloseTo(240 / 60 / 44100, 9);
  });

  it("renders the phase with no gate output", () => {
    // `outputs[1]` is absent whenever nothing is connected to `.gate`.
    const clock = createClock(44100);
    const phaseOut = new Float32Array(BLOCK);
    expect(() => clock(phaseOut, undefined, 120, 0.5)).not.toThrow();
    expect(phaseOut[1]).toBeGreaterThan(phaseOut[0]);
  });
});

/**
 * Every timing bound below was measured against this engine, at the rate and
 * tempo named next to it, over 600 s. Reproduce before trusting.
 *
 * 600 s is 26.5 M samples per render and the whole set costs well under a
 * second of wall clock, because nothing retains a buffer: `renderEdges` scans
 * each block for edges and keeps only the indices.
 */
/** The two rates a browser actually hands you, and neither divides. 16384 -
 * the rate `worklet.test.ts` runs at - is deliberately absent: see above. */
const RATES = [44100, 48000];
const TEMPOS = [60, 120, 137.3, 400];
const SECONDS = 600;

describe("timing", () => {
  it("keeps every beat within one sample of its ideal time", () => {
    // Before clock ticket 03 this bound was one render quantum: measured at
    // 44100/120 over 600 s, the deviation ran [-2.902, 0.000] ms - one-sided
    // negative, because the block-constant fill took its value from the top of
    // the block and an edge could only arrive early.
    //
    // Rendering per sample makes it [-1, 0] samples: [-0.023, 0.000] ms at
    // 44100, [-0.021, 0.000] at 48000. A factor of 128, and the residue is a
    // rounding rather than a bias - at rates where the beat divides (400 BPM
    // at 44100) it is exactly zero. Beating one sample needs a fractional
    // sub-sample output and a consumer that could read one; nothing in this
    // library can, which is why the bound is written in samples.
    for (const sampleRate of RATES) {
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
        const ideal = (sampleRate * 60) / bpm;
        edges.forEach((edge, i) => {
          expect(Math.abs(edge - i * ideal)).toBeLessThanOrEqual(1);
        });
      }
    }
  });

  it("does not accumulate drift", () => {
    // The property that separates "the edge is quantised" from "the tempo is
    // wrong", and the one thing the block-constant implementation got right:
    // the accumulator is exact, so the deviation at beat 1200 is drawn from
    // the same bounded set as the deviation at beat 1 - it does not grow.
    // This must not regress; it is why ticket 03 changed how the phase is
    // *rendered* and not how it is accumulated.
    for (const sampleRate of RATES) {
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
        const oneSampleMs = 1000 / sampleRate;
        expect(Math.abs(dev[dev.length - 1])).toBeLessThanOrEqual(oneSampleMs);

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
    // This used to read 31 of 64 blocks for 0.5 in `worklet.test.ts` - the
    // same quantity seen through the quantisation ticket 03 removed. Now it is
    // `pulseWidth` x the beat period to within a sample.
    for (const sampleRate of RATES) {
      const quantum = 1;
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

/**
 * Render `seconds` of phase into one flat array.
 *
 * Whole blocks, not one sample per block: after clock ticket 03 the output is
 * no longer constant within a block, and reading `phaseOut[0]` would be
 * measuring one value in 128. Used only by the short renders - the timing
 * assertions go through `renderEdges`, which keeps no buffer.
 */
function renderPhase(
  clock: ReturnType<typeof createClock>,
  sampleRate: number,
  seconds: number,
  params: { bpm?: number; pulseWidth?: number } = {},
) {
  const phase: number[] = [];
  const phaseOut = new Float32Array(BLOCK);
  const blocks = Math.floor((sampleRate * seconds) / BLOCK);
  for (let b = 0; b < blocks; b++) {
    clock(phaseOut, undefined, params.bpm ?? 120, params.pulseWidth ?? 0.5);
    phase.push(...phaseOut);
  }
  return phase;
}
