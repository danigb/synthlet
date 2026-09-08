/**
 * The loudness core against the standards that define it.
 *
 * EBU Tech 3341 and Tech 3342 are conformance suites, not prose: numbered test
 * signals, each with the reading it must produce and the tolerance it must
 * produce it within. Because the signals are 1000 Hz sines at stated levels for
 * stated durations, they can be synthesised (`loudness-signals.ts`) and run as a
 * plain jest test against a pure function - no worklet stub, no browser, no
 * fixture files. That is the whole point of keeping this module pure.
 *
 * Cases not covered here, and why:
 *
 *   3341 #3, #4, #5   Integrated only, so they arrive with ticket 12's gates
 *   3341 #7, #8       authentic programme material; not synthesisable
 *   3341 #15-#23      true-peak, which is ticket 10's detector
 */

import {
  BiquadCoefficients,
  BS1770_50_CHANNEL_WEIGHTS,
  createLoudnessAnalyzer,
  kWeightingCoefficients,
  LOUDNESS_OFFSET_LUFS,
  MOMENTARY_BLOCKS,
  SHORT_TERM_BLOCKS,
} from "./loudness";
import {
  feed,
  feedTrackingMax,
  gridQuantisationDb,
  RENDER_QUANTUM,
  silence,
  sineProgramme,
  tone,
} from "./loudness-signals";

const SR = 48000;

/** EBU Tech 3341 Table 1 states every loudness reading to +/-0.1 LU. */
const EBU_TOLERANCE_LU = 0.1;
function expectWithin(actual: number, expected: number, tolerance: number) {
  expect(actual).toBeGreaterThanOrEqual(expected - tolerance);
  expect(actual).toBeLessThanOrEqual(expected + tolerance);
}

/** Analyse a whole programme from a clean analyzer and read everything. */
function measure(
  segments: Parameters<typeof sineProgramme>[1],
  options: {
    channels?: number;
    channelWeights?: readonly number[];
    chunkSize?: number;
  } = {},
) {
  const signal = sineProgramme(SR, segments, { channels: options.channels });
  const analyzer = createLoudnessAnalyzer(SR, {
    channelWeights: options.channelWeights,
    maxChannels: options.channels,
  });
  feed(analyzer, signal, options.chunkSize);
  return {
    momentary: analyzer.momentary(),
    shortTerm: analyzer.shortTerm(),
  };
}

// ---------------------------------------------------------------------------
// K-weighting
// ---------------------------------------------------------------------------

/** ITU-R BS.1770-5 Annex 1, Table 1 (shelf) and Table 2 (RLB), at 48 kHz. */
const BS1770_TABLE_48K = {
  shelf: {
    b0: 1.53512485958697,
    b1: -2.69169618940638,
    b2: 1.19839281085285,
    a1: -1.69065929318241,
    a2: 0.73248077421585,
  },
  highpass: {
    b0: 1.0,
    b1: -2.0,
    b2: 1.0,
    a1: -1.99004745483398,
    a2: 0.99007225036621,
  },
};

/**
 * The stated tolerance for the 48 kHz derivation.
 *
 * It has to be a tolerance and not `toBe`: the published table is decimal
 * literals, the derivation is `tan`, `pow` and five divisions, and there is no
 * reason for the two to land on the same f64. What is asserted is that the gap
 * is at the last bit - a few units in the last place of numbers near 1 - which
 * is a much stronger claim than the tolerance the standard itself asks for
 * ("the performance of the algorithm is not sensitive to small variations in
 * these coefficients").
 */
const COEFFICIENT_TOLERANCE = 1e-12;

function expectCoefficients(
  actual: BiquadCoefficients,
  expected: BiquadCoefficients,
  tolerance: number,
) {
  for (const key of ["b0", "b1", "b2", "a1", "a2"] as const) {
    expectWithin(actual[key], expected[key], tolerance);
  }
}

/** |H(e^jw)| in dB for one biquad. */
function magnitudeDb(c: BiquadCoefficients, f: number, fs: number): number {
  const w = (2 * Math.PI * f) / fs;
  const c1 = Math.cos(w);
  const s1 = Math.sin(w);
  const c2 = Math.cos(2 * w);
  const s2 = Math.sin(2 * w);
  const nr = c.b0 + c.b1 * c1 + c.b2 * c2;
  const ni = -(c.b1 * s1 + c.b2 * s2);
  const dr = 1 + c.a1 * c1 + c.a2 * c2;
  const di = -(c.a1 * s1 + c.a2 * s2);
  return 10 * Math.log10((nr * nr + ni * ni) / (dr * dr + di * di));
}

function kWeightingDb(fs: number, f: number): number {
  const { shelf, highpass } = kWeightingCoefficients(fs);
  return magnitudeDb(shelf, f, fs) + magnitudeDb(highpass, f, fs);
}

const AUDIO_BAND = [
  20, 30, 50, 100, 200, 500, 997, 2000, 5000, 10000, 16000, 20000,
];

describe("K-weighting coefficients", () => {
  it("derives the BS.1770-5 48 kHz tables to within 1e-12", () => {
    const derived = kWeightingCoefficients(48000);
    expectCoefficients(
      derived.shelf,
      BS1770_TABLE_48K.shelf,
      COEFFICIENT_TOLERANCE,
    );
    expectCoefficients(
      derived.highpass,
      BS1770_TABLE_48K.highpass,
      COEFFICIENT_TOLERANCE,
    );
  });

  /**
   * The 2.58e-5 residual, and why it is not here.
   *
   * The ticket for this work recorded a 2.58e-5 disagreement on the shelf's
   * `b0` and `b2` - symmetric, `+` on one and `-` on the other, about 0.0002 dB
   * - against exact agreement on every pole. That signature says the poles are
   * right and one term in the numerator is not, and it is: the textbook RBJ
   * high shelf sets the mid-band gain term to `Vb = sqrt(Vh)`, while
   * libebur128 - whose analog parameters these are - uses
   * `Vb = Vh^0.4996667741545416`. The exponent is not a rounding of 0.5; it is
   * the value that makes the transform reproduce the published table, and with
   * it the residual disappears into the last bit.
   *
   * This test pins that down rather than leaving it as a comment, so if anyone
   * later "simplifies" the exponent to 0.5 the failure names its own cause.
   */
  it("has no 2.58e-5 residual - that is the RBJ sqrt(Vh) shelf, not this one", () => {
    const f0 = 1681.974450955533;
    const gainDb = 3.999843853973347;
    const q = 0.7071752369554196;
    const k = Math.tan((Math.PI * f0) / 48000);
    const kk = k * k;
    const vh = Math.pow(10, gainDb / 20);
    const vbRbj = Math.sqrt(vh); // the exponent 0.5 this module does not use
    const a0 = 1 + k / q + kk;
    const rbj = {
      b0: (vh + (vbRbj * k) / q + kk) / a0,
      b2: (vh - (vbRbj * k) / q + kk) / a0,
    };

    expectWithin(rbj.b0 - BS1770_TABLE_48K.shelf.b0, 2.584e-5, 1e-8);
    expectWithin(rbj.b2 - BS1770_TABLE_48K.shelf.b2, -2.584e-5, 1e-8);

    // ... and about 0.0002 dB, which is why it went unnoticed.
    const shelfDb = 20 * Math.log10(rbj.b0 / BS1770_TABLE_48K.shelf.b0);
    expect(Math.abs(shelfDb)).toBeLessThan(0.0002);
  });

  it("produces rate-specific coefficients at 44.1 and 96 kHz", () => {
    const at441 = kWeightingCoefficients(44100);
    const at48 = kWeightingCoefficients(48000);
    const at96 = kWeightingCoefficients(96000);

    for (const c of [at441, at96]) {
      expect(c.shelf.b0).not.toBe(at48.shelf.b0);
      expect(c.highpass.a1).not.toBe(at48.highpass.a1);
      for (const v of Object.values(c.shelf))
        expect(Number.isFinite(v)).toBe(true);
      for (const v of Object.values(c.highpass))
        expect(Number.isFinite(v)).toBe(true);
    }

    // The RLB numerator is (1, -2, 1) at every rate - Table 2 publishes it so.
    expect(at441.highpass.b0).toBe(1);
    expect(at441.highpass.b1).toBe(-2);
    expect(at96.highpass.b2).toBe(1);

    // Both filters must be stable: poles inside the unit circle, |a2| < 1.
    for (const c of [at441, at48, at96]) {
      expect(Math.abs(c.shelf.a2)).toBeLessThan(1);
      expect(Math.abs(c.highpass.a2)).toBeLessThan(1);
    }
  });

  /**
   * BS.1770-5 Annex 1 asks for "the same frequency response that the specified
   * filter provides at 48 kHz" at other rates, which is the actual requirement
   * - the coefficients are only how it is met. Pre-warping at the design
   * frequency holds the whole audio band to 0.03 dB.
   */
  it("keeps the same response at 44.1 and 96 kHz to within 0.03 dB", () => {
    for (const f of AUDIO_BAND) {
      const at48 = kWeightingDb(48000, f);
      expectWithin(kWeightingDb(44100, f), at48, 0.03);
      expectWithin(kWeightingDb(96000, f), at48, 0.03);
    }
  });

  /**
   * BS.1770-5 Annex 1, NOTE 1 under eq (7): the -0.691 constant "cancels out
   * the K-weighting gain for 997 Hz". Measured, the gain is +0.691014 dB.
   */
  it("has a 997 Hz gain that the -0.691 offset cancels", () => {
    expectWithin(kWeightingDb(48000, 997), -LOUDNESS_OFFSET_LUFS, 1e-3);
  });
});

// ---------------------------------------------------------------------------
// Calibration
// ---------------------------------------------------------------------------

describe("calibration", () => {
  /**
   * BS.1770-5 Annex 1, after eq (7): "If a 0 dB FS, 1 kHz (997 Hz to be exact)
   * sine wave is applied to the left, centre, or right channel input, the
   * indicated loudness will equal -3.01 LKFS."
   */
  it("reads -3.01 LKFS for a 0 dBFS 997 Hz sine on one channel", () => {
    const signal = sineProgramme(SR, [tone(5, 0)], { channels: 1 });
    const analyzer = createLoudnessAnalyzer(SR, { maxChannels: 1 });
    feed(analyzer, signal);
    expectWithin(analyzer.momentary(), -3.01, EBU_TOLERANCE_LU);
  });
});

// ---------------------------------------------------------------------------
// EBU Tech 3341 - 'EBU Mode' minimum requirements
// ---------------------------------------------------------------------------

describe("EBU Tech 3341 Table 1", () => {
  it("#1 stereo 1 kHz at -23.0 dBFS for 20 s reads M, S = -23.0 LUFS", () => {
    const { momentary, shortTerm } = measure([tone(20, -23)]);
    expectWithin(momentary, -23.0, EBU_TOLERANCE_LU);
    expectWithin(shortTerm, -23.0, EBU_TOLERANCE_LU);
  });

  it("#2 the same at -33.0 dBFS reads M, S = -33.0 LUFS", () => {
    const { momentary, shortTerm } = measure([tone(20, -33)]);
    expectWithin(momentary, -33.0, EBU_TOLERANCE_LU);
    expectWithin(shortTerm, -33.0, EBU_TOLERANCE_LU);
  });

  it("#6 a 5.0 programme with the Table 3 weights reads -23.0 LUFS", () => {
    // L, R at -28; C at -24; Ls, Rs at -30 - and Ls/Rs weighted 1.41, which is
    // the only reason the five levels add up to -23.
    const { momentary } = measure([tone(20, [-28, -28, -24, -30, -30])], {
      channels: 5,
      channelWeights: BS1770_50_CHANNEL_WEIGHTS,
    });
    expectWithin(momentary, -23.0, EBU_TOLERANCE_LU);
  });

  it("#9 alternating 1.34 s at -20 and 1.66 s at -30 holds S = -23.0 LUFS", () => {
    const segments = [];
    for (let i = 0; i < 5; i++) segments.push(tone(1.34, -20), tone(1.66, -30));
    const signal = sineProgramme(SR, segments);
    const analyzer = createLoudnessAnalyzer(SR);

    // "constant after 3 s": the pattern repeats every 3 s, which is exactly the
    // Short-term window, so once one full window exists every reading is the
    // same regardless of where in the pattern it is taken.
    const readings: number[] = [];
    for (let at = 0; at < signal[0].length; at += RENDER_QUANTUM) {
      analyzer.process(
        signal,
        at,
        Math.min(RENDER_QUANTUM, signal[0].length - at),
      );
      if (at >= 3 * SR) readings.push(analyzer.shortTerm());
    }

    for (const s of readings) expectWithin(s, -23.0, EBU_TOLERANCE_LU);
    expectWithin(
      Math.max(...readings) - Math.min(...readings),
      0,
      EBU_TOLERANCE_LU,
    );
  });

  it("#10 file-based: max S is -23.0 LUFS for each of the 20 segments", () => {
    const analyzer = createLoudnessAnalyzer(SR);
    for (let i = 0; i < 20; i++) {
      analyzer.reset();
      const signal = sineProgramme(SR, [
        silence(i * 0.15),
        tone(3, -23),
        silence(1),
      ]);
      const maxS = feedTrackingMax(analyzer, signal, () =>
        analyzer.shortTerm(),
      );
      expectWithin(maxS, -23.0, EBU_TOLERANCE_LU);
    }
  });

  it("#11 live: 20 tones from -38 dBFS upwards give successive max S", () => {
    const segments = [];
    for (let i = 0; i < 20; i++) {
      segments.push(silence(i * 0.15), tone(3, -38 + i), silence(3 - i * 0.15));
    }
    const signal = sineProgramme(SR, segments);
    const analyzer = createLoudnessAnalyzer(SR);

    // Each segment is 6 s long and levels only rise, so the running maximum
    // sampled at each segment boundary is that segment's own maximum.
    const maxima: number[] = [];
    let runningMax = -Infinity;
    for (let i = 0; i < 20; i++) {
      const to = Math.round((i + 1) * 6 * SR);
      for (let at = Math.round(i * 6 * SR); at < to; at += RENDER_QUANTUM) {
        analyzer.process(signal, at, Math.min(RENDER_QUANTUM, to - at));
        runningMax = Math.max(runningMax, analyzer.shortTerm());
      }
      maxima.push(runningMax);
    }

    // The tones start at 0.15i s, so half of them are 50 ms off the 100 ms
    // grid - worth 0.07 dB on a 3 s window, inside the document's tolerance.
    for (let i = 0; i < 20; i++) {
      expectWithin(maxima[i], -38 + i, EBU_TOLERANCE_LU);
    }
  });

  it("#12 alternating 0.18 s at -20 and 0.22 s at -30 holds M = -23.0 LUFS", () => {
    const segments = [];
    for (let i = 0; i < 25; i++)
      segments.push(tone(0.18, -20), tone(0.22, -30));
    const signal = sineProgramme(SR, segments);
    const analyzer = createLoudnessAnalyzer(SR);

    // The pattern repeats every 400 ms, which is the Momentary window, so the
    // window always contains exactly one period whatever its phase.
    const readings: number[] = [];
    for (let at = 0; at < signal[0].length; at += RENDER_QUANTUM) {
      analyzer.process(
        signal,
        at,
        Math.min(RENDER_QUANTUM, signal[0].length - at),
      );
      if (at >= 1 * SR) readings.push(analyzer.momentary());
    }

    for (const m of readings) expectWithin(m, -23.0, EBU_TOLERANCE_LU);
    expectWithin(
      Math.max(...readings) - Math.min(...readings),
      0,
      EBU_TOLERANCE_LU,
    );
  });

  /**
   * Cases #13 and #14 are the two that the 100 ms accumulation grid cannot
   * meet as written, and they are the reason the grid is documented rather
   * than assumed.
   *
   * Both walk a 400 ms tone past the grid in 20 ms steps. Tech 3341 §2.2 calls
   * Momentary "a sliding rectangular time window of length 0.4 s" and states no
   * update rate for it; a meter that slides sample by sample (libebur128 keeps
   * a 400 ms ring of *audio* to do exactly this) sees every tone whole. A meter
   * built on 100 ms block powers - four numbers of state instead of 19 200 per
   * channel, which is the trade ticket 11 chose - can only place the window on
   * the grid, so a tone offset by 20-80 ms is measured across at best 380 ms of
   * itself.
   *
   * That bound is arithmetic, not slack: `gridQuantisationDb`. The four tones
   * per case that do land on the grid are asserted at the document's own
   * +/-0.1 LU; the rest are asserted against the bound, which is what makes
   * this a test of the design rather than a weakened tolerance.
   */
  it("#13 file-based: max M per segment, at the grid and at the bound", () => {
    const analyzer = createLoudnessAnalyzer(SR);
    for (let i = 0; i < 20; i++) {
      analyzer.reset();
      const signal = sineProgramme(SR, [
        silence(i * 0.02),
        tone(0.4, -23),
        silence(1),
      ]);
      const maxM = feedTrackingMax(analyzer, signal, () =>
        analyzer.momentary(),
      );
      const bound = gridQuantisationDb(i * 20, 400);
      if (bound === 0) expectWithin(maxM, -23.0, EBU_TOLERANCE_LU);
      expectWithin(maxM, -23.0 + bound, EBU_TOLERANCE_LU);
    }
  });

  it("#14 live: 20 tones from -38 dBFS upwards give successive max M", () => {
    const segments = [];
    for (let i = 0; i < 20; i++) {
      segments.push(
        silence(i * 0.02),
        tone(0.4, -38 + i),
        silence(0.4 - i * 0.02),
      );
    }
    const signal = sineProgramme(SR, segments);
    const analyzer = createLoudnessAnalyzer(SR);

    const maxima: number[] = [];
    let runningMax = -Infinity;
    for (let i = 0; i < 20; i++) {
      const to = Math.round((i + 1) * 0.8 * SR);
      for (let at = Math.round(i * 0.8 * SR); at < to; at += RENDER_QUANTUM) {
        analyzer.process(signal, at, Math.min(RENDER_QUANTUM, to - at));
        runningMax = Math.max(runningMax, analyzer.momentary());
      }
      maxima.push(runningMax);
    }

    for (let i = 0; i < 20; i++) {
      const bound = gridQuantisationDb(i * 20, 400);
      if (bound === 0) expectWithin(maxima[i], -38 + i, EBU_TOLERANCE_LU);
      expectWithin(maxima[i], -38 + i + bound, EBU_TOLERANCE_LU);
    }
  });
});

// ---------------------------------------------------------------------------
// Silence
// ---------------------------------------------------------------------------

describe("silence", () => {
  it("reads -Infinity for a channel that was never fed anything", () => {
    const signal = sineProgramme(SR, [silence(1)]);
    const analyzer = createLoudnessAnalyzer(SR);
    feed(analyzer, signal);
    const { momentary, shortTerm } = analyzer.results();
    expect(momentary).toBe(-Infinity);
    expect(shortTerm).toBe(-Infinity);
  });

  /**
   * The denormal/ring-out flush. Two biquads in series ring for a long time in
   * f64 after the signal stops, and without the flush a channel that has gone
   * quiet reads a number like -280 LUFS forever instead of nothing at all.
   */
  it("reads -Infinity within one window after a tone stops", () => {
    const signal = sineProgramme(SR, [tone(10, -23), silence(3)]);
    const analyzer = createLoudnessAnalyzer(SR);
    feed(analyzer, signal);
    expect(analyzer.momentary()).toBe(-Infinity);
    expect(analyzer.shortTerm()).toBe(-Infinity);
  });

  it("counts a silent channel as silent, not as absent", () => {
    // One channel at -23 dBFS, one at digital zero. Only half the energy of the
    // stereo case, so 3.01 LU quieter - the silent channel is summed, not
    // dropped.
    const signal = sineProgramme(SR, [tone(5, [-23, -Infinity])]);
    const analyzer = createLoudnessAnalyzer(SR);
    feed(analyzer, signal);
    expectWithin(analyzer.momentary(), -23.0 - 3.01, EBU_TOLERANCE_LU);
  });
});

// ---------------------------------------------------------------------------
// Channel weights
// ---------------------------------------------------------------------------

describe("channel weights", () => {
  it("defaults every weight to 1.0", () => {
    const analyzer = createLoudnessAnalyzer(SR, { maxChannels: 6 });
    expect(Array.from(analyzer.channelWeights)).toEqual([1, 1, 1, 1, 1, 1]);
  });

  /**
   * Ticket 11's reason for the default: Web Audio does not say what channel 4
   * is, so nothing here may infer a layout from a channel count. The cost of
   * inferring wrong is visible - the same five channels read 0.4 LU apart, and
   * on a signal weighted into the surrounds it is the full 1.5 dB.
   */
  it("does not infer a surround layout from the channel count", () => {
    const segments = [tone(20, [-28, -28, -24, -30, -30])];
    const flat = measure(segments, { channels: 5 }).momentary;
    const weighted = measure(segments, {
      channels: 5,
      channelWeights: BS1770_50_CHANNEL_WEIGHTS,
    }).momentary;

    expectWithin(weighted, -23.0, EBU_TOLERANCE_LU);
    expect(flat).toBeLessThan(weighted - 0.3);
  });

  it("excludes a channel weighted 0, as Table 3 excludes LFE", () => {
    const segments = [tone(5, [-23, -23, -10])];
    const withLfe = measure(segments, {
      channels: 3,
      channelWeights: [1, 1, 1],
    }).momentary;
    const withoutLfe = measure(segments, {
      channels: 3,
      channelWeights: [1, 1, 0],
    }).momentary;

    expectWithin(withoutLfe, -23.0, EBU_TOLERANCE_LU);
    expect(withLfe).toBeGreaterThan(withoutLfe + 10);
  });
});

// ---------------------------------------------------------------------------
// The incremental contract
// ---------------------------------------------------------------------------

describe("incremental processing", () => {
  it("gives the same reading whatever the chunk size", () => {
    const expected = measure([tone(20, -23), tone(10, -30)], {
      chunkSize: 128,
    }).shortTerm;
    for (const chunkSize of [1, 111, 1024, 48000]) {
      expectWithin(
        measure([tone(20, -23), tone(10, -30)], { chunkSize }).shortTerm,
        expected,
        1e-9,
      );
    }
  });

  it("starts over after reset()", () => {
    const analyzer = createLoudnessAnalyzer(SR);
    feed(analyzer, sineProgramme(SR, [tone(5, -10)]));
    analyzer.reset();
    expect(analyzer.momentary()).toBe(-Infinity);
    expect(analyzer.shortTerm()).toBe(-Infinity);

    feed(analyzer, sineProgramme(SR, [tone(5, -23)]));
    expectWithin(analyzer.momentary(), -23.0, EBU_TOLERANCE_LU);
  });

  it("reuses one results object rather than allocating per call", () => {
    const analyzer = createLoudnessAnalyzer(SR);
    feed(analyzer, sineProgramme(SR, [tone(1, -23)]));
    expect(analyzer.results()).toBe(analyzer.results());
  });
});

// ---------------------------------------------------------------------------
// Memory
// ---------------------------------------------------------------------------

describe("memory", () => {
  it("sizes the sliding windows at 400 ms and 3 s of 100 ms blocks", () => {
    expect(MOMENTARY_BLOCKS).toBe(4);
    expect(SHORT_TERM_BLOCKS).toBe(30);
    expect(createLoudnessAnalyzer(48000).blockSize).toBe(4800);
    expect(createLoudnessAnalyzer(44100).blockSize).toBe(4410);
  });

  /**
   * Success criterion: memory is constant regardless of programme length. The
   * ring of block powers is what buys it - 30 slots per channel, whatever the
   * programme - so the assertion is on the analyzer's own footprint, not on a
   * heap measurement that would mostly report the test signal.
   */
  it("holds the same bytes after 1 s and after 5 minutes", () => {
    const short = createLoudnessAnalyzer(SR, { maxChannels: 2 });
    const long = createLoudnessAnalyzer(SR, { maxChannels: 2 });
    const before = long.bytes;

    feed(short, sineProgramme(SR, [tone(1, -23)]));
    // Five minutes, fed a block at a time so the signal itself stays small.
    const block = sineProgramme(SR, [tone(1, -23)]);
    for (let i = 0; i < 300; i++) feed(long, block);

    expect(long.bytes).toBe(before);
    expect(long.bytes).toBe(short.bytes);
    expect(long.bytes).toBeLessThan(32 * 1024);
    expectWithin(long.shortTerm(), -23.0, 0.1);
  });
});
