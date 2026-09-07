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

/** An unconnected a-rate parameter: one value, and it is 0. That is what
 * `reset` looks like in every test that is not about resetting. */
const SILENT = new Float32Array(1);

/** The default `beatsPerBar`, for tests that are not about bars. */
const BEATS_PER_BAR = 4;

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
    clock([[phaseOut]], 60, 0.5, BEATS_PER_BAR, SILENT);
    clock([[slow]], 60, 0.5, BEATS_PER_BAR, SILENT);
    clock([[fast]], 240, 0.5, BEATS_PER_BAR, SILENT);
    // Float32 storage, so the difference of two adjacent ramp values carries
    // about seven digits - hence 9 rather than 12.
    expect(slow[1] - slow[0]).toBeCloseTo(60 / 60 / 44100, 9);
    expect(fast[1] - fast[0]).toBeCloseTo(240 / 60 / 44100, 9);
  });

  it("renders the phase with no gate output", () => {
    // `outputs[1]` is absent whenever nothing is connected to `.gate`.
    const clock = createClock(44100);
    const phaseOut = new Float32Array(BLOCK);
    expect(() =>
      clock([[phaseOut]], 120, 0.5, BEATS_PER_BAR, SILENT),
    ).not.toThrow();
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
  params: {
    bpm?: number;
    pulseWidth?: number;
    startBlock?: number;
    reset?: Float32Array;
    beatsPerBar?: number;
  } = {},
) {
  const phaseOut = new Float32Array(BLOCK);
  const gateOut = new Float32Array(BLOCK);
  const out = [[phaseOut], [gateOut]];
  const blocks = Math.floor((sampleRate * seconds) / BLOCK);
  const startBlock = params.startBlock ?? 0;
  const edges: number[] = [];
  let prev = 0;
  for (let b = startBlock; b < blocks; b++) {
    clock(
      out,
      params.bpm ?? 120,
      params.pulseWidth ?? 0.5,
      params.beatsPerBar ?? BEATS_PER_BAR,
      params.reset ?? SILENT,
    );
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
  params: {
    bpm?: number;
    pulseWidth?: number;
    reset?: Float32Array;
    beatsPerBar?: number;
  } = {},
) {
  const phaseOut = new Float32Array(BLOCK);
  const gateOut = new Float32Array(BLOCK);
  const out = [[phaseOut], [gateOut]];
  const blocks = Math.floor((sampleRate * seconds) / BLOCK);
  const highs: number[] = [];
  const edges: number[] = [];
  let prev = 0;
  let count = 0;
  for (let b = 0; b < blocks; b++) {
    clock(
      out,
      params.bpm ?? 120,
      params.pulseWidth ?? 0.5,
      params.beatsPerBar ?? BEATS_PER_BAR,
      params.reset ?? SILENT,
    );
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

describe("pulseWidth", () => {
  /**
   * `pulseWidth` declares `maxValue: 1`, and against a `[0, 1)` phase a width
   * of 1 used to mean a gate that never falls: 400 of 400 blocks high, one
   * envelope attack and then silence forever. Under `_gate.ts`'s contract a
   * trigger is the transition to positive, so a gate that never falls can
   * never trigger anything again - `1` read as "the widest gate" and delivered
   * "no more gates".
   *
   * It now means the widest gate that still retriggers, via a clamp that
   * leaves one render quantum of every beat low.
   */

  /** Tempi across the declared range. 1 BPM is exercised separately: a beat is
   * 2.6 M samples there, so a full 0...1 sweep at that tempo is not worth the
   * wall clock. */
  const SWEEP_TEMPOS = [60, 120, 400, 1000];

  it("never latches the gate, anywhere in the declared range", () => {
    // The sweep: `pulseWidth` 0 to 1 in 0.01 steps, every tempo, both rates.
    // Before the clamp, 1.0 latched at every one of them.
    for (const sampleRate of RATES) {
      for (const bpm of SWEEP_TEMPOS) {
        const beat = (sampleRate * 60) / bpm;
        for (let k = 1; k <= 100; k++) {
          const pulseWidth = k / 100;
          const { highs, lows } = gateRuns(
            createClock(sampleRate),
            sampleRate,
            (3 * beat) / sampleRate,
            { bpm, pulseWidth },
          );
          expect(highs.length).toBeGreaterThan(0);
          expect(lows.length).toBeGreaterThan(0);
          // Criterion 2: the low run is never shorter than a render quantum,
          // which is what a consumer reading its trigger once per block needs
          // in order to see the falling edge and re-arm.
          expect(Math.min(...lows)).toBeGreaterThanOrEqual(BLOCK);
        }
      }
    }
  });

  it("still retriggers at 1 BPM, where a beat is 2.6 M samples", () => {
    // The slowest tempo in range and the one where the clamp is nearly inert:
    // 1 - 128 x increment is 0.99995 at 44100. The gate still falls, and for
    // exactly a quantum.
    for (const sampleRate of RATES) {
      const beat = sampleRate * 60;
      const { lows } = gateRuns(
        createClock(sampleRate),
        sampleRate,
        (2 * beat) / sampleRate,
        { bpm: 1, pulseWidth: 1 },
      );
      expect(lows.length).toBeGreaterThan(0);
      expect(Math.min(...lows)).toBeGreaterThanOrEqual(BLOCK);
    }
  });

  it("emits no gate at all at pulseWidth 0", () => {
    // The one end of the range that was always right: 0 means no gate, and it
    // reads that way. The clamp must not turn it into a narrow one.
    for (const sampleRate of RATES) {
      for (const bpm of SWEEP_TEMPOS) {
        const { highs } = gateRuns(createClock(sampleRate), sampleRate, 1, {
          bpm,
          pulseWidth: 0,
        });
        expect(highs).toEqual([]);
      }
    }
  });

  it("is inert below 0.95 at every tempo in range", () => {
    // The test that proves this is a guard rail and not a behaviour change.
    // The clamp bites at 1 - 128 x increment, which is 0.9942 at 120 BPM and
    // 0.9516 at 1000 BPM - the lowest it goes anywhere in the declared range.
    // So below 0.95 the gate is still exactly `pulseWidth` of the beat.
    for (const sampleRate of RATES) {
      for (const bpm of SWEEP_TEMPOS) {
        const beat = (sampleRate * 60) / bpm;
        expect(1 - (BLOCK * bpm) / 60 / sampleRate).toBeGreaterThan(0.95);
        for (const pulseWidth of [0.25, 0.5, 0.75, 0.9, 0.95]) {
          const { highs } = gateRuns(
            createClock(sampleRate),
            sampleRate,
            (3 * beat) / sampleRate,
            { bpm, pulseWidth },
          );
          expect(
            Math.abs(Math.min(...highs) - pulseWidth * beat),
          ).toBeLessThanOrEqual(1);
        }
      }
    }
  });
});

describe("reset", () => {
  /**
   * A clock's phase origin is otherwise "whenever the node was constructed",
   * and nothing can change it. Two clocks built 37 blocks apart hold that
   * 4736-sample offset for as long as they live - they do not drift, so
   * nothing self-corrects, and they never converge.
   *
   * `reset` is the mechanism for them to agree. It is not a policy: nothing
   * here decides what two clocks should agree *on*.
   */

  it("puts the phase at 0 on the reset's own sample", () => {
    // Criterion 1, and only testable because the phase moves every sample: a
    // reset that could only land on a block boundary would re-introduce
    // exactly the quantisation that change removed.
    const sampleRate = 44100;
    const clock = createClock(sampleRate);
    const phaseOut = new Float32Array(BLOCK);
    const gateOut = new Float32Array(BLOCK);
    const out = [[phaseOut], [gateOut]];

    // Run far enough into the beat that the gate has already fallen: at 120
    // BPM and 44100 a beat is 172.3 blocks, so 100 blocks is phase 0.58.
    for (let b = 0; b < 100; b++) {
      clock(out, 120, 0.5, BEATS_PER_BAR, SILENT);
    }
    expect(phaseOut[0]).toBeGreaterThan(0.5);

    const reset = new Float32Array(BLOCK);
    reset[40] = 1;
    clock(out, 120, 0.5, BEATS_PER_BAR, reset);

    expect(phaseOut[39]).toBeGreaterThan(0.5);
    expect(phaseOut[40]).toBe(0);
    // And the beat restarts from there rather than resuming.
    expect(phaseOut[41]).toBeCloseTo(120 / 60 / sampleRate, 9);
    // The gate rises on that sample too, since both come off one accumulator.
    expect(gateOut[39]).toBe(0);
    expect(gateOut[40]).toBe(1);
  });

  it("treats two resets in one block as two resets", () => {
    // The reason `reset` is a-rate. At k-rate the second one is invisible.
    const clock = createClock(44100);
    const phaseOut = new Float32Array(BLOCK);
    const gateOut = new Float32Array(BLOCK);
    const out = [[phaseOut], [gateOut]];
    const reset = new Float32Array(BLOCK);
    reset[10] = 1;
    reset[60] = 1;
    clock(out, 120, 0.5, BEATS_PER_BAR, reset);
    expect(phaseOut[10]).toBe(0);
    expect(phaseOut[59]).toBeGreaterThan(0);
    expect(phaseOut[60]).toBe(0);
  });

  it("is edge triggered, not level triggered", () => {
    // Criterion 4, and the test that proves `createGateDetector` was used
    // rather than a level check: a held-high reset would otherwise pin the
    // phase at 0 and the clock would never advance again.
    const clock = createClock(44100);
    const phaseOut = new Float32Array(BLOCK);
    const gateOut = new Float32Array(BLOCK);
    const out = [[phaseOut], [gateOut]];
    const held = new Float32Array(BLOCK).fill(1);
    clock(out, 120, 0.5, BEATS_PER_BAR, held);
    expect(phaseOut[0]).toBe(0);
    expect(phaseOut[BLOCK - 1]).toBeGreaterThan(0);
    // A second block still held high does not reset again.
    clock(out, 120, 0.5, BEATS_PER_BAR, held);
    expect(phaseOut[0]).toBeGreaterThan(0);
  });

  it("does not wake a stopped clock", () => {
    // Criterion 6. A reset re-aligns a stopped clock's phase - which is worth
    // something, since it is where the clock will start from - without
    // emitting a gate. `bpm: 0` is how this library stops a clock and there is
    // no second answer to that question.
    const clock = createClock(44100);
    const phaseOut = new Float32Array(BLOCK);
    const gateOut = new Float32Array(BLOCK);
    const out = [[phaseOut], [gateOut]];
    const reset = new Float32Array(BLOCK);
    reset[10] = 1;
    clock(out, 0, 0.5, BEATS_PER_BAR, reset);
    expect([...gateOut]).toEqual(new Array(BLOCK).fill(0));
  });

  it("makes two clocks born 37 blocks apart sample-identical", () => {
    // Criterion 2, and the direct inverse of the constant-offset measurement
    // above: the same two clocks, one reset signal, and they agree from that
    // sample on - for 600 s, which is 1200 beats.
    //
    // Compared with a plain loop and one assertion rather than a matcher per
    // sample: this is 26 M samples and a jest matcher each would take minutes.
    const sampleRate = 44100;
    const late = 37;
    const resetAt = 100;
    const first = createClock(sampleRate);
    const second = createClock(sampleRate);
    const aPhase = new Float32Array(BLOCK);
    const aGate = new Float32Array(BLOCK);
    const bPhase = new Float32Array(BLOCK);
    const bGate = new Float32Array(BLOCK);
    const pulse = new Float32Array(BLOCK);
    pulse[0] = 1;
    const aOut = [[aPhase], [aGate]];
    const bOut = [[bPhase], [bGate]];

    const blocks = Math.floor((sampleRate * SECONDS) / BLOCK);
    let mismatches = 0;
    let compared = 0;
    let edges = 0;
    for (let b = 0; b < blocks; b++) {
      const reset = b === resetAt ? pulse : SILENT;
      first(aOut, 120, 0.5, BEATS_PER_BAR, reset);
      if (b >= late) second(bOut, 120, 0.5, BEATS_PER_BAR, reset);
      if (b <= resetAt) continue;
      for (let i = 0; i < BLOCK; i++) {
        if (aPhase[i] !== bPhase[i] || aGate[i] !== bGate[i]) mismatches++;
        compared++;
      }
      if (aGate[0] > 0) edges++;
    }
    expect(mismatches).toBe(0);
    expect(compared).toBeGreaterThan(20_000_000);
    expect(edges).toBeGreaterThan(0);
  });

  it("changes nothing while it is unconnected", () => {
    // Criterion 5. The default is a length-1 array holding 0, and the whole
    // clamp-and-detect path has to be inert against it.
    for (const sampleRate of RATES) {
      for (const bpm of TEMPOS) {
        const withReset = renderEdges(createClock(sampleRate), sampleRate, 30, {
          bpm,
          reset: SILENT,
        });
        const withoutParam = renderEdges(
          createClock(sampleRate),
          sampleRate,
          30,
          { bpm },
        );
        expect(withReset).toEqual(withoutParam);
      }
    }
  });
});

describe("bars", () => {
  /**
   * A bar cannot be recovered downstream, which is the whole argument for it
   * being here. `Euclid` subdivides a clock by multiplying its phase - a pure
   * function of the instantaneous value - but the bar position is a *count*,
   * and the beat ramp during beat 1 is bit-identical to the ramp during beat
   * 3. A consumer that wanted bars would have to count wraps and choose an
   * origin, and two consumers choosing privately disagree about where bar 1
   * is, permanently and silently.
   *
   * The change is additive: outputs 0 and 1 were verified sample-identical to
   * the pre-ticket build over 60 s across bpm {0, 1, 120, 137.3, 1000} x
   * pulseWidth {0, 0.25, 0.5, 1} x beatsPerBar {0, 4} at 44100 and 48000. That
   * comparison is not kept as a test because one side of it stopped existing.
   */

  it("fires the downbeat once per bar, aligned with the beat gate", () => {
    // Criterion 2, and the invariant is asserted directly rather than by
    // counting: both gates take their width from the same `pulseWidth` and the
    // same phase at the same sample, so they rise and fall together.
    const sampleRate = 44100;
    const beatsPerBar = 4;
    const { gate, downbeat } = renderAll(
      createClock(sampleRate),
      sampleRate,
      12,
      { bpm: 120, beatsPerBar },
    );

    const gateEdges = risingEdgesOf(gate, 0, 0).edges;
    const downEdges = risingEdgesOf(downbeat, 0, 0).edges;
    expect(gateEdges.length).toBeGreaterThan(20);
    // Exactly every 4th beat gate has a coincident downbeat.
    expect(downEdges).toEqual(
      gateEdges.filter((_, i) => i % beatsPerBar === 0),
    );

    // `downbeat > 0` implies `gate > 0`, at every sample.
    for (let i = 0; i < downbeat.length; i++) {
      if (downbeat[i] > 0) expect(gate[i]).toBeGreaterThan(0);
    }
  });

  it("starts on a downbeat, and a reset returns it to one", () => {
    // Criterion 3. The beat counter starts at 0 and the phase starts at 0, so
    // the first beat of a clock's life is beat 0 of bar 0. A reset zeroes the
    // counter as well as the phase - otherwise `reset` would mean two
    // different things depending on which output you watched.
    const sampleRate = 44100;
    const clock = createClock(sampleRate);
    const phaseOut = new Float32Array(BLOCK);
    const gateOut = new Float32Array(BLOCK);
    const barOut = new Float32Array(BLOCK);
    const downOut = new Float32Array(BLOCK);
    const out = [[phaseOut], [gateOut], [barOut], [downOut]];

    clock(out, 120, 0.5, 4, SILENT);
    expect(downOut[0]).toBe(1);
    expect(barOut[0]).toBe(0);

    // Run into the middle of bar 0's third beat, where there is no downbeat.
    for (let b = 0; b < 400; b++) clock(out, 120, 0.5, 4, SILENT);
    expect(downOut[0]).toBe(0);
    expect(barOut[0]).toBeGreaterThan(0);

    const reset = new Float32Array(BLOCK);
    reset[30] = 1;
    clock(out, 120, 0.5, 4, reset);
    expect(downOut[29]).toBe(0);
    expect(downOut[30]).toBe(1);
    expect(barOut[30]).toBe(0);
  });

  it("emits a bar phase that wraps exactly where the downbeat rises", () => {
    // Criterion 4, measured. It is proved by *consumption* in
    // `packages/euclid/src/clock-skew.test.ts`, which feeds `.bar` to a real
    // `Euclid` and counts the steps - that is the claim that a bar phase is
    // the same kind of object as a beat phase.
    const sampleRate = 44100;
    const { bar, downbeat } = renderAll(
      createClock(sampleRate),
      sampleRate,
      12,
      {
        bpm: 120,
        beatsPerBar: 4,
      },
    );

    const wraps = bar.flatMap((v, i) => (i > 0 && v < bar[i - 1] ? [i] : []));
    const downEdges = risingEdgesOf(downbeat, 0, 0).edges;
    // The first downbeat is at sample 0, which is not a wrap.
    expect(wraps).toEqual(downEdges.slice(1));
    expect(wraps.length).toBeGreaterThan(4);

    // Monotonic between wraps, and `[0, 1)`.
    expect(bar.every((v) => v >= 0 && v < 1)).toBe(true);
    for (let i = 1; i < wraps[0]; i++) {
      expect(bar[i]).toBeGreaterThan(bar[i - 1]);
    }
    // One bar is `beatsPerBar` beats long.
    expect(wraps[1] - wraps[0]).toBe(4 * ((sampleRate * 60) / 120));
  });

  it("is inert at beatsPerBar 0", () => {
    // Criterion 5: no bar structure, both new outputs silent, no division and
    // no NaN. Outputs 0 and 1 are unaffected, which the additive comparison
    // above covered across the whole matrix.
    const sampleRate = 44100;
    const { gate, bar, downbeat } = renderAll(
      createClock(sampleRate),
      sampleRate,
      4,
      { bpm: 120, beatsPerBar: 0 },
    );
    expect(bar.every((v) => v === 0)).toBe(true);
    expect(downbeat.every((v) => v === 0)).toBe(true);
    expect(risingEdgesOf(gate, 0, 0).edges.length).toBeGreaterThan(4);
  });

  it("re-phases cleanly when beatsPerBar changes mid-run", () => {
    // Criterion 6. The counter is beats-since-start and the bar position is
    // `beats % beatsPerBar` taken at the boundary, so a change re-phases the
    // grid rather than emitting a spurious downbeat or swallowing one. Both
    // the position and the divisor are latched at the beat boundary: reading
    // the divisor live would jump the bar phase mid-beat, which a downstream
    // `Euclid` reads as a wrap.
    const sampleRate = 44100;
    const beat = (sampleRate * 60) / 120;
    const clock = createClock(sampleRate);
    const out = [
      [new Float32Array(BLOCK)],
      [new Float32Array(BLOCK)],
      [new Float32Array(BLOCK)],
      [new Float32Array(BLOCK)],
    ];
    const bar: number[] = [];
    const downbeat: number[] = [];
    const blocks = Math.floor((sampleRate * 16) / BLOCK);
    // Change at a block that lands mid-beat, not on a boundary.
    const changeAt = 400;
    for (let b = 0; b < blocks; b++) {
      clock(out, 120, 0.5, b < changeAt ? 4 : 3, SILENT);
      bar.push(...out[2][0]);
      downbeat.push(...out[3][0]);
    }

    const edges = risingEdgesOf(downbeat, 0, 0).edges;
    const beatsAt = edges.map((e) => Math.round(e / beat));
    // Every 4 beats before the change, every 3 after, and nothing in between:
    // no downbeat lands off a beat boundary.
    edges.forEach((e) => expect(Math.abs(e % beat)).toBeLessThanOrEqual(1));
    const changeBeat = (changeAt * BLOCK) / beat;
    const before = beatsAt.filter((b) => b < changeBeat);
    const after = beatsAt.filter((b) => b > changeBeat + 1);
    expect(before.every((b) => b % 4 === 0)).toBe(true);
    expect(after.every((b) => b % 3 === 0)).toBe(true);
    expect(after.length).toBeGreaterThan(3);
    // The bar phase never jumps backwards except at a downbeat.
    const wraps = bar.flatMap((v, i) => (i > 0 && v < bar[i - 1] ? [i] : []));
    expect(wraps).toEqual(edges.slice(1));
  });

  it("stops the bar outputs when the clock is stopped", () => {
    // Criterion 7, consistent with the existing rule that a stopped clock
    // emits no gate rather than holding one open.
    const { gate, downbeat } = renderAll(createClock(44100), 44100, 1, {
      bpm: 0,
      beatsPerBar: 4,
    });
    expect(gate.every((v) => v === 0)).toBe(true);
    expect(downbeat.every((v) => v === 0)).toBe(true);
  });
});

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
  params: {
    bpm?: number;
    pulseWidth?: number;
    reset?: Float32Array;
    beatsPerBar?: number;
  } = {},
) {
  const phase: number[] = [];
  const phaseOut = new Float32Array(BLOCK);
  const out = [[phaseOut]];
  const blocks = Math.floor((sampleRate * seconds) / BLOCK);
  for (let b = 0; b < blocks; b++) {
    clock(
      out,
      params.bpm ?? 120,
      params.pulseWidth ?? 0.5,
      params.beatsPerBar ?? BEATS_PER_BAR,
      params.reset ?? SILENT,
    );
    phase.push(...phaseOut);
  }
  return phase;
}

/**
 * Complete high and low runs of the gate, in samples.
 *
 * Drops the leading and trailing partial runs: the first gate starts at sample
 * 0 with nothing before it, and the render stops mid-run.
 */
function gateRuns(
  clock: ReturnType<typeof createClock>,
  sampleRate: number,
  seconds: number,
  params: {
    bpm?: number;
    pulseWidth?: number;
    reset?: Float32Array;
    beatsPerBar?: number;
  } = {},
) {
  const phaseOut = new Float32Array(BLOCK);
  const gateOut = new Float32Array(BLOCK);
  const out = [[phaseOut], [gateOut]];
  const blocks = Math.floor((sampleRate * seconds) / BLOCK);
  const highs: number[] = [];
  const lows: number[] = [];
  let current = -1;
  let length = 0;
  for (let b = 0; b < blocks; b++) {
    clock(
      out,
      params.bpm ?? 120,
      params.pulseWidth ?? 0.5,
      params.beatsPerBar ?? BEATS_PER_BAR,
      params.reset ?? SILENT,
    );
    for (let i = 0; i < BLOCK; i++) {
      const value = gateOut[i] > 0 ? 1 : 0;
      if (value !== current) {
        if (current === 1) highs.push(length);
        if (current === 0) lows.push(length);
        current = value;
        length = 0;
      }
      length++;
    }
  }
  return { highs, lows };
}

/** All four outputs of a short render, flattened. Short by construction: this
 * keeps every sample, so it is for the property tests rather than the timing
 * ones. */
function renderAll(
  clock: ReturnType<typeof createClock>,
  sampleRate: number,
  seconds: number,
  params: { bpm?: number; pulseWidth?: number; beatsPerBar?: number } = {},
) {
  const out = [
    [new Float32Array(BLOCK)],
    [new Float32Array(BLOCK)],
    [new Float32Array(BLOCK)],
    [new Float32Array(BLOCK)],
  ];
  const phase: number[] = [];
  const gate: number[] = [];
  const bar: number[] = [];
  const downbeat: number[] = [];
  const blocks = Math.floor((sampleRate * seconds) / BLOCK);
  for (let b = 0; b < blocks; b++) {
    clock(
      out,
      params.bpm ?? 120,
      params.pulseWidth ?? 0.5,
      params.beatsPerBar ?? BEATS_PER_BAR,
      SILENT,
    );
    phase.push(...out[0][0]);
    gate.push(...out[1][0]);
    bar.push(...out[2][0]);
    downbeat.push(...out[3][0]);
  }
  return { phase, gate, bar, downbeat };
}
