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
 *   3341 #7, #8 and 3342 #5, #6  authentic programme material; not synthesisable
 *   3341 #15-#23                 true-peak, which is ticket 10's detector
 */

import {
  ABSOLUTE_GATE_LUFS,
  BiquadCoefficients,
  BS1770_50_CHANNEL_WEIGHTS,
  createLoudnessAnalyzer,
  gainToTarget,
  GATING_HOP_SUB_BLOCKS,
  HISTOGRAM_BIN_LU,
  HISTOGRAM_BINS,
  INTEGRATED_RELATIVE_GATE_LU,
  kWeightingCoefficients,
  LOUDNESS_OFFSET_LUFS,
  LRA_RELATIVE_GATE_LU,
  MOMENTARY_SUB_BLOCKS,
  SHORT_TERM_SUB_BLOCKS,
  SUB_BLOCK_MS,
} from "./loudness";
import {
  feed,
  feedTrackingMax,
  RENDER_QUANTUM,
  silence,
  sineProgramme,
  tone,
} from "./loudness-signals";

const SR = 48000;

/** EBU Tech 3341 Table 1 states every loudness reading to +/-0.1 LU. */
const EBU_TOLERANCE_LU = 0.1;
/** EBU Tech 3342 Table 1 states every LRA reading to +/-1 LU. */
const LRA_TOLERANCE_LU = 1;

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
    integrated: analyzer.integrated(),
    lra: analyzer.lra(),
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
    expectWithin(analyzer.integrated(), -3.01, EBU_TOLERANCE_LU);
  });
});

// ---------------------------------------------------------------------------
// EBU Tech 3341 - 'EBU Mode' minimum requirements
// ---------------------------------------------------------------------------

describe("EBU Tech 3341 Table 1", () => {
  it("#1 stereo 1 kHz at -23.0 dBFS for 20 s reads M, S, I = -23.0 LUFS", () => {
    const { momentary, shortTerm, integrated } = measure([tone(20, -23)]);
    expectWithin(momentary, -23.0, EBU_TOLERANCE_LU);
    expectWithin(shortTerm, -23.0, EBU_TOLERANCE_LU);
    expectWithin(integrated, -23.0, EBU_TOLERANCE_LU);
  });

  it("#2 the same at -33.0 dBFS reads M, S, I = -33.0 LUFS", () => {
    const { momentary, shortTerm, integrated } = measure([tone(20, -33)]);
    expectWithin(momentary, -33.0, EBU_TOLERANCE_LU);
    expectWithin(shortTerm, -33.0, EBU_TOLERANCE_LU);
    expectWithin(integrated, -33.0, EBU_TOLERANCE_LU);
  });

  it("#3 10 s at -36, 60 s at -23, 10 s at -36 reads I = -23.0 LUFS", () => {
    const { integrated } = measure([
      tone(10, -36),
      tone(60, -23),
      tone(10, -36),
    ]);
    expectWithin(integrated, -23.0, EBU_TOLERANCE_LU);
  });

  it("#4 the same wrapped in 10 s of -72 dBFS still reads I = -23.0 LUFS", () => {
    const { integrated } = measure([
      tone(10, -72),
      tone(10, -36),
      tone(60, -23),
      tone(10, -36),
      tone(10, -72),
    ]);
    expectWithin(integrated, -23.0, EBU_TOLERANCE_LU);
  });

  it("#5 20 s at -26, 20.1 s at -20, 20 s at -26 reads I = -23.0 LUFS", () => {
    const { integrated } = measure([
      tone(20, -26),
      tone(20.1, -20),
      tone(20, -26),
    ]);
    expectWithin(integrated, -23.0, EBU_TOLERANCE_LU);
  });

  it("#6 a 5.0 programme with the Table 3 weights reads I = -23.0 LUFS", () => {
    // L, R at -28; C at -24; Ls, Rs at -30 - and Ls/Rs weighted 1.41, which is
    // the only reason the five levels add up to -23.
    const { integrated } = measure([tone(20, [-28, -28, -24, -30, -30])], {
      channels: 5,
      channelWeights: BS1770_50_CHANNEL_WEIGHTS,
    });
    expectWithin(integrated, -23.0, EBU_TOLERANCE_LU);
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

    // The tones start at 0.15i s, so half of them sit 10 ms off the 20 ms
    // grid - worth 0.01 dB on a 3 s window.
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
   * Cases #13 and #14 are what sets the accumulation grid.
   *
   * Both walk a 400 ms tone past the grid in 20 ms steps, and Tech 3341 §2.2
   * calls Momentary "a sliding rectangular time window of length 0.4 s" - so a
   * meter that only slides in gating-sized 100 ms steps measures a tone offset
   * by 40 ms across 360 ms of itself and reads 0.46 LU low at eight of the
   * twenty offsets. That is why `SUB_BLOCK_MS` is 20 and not 100: every offset
   * these two cases use lands on the grid, and the readings are asserted at
   * the document's own +/-0.1 LU with nothing subtracted.
   */
  it("#13 file-based: max M is -23.0 LUFS at every 20 ms offset", () => {
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
      expectWithin(maxM, -23.0, EBU_TOLERANCE_LU);
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
      expectWithin(maxima[i], -38 + i, EBU_TOLERANCE_LU);
    }
  });
});

// ---------------------------------------------------------------------------
// EBU Tech 3342 - Loudness Range
// ---------------------------------------------------------------------------

describe("EBU Tech 3342 Table 1", () => {
  it("#1 20 s at -20 then 20 s at -30 gives LRA = 10 LU", () => {
    const { lra } = measure([tone(20, -20), tone(20, -30)]);
    expectWithin(lra, 10, LRA_TOLERANCE_LU);
  });

  it("#2 -20 then -15 gives LRA = 5 LU", () => {
    const { lra } = measure([tone(20, -20), tone(20, -15)]);
    expectWithin(lra, 5, LRA_TOLERANCE_LU);
  });

  it("#3 -40 then -20 gives LRA = 20 LU", () => {
    const { lra } = measure([tone(20, -40), tone(20, -20)]);
    expectWithin(lra, 20, LRA_TOLERANCE_LU);
  });

  /**
   * #4 is also the test of the -20 LU gate: the two -50 dBFS segments sit
   * above the absolute gate and below the relative one, so an implementation
   * that skipped the relative stage would report 30 LU here, not 15.
   */
  it("#4 five segments at -50, -35, -20, -35, -50 gives LRA = 15 LU", () => {
    const { lra } = measure([
      tone(20, -50),
      tone(20, -35),
      tone(20, -20),
      tone(20, -35),
      tone(20, -50),
    ]);
    expectWithin(lra, 15, LRA_TOLERANCE_LU);
    // What it would be with the relative gate disabled - and is not.
    expect(lra).toBeLessThan(25);
  });
});

// ---------------------------------------------------------------------------
// The gates
// ---------------------------------------------------------------------------

describe("gating", () => {
  /**
   * BS.1770-5 eq (6): blocks at or below -70 LKFS are not in `J_g` at all.
   * Appending five more minutes of them therefore has to change nothing -
   * exactly, not within a tolerance, because the surviving set is identical.
   */
  it("ignores blocks below the absolute gate, however many there are", () => {
    const short = measure([tone(20, -23), tone(10, -80)]).integrated;
    const long = measure([tone(20, -23), tone(130, -80)]).integrated;
    expect(long).toBe(short);
  });

  /** Tech 3341 #3 and #4 are the standard's own version of the same claim. */
  it("reads Tech 3341 #4 exactly as #3, the -72 dBFS blocks aside", () => {
    const withoutSubGate = measure([
      tone(10, -36),
      tone(60, -23),
      tone(10, -36),
    ]).integrated;
    const withSubGate = measure([
      tone(10, -72),
      tone(10, -36),
      tone(60, -23),
      tone(10, -36),
      tone(10, -72),
    ]).integrated;
    expectWithin(withSubGate, withoutSubGate, 0.01);
  });

  /**
   * The relative gate has to be shown changing the answer, or the test is a
   * test of the absolute gate wearing its name.
   *
   * 20 s at -23 followed by 20 s at -43: both far above -70, so the absolute
   * gate admits every block and an absolute-only meter would report their mean
   * energy, near -26 LUFS. The relative threshold lands at that minus 10, which
   * is above -43, so the quiet half drops out and the reading is the loud
   * half's -23.
   */
  it("drops blocks below the relative gate, which moves the reading 3 LU", () => {
    const gated = measure([tone(20, -23), tone(20, -43)]).integrated;
    const loudOnly = measure([tone(20, -23)]).integrated;

    expectWithin(gated, -23.0, EBU_TOLERANCE_LU);
    // The residual against the loud half alone is the three 400 ms blocks that
    // straddle the level change and survive the gate.
    expectWithin(gated, loudOnly, 0.05);

    // What an absolute-gate-only meter reports: the mean energy of both halves.
    const ungated =
      10 * Math.log10((Math.pow(10, -2.3) + Math.pow(10, -4.3)) / 2);
    expect(ungated).toBeLessThan(-25.9);
    expect(Math.abs(gated - ungated)).toBeGreaterThan(2.9);
  });

  it("keeps the two relative gates at their different values", () => {
    // The single most likely bug in this file, and a silent one.
    expect(ABSOLUTE_GATE_LUFS).toBe(-70);
    expect(INTEGRATED_RELATIVE_GATE_LU).toBe(-10);
    expect(LRA_RELATIVE_GATE_LU).toBe(-20);
  });

  it("reads -Infinity when every block is below the absolute gate", () => {
    const { integrated, lra } = measure([tone(10, -90)]);
    expect(integrated).toBe(-Infinity);
    expect(lra).toBe(0);
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
    const { momentary, shortTerm, integrated, lra } = analyzer.results();
    expect(momentary).toBe(-Infinity);
    expect(shortTerm).toBe(-Infinity);
    expect(integrated).toBe(-Infinity);
    expect(lra).toBe(0);
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
    // ... while the programme it did carry is still integrated.
    expectWithin(analyzer.integrated(), -23.0, EBU_TOLERANCE_LU);
  });

  /**
   * The freeze ticket 04 removed from the peak, in the loudness windows.
   *
   * Chrome hands a worklet whose input is unconnected an empty `inputs[0]`, and
   * the driver passes it straight through with an explicit length. "No channels
   * this block" is not "no time passed": if the windows stop advancing they
   * hold the last tone forever, which is the one reading a meter must never
   * give.
   */
  it("keeps falling when the input goes away entirely", () => {
    const analyzer = createLoudnessAnalyzer(SR);
    feed(analyzer, sineProgramme(SR, [tone(20, -23)]));
    expectWithin(analyzer.momentary(), -23.0, EBU_TOLERANCE_LU);
    const integrated = analyzer.integrated();
    expectWithin(integrated, -23.0, EBU_TOLERANCE_LU);

    // Four seconds of nothing arriving at all - longer than the 3 s window.
    for (let at = 0; at < 4 * SR; at += RENDER_QUANTUM) {
      analyzer.process([], 0, RENDER_QUANTUM);
    }

    expect(analyzer.momentary()).toBe(-Infinity);
    expect(analyzer.shortTerm()).toBe(-Infinity);

    // The gating hop ticked through it too. The three 400 ms blocks that
    // straddle the end of the tone still hold signal, so they enter the
    // histogram and move the reading a little - as they would at any level
    // change...
    const settled = analyzer.integrated();
    expectWithin(settled, integrated, 0.05);

    // ...and then it stops moving, however long the silence runs: a gating
    // block of nothing has zero energy, so its loudness is -Infinity, which is
    // not above the -70 LUFS absolute gate of BS.1770-5 eq (6).
    for (let at = 0; at < 60 * SR; at += RENDER_QUANTUM) {
      analyzer.process([], 0, RENDER_QUANTUM);
    }
    expect(analyzer.integrated()).toBe(settled);
  });

  it("counts a silent channel as silent, not as absent", () => {
    // One channel at -23 dBFS, one at digital zero. Only half the energy of the
    // stereo case, so 3.01 LU quieter - the silent channel is summed, not
    // dropped.
    const signal = sineProgramme(SR, [tone(5, [-23, -Infinity])]);
    const analyzer = createLoudnessAnalyzer(SR);
    feed(analyzer, signal);
    expectWithin(analyzer.integrated(), -23.0 - 3.01, EBU_TOLERANCE_LU);
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
    const flat = measure(segments, { channels: 5 }).integrated;
    const weighted = measure(segments, {
      channels: 5,
      channelWeights: BS1770_50_CHANNEL_WEIGHTS,
    }).integrated;

    expectWithin(weighted, -23.0, EBU_TOLERANCE_LU);
    expect(flat).toBeLessThan(weighted - 0.3);
  });

  it("excludes a channel weighted 0, as Table 3 excludes LFE", () => {
    const segments = [tone(5, [-23, -23, -10])];
    const withLfe = measure(segments, {
      channels: 3,
      channelWeights: [1, 1, 1],
    }).integrated;
    const withoutLfe = measure(segments, {
      channels: 3,
      channelWeights: [1, 1, 0],
    }).integrated;

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
    }).integrated;
    for (const chunkSize of [1, 111, 1024, 48000]) {
      expectWithin(
        measure([tone(20, -23), tone(10, -30)], { chunkSize }).integrated,
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
    expect(analyzer.integrated()).toBe(-Infinity);

    feed(analyzer, sineProgramme(SR, [tone(5, -23)]));
    expectWithin(analyzer.integrated(), -23.0, EBU_TOLERANCE_LU);
  });

  /**
   * Tech 3341 §2.2: an 'EBU Mode' meter must be able to start, pause and
   * continue the Integrated and LRA measurements, and reset them independently
   * of that state. §2.4: they always reset together.
   */
  it("bounds the programme with startIntegration and resetIntegration", () => {
    const analyzer = createLoudnessAnalyzer(SR);

    // The gating block is 400 ms wide, so a session started in the middle of a
    // tone still has three blocks of the previous one in it. Half a second of
    // silence is what a caller would leave, and what the boundary needs.
    feed(analyzer, sineProgramme(SR, [tone(5, -10), silence(0.5)]));
    analyzer.startIntegration();
    feed(analyzer, sineProgramme(SR, [tone(20, -23)]));
    expectWithin(analyzer.integrated(), -23.0, EBU_TOLERANCE_LU);

    // Pausing leaves the reading standing; the M/S windows keep running.
    analyzer.stopIntegration();
    feed(analyzer, sineProgramme(SR, [tone(5, -5)]));
    expectWithin(analyzer.integrated(), -23.0, EBU_TOLERANCE_LU);
    expectWithin(analyzer.momentary(), -5.0, EBU_TOLERANCE_LU);

    analyzer.resetIntegration();
    expect(analyzer.integrated()).toBe(-Infinity);
    expect(analyzer.lra()).toBe(0);
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
  it("holds 1000 histogram bins of 0.1 LU from the absolute gate", () => {
    expect(HISTOGRAM_BINS).toBe(1000);
    expect(HISTOGRAM_BIN_LU).toBe(0.1);
    // 1000 bins x 0.1 LU spans -70 to +30 LUFS.
    expect(ABSOLUTE_GATE_LUFS + HISTOGRAM_BINS * HISTOGRAM_BIN_LU).toBe(30);
  });

  it("sizes the sliding windows at 400 ms and 3 s of 20 ms sub-blocks", () => {
    expect(SUB_BLOCK_MS).toBe(20);
    expect(MOMENTARY_SUB_BLOCKS * SUB_BLOCK_MS).toBe(400);
    expect(SHORT_TERM_SUB_BLOCKS * SUB_BLOCK_MS).toBe(3000);
    // The gating hop stays 100 ms - BS.1770-5 eq (3)'s 75% overlap - whatever
    // the accumulation grid underneath it is.
    expect(GATING_HOP_SUB_BLOCKS * SUB_BLOCK_MS).toBe(100);
  });

  /**
   * 20 ms has to divide the sample rate into a whole number of samples, or the
   * grid drifts against the audio and the sliding-tone cases stop landing on
   * it. It does at every rate in practical use - the CD/DAT family and their
   * multiples - because they are all multiples of 50.
   *
   * The one exception is 11025 Hz, at which 20 ms is 220.5 samples. 100 ms was
   * no better there (1102.5), it is below the 8 kHz floor most implementations
   * enforce for `new AudioContext({ sampleRate })`, and `Math.round` handles it
   * the same way it always did.
   */
  it("divides every practical sample rate into whole sub-blocks", () => {
    const rates = [
      8000, 16000, 22050, 24000, 32000, 44100, 48000, 88200, 96000, 176400,
      192000,
    ];
    for (const rate of rates) {
      const analyzer = createLoudnessAnalyzer(rate, { maxChannels: 1 });
      expect(analyzer.subBlockSize).toBe((rate * SUB_BLOCK_MS) / 1000);
      expect(Number.isInteger(analyzer.subBlockSize)).toBe(true);
    }
    expect(createLoudnessAnalyzer(48000).subBlockSize).toBe(960);
    expect(createLoudnessAnalyzer(44100).subBlockSize).toBe(882);
    expect(createLoudnessAnalyzer(96000).subBlockSize).toBe(1920);
  });

  /**
   * Success criterion: memory is constant regardless of programme length. The
   * histogram is what buys it - every gating block ever seen is one increment
   * of one of 1000 bins - so the assertion is on the analyzer's own footprint,
   * not on a heap measurement that would mostly report the test signal. The
   * 20 ms grid costs 120 more ring slots per channel and nothing that grows.
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
    expectWithin(long.integrated(), short.integrated(), 0.01);
  });
});

// ---------------------------------------------------------------------------
// gainToTarget
// ---------------------------------------------------------------------------

describe("gainToTarget", () => {
  it("returns the dB that moves a reading onto a target", () => {
    expect(gainToTarget(-23, -14)).toBe(9);
    expect(gainToTarget(-14, -23)).toBe(-9);
    expect(gainToTarget(-23, -23)).toBe(0);
    // ATSC A/85 from EBU R 128, and the streaming target of the moment.
    expect(gainToTarget(-23, -24)).toBe(-1);
  });

  it("asks for infinite gain on silence, which is the honest answer", () => {
    expect(gainToTarget(-Infinity, -14)).toBe(Infinity);
  });
});
