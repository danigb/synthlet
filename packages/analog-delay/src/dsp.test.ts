import { createDigitalDelay } from "../../digital-delay/src/dsp";
import {
  bandwidthHz,
  bbdBandwidthHz,
  bbdClockHz,
  createAnalogDelay,
  smoothstep,
  softClip,
  tapeBandwidthHz,
} from "./dsp";
import {
  cornerHz,
  envelopePeriodicity,
  envelopeRms,
  harmonicDistortion,
  maxAbsoluteDifference,
  noiseFloor,
  pitchTrack,
  render,
} from "./spectrum";

// Every threshold here is a measured value with a stated margin, and the raw
// measurement is in a comment beside it. A number with no measurement behind
// it is a number nobody can tighten later.
//
// The metrics themselves are calibrated against analytic truth in
// `spectrum.test.ts`; this file assumes they work and asks what the module
// does.

const SAMPLE_RATE = 44100;

type Settings = {
  time?: number;
  feedback?: number;
  mix?: number;
  taps?: number;
  age?: number;
  wobble?: number;
  spread?: number;
  mode?: number;
};

type Values = [number, number, number, number, number, number, number, number];

/** Parameters in `update()` order, defaulting to fully wet so the tail is visible. */
const params = (over: Settings = {}): Values => {
  const s = {
    time: 0.3,
    feedback: 0.4,
    mix: 1,
    taps: 0,
    age: 0,
    wobble: 0,
    spread: 0,
    mode: 0,
    ...over,
  };
  return [s.time, s.feedback, s.mix, s.taps, s.age, s.wobble, s.spread, s.mode];
};

const sine = (length: number, frequency = 440, amplitude = 1) =>
  Float32Array.from(
    { length },
    (_, i) => amplitude * Math.sin((2 * Math.PI * frequency * i) / SAMPLE_RATE),
  );

function noise(length: number, amplitude = 1, seed = 7) {
  const out = new Float32Array(length);
  let state = seed;
  for (let i = 0; i < length; i++) {
    state = (Math.imul(state, 1664525) + 1013904223) | 0;
    out[i] = (amplitude * state) / 2147483648;
  }
  return out;
}

const impulse = () => {
  const out = new Float32Array(64);
  out[0] = 1;
  return out;
};

const rms = (signal: ArrayLike<number>, from = 0, to = signal.length) => {
  let total = 0;
  for (let i = from; i < to; i++) total += signal[i] * signal[i];
  return Math.sqrt(total / (to - from));
};

const peak = (signal: ArrayLike<number>) => {
  let worst = 0;
  for (let i = 0; i < signal.length; i++) {
    const value = Math.abs(signal[i]);
    if (value > worst) worst = value;
  }
  return worst;
};

const median = (values: number[]) =>
  [...values].sort((a, b) => a - b)[values.length >> 1];

/** Renders the module at one setting, or at a setting that moves with time. */
function play(
  settings: Settings | ((seconds: number) => Values),
  options: {
    seconds: number;
    input?: ArrayLike<number>;
    maxTime?: number;
  },
) {
  const dsp = createAnalogDelay(SAMPLE_RATE, options.maxTime);
  return render(dsp, {
    length: Math.round(SAMPLE_RATE * options.seconds),
    sampleRate: SAMPLE_RATE,
    input: options.input,
    params: typeof settings === "function" ? settings : params(settings),
  });
}

/**
 * The -3 dB frequency a one-pole with `a = 1 - exp(-2 pi fc / fs)` actually
 * has, which is not `fc`. The chain a repeat passes through is two of them -
 * the anti-alias filter on the way into the line and the reconstruction filter
 * on the way out - so the derived bandwidth has to be warped this way before
 * it can be compared with a measured -6 dB corner.
 */
const realisedCorner = (nominalHz: number) => {
  const p = Math.exp((-2 * Math.PI * nominalHz) / SAMPLE_RATE);
  return (
    (Math.acos((4 * p - p * p - 1) / (2 * p)) * SAMPLE_RATE) / (2 * Math.PI)
  );
};

/** Measured -6 dB corner of the first repeat of a quiet noise burst. */
function repeatCorner(settings: Settings & { time: number }) {
  // Quiet, because the saturator is unconditional here: a loud burst comes
  // back with harmonics above the corner, which fills the skirt in and reads
  // as a brighter machine than the coupling actually produced.
  const [left] = play(
    { feedback: 0.15, ...settings },
    { seconds: settings.time + 0.3, input: noise(8192, 0.03) },
  );
  const start = Math.round(settings.time * SAMPLE_RATE);
  return cornerHz(left.subarray(start, start + 8192), SAMPLE_RATE, -6, 60, 400);
}

describe("softClip", () => {
  it("is near-linear small, unity-bounded large, and monotone between", () => {
    expect(softClip(0)).toBe(0);
    expect(softClip(0.01) / 0.01).toBeGreaterThan(0.999);
    expect(softClip(3)).toBeCloseTo(1, 12);
    expect(softClip(1e6)).toBe(1);
    expect(softClip(-1e6)).toBe(-1);

    const problems: unknown[] = [];
    let previous = -1;
    for (let x = -5; x <= 5; x += 0.01) {
      const y = softClip(x);
      if (y < previous || y > 1 || y < -1) problems.push([x, y]);
      previous = y;
    }
    expect(problems).toEqual([]);
  });
});

describe("smoothstep", () => {
  it("is clamped, monotone, and flat at both ends", () => {
    expect(smoothstep(-1)).toBe(0);
    expect(smoothstep(0)).toBe(0);
    expect(smoothstep(0.5)).toBe(0.5);
    expect(smoothstep(1)).toBe(1);
    expect(smoothstep(2)).toBe(1);

    const problems: unknown[] = [];
    let previous = -1;
    for (let x = -0.5; x <= 1.5; x += 0.01) {
      const y = smoothstep(x);
      if (y < previous) problems.push([x, y]);
      previous = y;
    }
    expect(problems).toEqual([]);
    // Zero slope at both ends is what keeps a tap fading in without a corner.
    expect(smoothstep(0.001) / 0.001).toBeLessThan(0.01);
    expect((1 - smoothstep(0.999)) / 0.001).toBeLessThan(0.01);
  });
});

// The BBD half of the coupling is arithmetic, not taste, so it is asserted
// against the datasheet rather than against a rendered signal.
describe("the BBD derivation", () => {
  it("is `delay = stages / (2 x clock)`, read back the other way", () => {
    // The MN3005's own range: 4096 stages, 10-100 kHz, 20.48-204.8 ms.
    expect(bbdClockHz(0.02048)).toBeCloseTo(100000, 6);
    expect(bbdClockHz(0.2048)).toBeCloseTo(10000, 6);
    for (const time of [0.03, 0.05, 0.1, 0.15, 0.2]) {
      expect(bbdClockHz(time)).toBeCloseTo(4096 / (2 * time), 6);
    }
  });

  it("is the fixed filter or half the clock, whichever is lower", () => {
    // At the short end the datasheet's 20 kHz jig filter dominates; at the
    // long end the clock does, and bandwidth collapses to 5 kHz.
    expect(bbdBandwidthHz(0.02048)).toBe(20000);
    expect(bbdBandwidthHz(0.2048)).toBeCloseTo(5000, 6);
    expect(bbdBandwidthHz(0.1)).toBeCloseTo(10240, 6);
  });

  it("holds the clock at its minimum past the real chip's range", () => {
    // Beyond 204.8 ms the model is extrapolating, so it stops rather than
    // inventing physics outside the range the formula was derived in.
    expect(bbdBandwidthHz(0.5)).toBeCloseTo(5000, 6);
    expect(bbdBandwidthHz(1.5)).toBeCloseTo(5000, 6);
  });

  it("falls as `k / time` on tape, the same shape by a different mechanism", () => {
    for (const time of [0.2, 0.5, 1, 1.5]) {
      expect(tapeBandwidthHz(time) * time).toBeCloseTo(3000, 6);
    }
    expect(tapeBandwidthHz(0.05)).toBe(20000);
  });

  it("crosses: past 0.6 s the modelled tape is darker than the clamped BBD", () => {
    // Worth stating rather than hiding - the two laws are not parallel, and
    // "BBD is the dark one" is only true over the range where the chip is real.
    expect(tapeBandwidthHz(0.3)).toBeGreaterThan(bbdBandwidthHz(0.3));
    expect(tapeBandwidthHz(1.2)).toBeLessThan(bbdBandwidthHz(1.2));
  });

  it("is darkened by `age` on the same multiplier in both modes", () => {
    expect(bandwidthHz(0.3, 0, 0)).toBeCloseTo(tapeBandwidthHz(0.3), 6);
    expect(bandwidthHz(0.3, 1, 1)).toBeCloseTo(0.3 * bbdBandwidthHz(0.3), 6);
  });
});

describe("the delay itself", () => {
  it("repeats at the set time", () => {
    // 50 ms of 440 Hz through a 300 ms delay: onsets at 300, 600 and 900 ms,
    // measured 296, 598, 900 - within one 256-sample envelope hop (5.8 ms).
    const [left] = play(
      { time: 0.3, feedback: 0.5 },
      { seconds: 1, input: sine(2205) },
    );

    const points = envelopeRms(left, 256);
    const onsets: number[] = [];
    for (let i = 1; i < points.length; i++) {
      if (points[i - 1] < 0.02 && points[i] >= 0.02) {
        onsets.push((i * 256) / SAMPLE_RATE);
      }
    }

    expect(onsets.length).toBeGreaterThanOrEqual(3);
    expect(onsets[0]).toBeCloseTo(0.3, 2);
    expect(onsets[1]).toBeCloseTo(0.6, 2);
    expect(onsets[2]).toBeCloseTo(0.9, 2);
  });

  it("keeps a tail after the input stops", () => {
    // The input is 100 ms long; measured RMS a second and a half later: 0.0104.
    const [left] = play(
      { time: 0.1, feedback: 0.8 },
      { seconds: 2, input: sine(4410) },
    );
    expect(rms(left, SAMPLE_RATE * 1.5, left.length)).toBeGreaterThan(0.001);
  });

  it.each([0, 1])(
    "self-oscillates and stays bounded at feedback 1.2, mode %p",
    (mode) => {
      // Sixty seconds of loop, at the default wear, which is where a runaway,
      // a NaN or a denormal stall would have long since shown up. Measured
      // peak 0.357 Tape / 0.751 BBD, tail RMS 0.175 / 0.205.
      const [left, right] = play(
        { time: 0.15, feedback: 1.2, age: 0.3, wobble: 0.3, mode },
        { seconds: 60, input: sine(4410) },
      );

      for (let i = 0; i < left.length; i++) {
        if (!Number.isFinite(left[i]) || !Number.isFinite(right[i])) {
          throw Error(`not finite at sample ${i}`);
        }
      }
      expect(Math.max(peak(left), peak(right))).toBeLessThan(1.2);
      // And it is genuinely still oscillating a minute in, not silently dead.
      expect(rms(left, left.length - SAMPLE_RATE)).toBeGreaterThan(0.05);
    },
    120000,
  );

  it("stays bounded when everything is worn at once, even as it dies away", () => {
    // A worn transport with several heads open cannot hold a resonance: at
    // `age` and `wobble` up and `taps` half open the loop decays even at
    // feedback 1.2 (measured RMS 0.18 -> 0.0089 over ten seconds). That is
    // the machine, not a defect - what the module owes here is that it stays
    // finite and bounded on the way down.
    const [left, right] = play(
      { time: 0.15, feedback: 1.2, age: 0.5, wobble: 0.5, taps: 0.5 },
      { seconds: 10, input: sine(4410) },
    );
    for (let i = 0; i < left.length; i++) {
      if (!Number.isFinite(left[i]) || !Number.isFinite(right[i])) {
        throw Error(`not finite at sample ${i}`);
      }
    }
    expect(Math.max(peak(left), peak(right))).toBeLessThan(1.2);
  });
});

describe("moving `time` bends pitch - the package's defining behaviour", () => {
  // A 440 Hz tone held through a sweep from 0.5 s to 0.25 s over the second
  // second. Shortening a delay by `r` seconds per second resamples everything
  // in the line by `1 - r`, so the pitch rises; the glide's inertia is what
  // decides how much of the nominal 0.25 s/s the head actually travels.
  const sweep = (seconds: number) => {
    const time = 0.5 - 0.25 * Math.min(1, Math.max(0, seconds - 1));
    return { time, feedback: 0.6 };
  };

  const windows = (track: number[], hop: number) => {
    const at = (from: number, to: number) =>
      track.slice(
        Math.round((from * SAMPLE_RATE) / hop),
        Math.round((to * SAMPLE_RATE) / hop),
      );
    return {
      // After the 0.5 s line has filled, before the sweep starts at 1 s.
      before: median(at(0.6, 0.95)),
      // Mid-sweep.
      during: median(at(1.4, 1.9)),
      // Long after: the glide has had three time constants to settle.
      after: median(at(3.5, 4.8)),
    };
  };

  it("shows a sustained upward excursion during the sweep, and returns after", () => {
    // Measured 440.3 before, 511 during, 440.4 after.
    const [left] = play((seconds) => params(sweep(seconds)), {
      seconds: 5,
      input: sine(SAMPLE_RATE * 5),
    });
    const measured = windows(
      pitchTrack(left, SAMPLE_RATE, 2048, 300, 700),
      2048,
    );

    expect(measured.before / 440).toBeGreaterThan(0.99);
    expect(measured.before / 440).toBeLessThan(1.01);
    expect(measured.during / 440).toBeGreaterThan(1.1);
    expect(measured.after / 440).toBeGreaterThan(0.985);
    expect(measured.after / 440).toBeLessThan(1.015);
  });

  it("does not, in `digital-delay` - the control", () => {
    // The identical sweep through the crossfade delay, whose read head hands
    // over rather than travelling. This pair is the whole justification for
    // two packages, so it belongs in the suite as a pair: without the control
    // the assertion above could be passed by any module that wobbles.
    //
    // Measured 441.4 before, 442.0 during, 440.0 after.
    const dsp = createDigitalDelay(SAMPLE_RATE);
    const [left] = render(dsp, {
      length: SAMPLE_RATE * 5,
      sampleRate: SAMPLE_RATE,
      input: sine(SAMPLE_RATE * 5),
      params: (seconds) => {
        const { time, feedback } = sweep(seconds);
        return [time, feedback, 1, 0, 0, 0, 0, 0];
      },
    });
    const measured = windows(
      pitchTrack(left, SAMPLE_RATE, 2048, 300, 700),
      2048,
    );

    const problems = Object.entries(measured).filter(
      ([, value]) => Math.abs(value - 440) / 440 > 0.02,
    );
    expect(problems).toEqual([]);
  });
});

describe("bandwidth falls as `time` rises - the coupling", () => {
  // Measured -6 dB corner of the first repeat against the derived prediction,
  // warped through `realisedCorner`. Raw numbers, in Hz:
  //
  //   Tape, age 0.5, time 0.2 / 0.35 / 0.6 / 0.9 / 1.4
  //     measured  14225  6480  3962  2571  1774
  //     predicted 11942  5890  3310  2184  1397
  //   BBD, age 0.8, time 0.05 / 0.08 / 0.12 / 0.16 / 0.2
  //     measured  11898  7029  4201  3044  2290
  //     predicted 10283  5962  3848  2855  2272
  //
  // The measurement runs 0-27% high across both. That offset is the metric's,
  // not the model's - `cornerHz` reads a known two-pole corner up to 12% high
  // for the same reason, a few tenths of a dB of estimator scatter on a skirt
  // - so the derivation is asserted twice: loosely in absolute terms, and
  // tightly on the *shape*, where a constant offset cancels.
  const cases = [
    { name: "tape", mode: 0, age: 0.5, times: [0.2, 0.35, 0.6, 0.9, 1.4] },
    { name: "bbd", mode: 1, age: 0.8, times: [0.05, 0.08, 0.12, 0.16, 0.2] },
  ];

  describe.each(cases)("$name", ({ mode, age, times }) => {
    const measured = times.map((time) => repeatCorner({ time, age, mode }));
    const predicted = times.map((time) =>
      realisedCorner(bandwidthHz(time, age, mode)),
    );

    it("darkens monotonically across five settings", () => {
      const problems = measured.filter(
        (value, i) => i > 0 && value >= measured[i - 1],
      );
      expect(problems).toEqual([]);
      // Not merely monotone: the ends differ by a factor of eight (Tape) and
      // five (BBD).
      expect(measured[0] / measured[4]).toBeGreaterThan(4);
    });

    it("lands on the derived corner, not merely in the right direction", () => {
      const problems = measured.filter((value, i) => {
        const ratio = value / predicted[i];
        return !(ratio > 0.9 && ratio < 1.4);
      });
      expect(problems).toEqual([]);
    });

    it("has the shape the derivation predicts", () => {
      // Each corner relative to the first, against the same ratio of the
      // prediction. Measured error: 0.0 / -7.6 / 0.5 / -1.2 / 6.6 % on Tape
      // and 0.0 / 1.9 / -5.6 / -7.8 / -12.9 % on BBD.
      const problems = measured
        .map((value, i) => ({
          i,
          error: value / measured[0] / (predicted[i] / predicted[0]) - 1,
        }))
        .filter(({ error }) => Math.abs(error) > 0.15);
      expect(problems).toEqual([]);
    });
  });
});

describe("`age` moves four things, each on its own", () => {
  // The composite curve is a design choice, not a sourced measurement, so the
  // thing that keeps it verifiable is that each of its four consequences is
  // measurable without the other three. Raw numbers across age 0 / 0.25 /
  // 0.5 / 0.75 / 1:
  //
  //   wobble depth, Hz s.d. of the pitch track   0.671  1.058  1.498  1.906  2.305
  //   saturation, harmonic energy ratio          3.2e-4 8.1e-3 3.0e-2 5.6e-2 7.5e-2
  //   bandwidth, measured corner in Hz           15249  11507  8068   5252   3800
  //   noise floor, RMS of the quietest decile    3.2e-21 6.2e-6 2.1e-5 3.8e-5 5.0e-5
  const ages = [0, 0.25, 0.5, 0.75, 1];
  const rising = (measured: number[]) =>
    measured.filter((v, i) => i > 0 && v <= measured[i - 1]);
  const falling = (measured: number[]) =>
    measured.filter((v, i) => i > 0 && v >= measured[i - 1]);

  it("wobble depth, at a fixed `wobble`", () => {
    const measured = ages.map((age) => {
      const [left] = play(
        { time: 0.3, feedback: 0.6, age, wobble: 0.5 },
        { seconds: 4, input: sine(SAMPLE_RATE * 4) },
      );
      const track = pitchTrack(
        left.subarray(SAMPLE_RATE),
        SAMPLE_RATE,
        2048,
        350,
        550,
      );
      const mean = track.reduce((a, b) => a + b, 0) / track.length;
      return Math.sqrt(
        track.reduce((a, b) => a + (b - mean) ** 2, 0) / track.length,
      );
    });
    expect(rising(measured)).toEqual([]);
    expect(measured[4] / measured[0]).toBeGreaterThan(2.5);
  });

  it("saturation, at a fixed input level", () => {
    const measured = ages.map((age) => {
      const [left] = play(
        { time: 0.3, feedback: 0, age },
        { seconds: 1, input: sine(SAMPLE_RATE, 200, 0.5) },
      );
      // 200 Hz, so its harmonics stay well below the darkest bandwidth `age`
      // can produce - otherwise this would measure the filter, not the drive.
      const start = Math.round(0.31 * SAMPLE_RATE);
      return harmonicDistortion(
        left.subarray(start, start + 16384),
        SAMPLE_RATE,
        200,
      );
    });
    expect(rising(measured)).toEqual([]);
    expect(measured[4] / measured[0]).toBeGreaterThan(100);
  });

  it("bandwidth, at a fixed `time`", () => {
    const measured = ages.map((age) => repeatCorner({ time: 0.3, age }));
    expect(falling(measured)).toEqual([]);
    expect(measured[0] / measured[4]).toBeGreaterThan(3);
  });

  it("noise floor, with nothing playing", () => {
    const measured = ages.map((age) => {
      const [left] = play({ time: 0.3, feedback: 0.5, age }, { seconds: 2 });
      return noiseFloor(left.subarray(SAMPLE_RATE));
    });
    expect(rising(measured)).toEqual([]);
    // At `age = 0` there is no hiss at all, only the denormal guard.
    expect(measured[0]).toBeLessThan(1e-15);
  });
});

describe("wobble", () => {
  it("is click-free at every depth", () => {
    // The largest sample-to-sample step against the same render standing
    // still. Wow and flutter are a continuous modulation of delay length, so
    // the sweep is quieter than the reference rather than louder: measured
    // 0.0297 at full depth against 0.0597 with nothing moving.
    const worstStep = (settings: Settings | ((seconds: number) => Values)) => {
      const [left] = play(settings, {
        seconds: 2,
        input: sine(SAMPLE_RATE * 2, 220),
      });
      return maxAbsoluteDifference(left);
    };

    const still = worstStep({
      time: 0.3,
      feedback: 0.6,
      age: 0.3,
      wobble: 0.3,
    });
    const problems = [0.25, 0.5, 0.75, 1].filter(
      (wobble) =>
        worstStep({ time: 0.3, feedback: 0.6, age: 1, wobble }) >= still * 1.5,
    );
    expect(problems).toEqual([]);

    // And sweeping the depth from nothing to full is no worse.
    const swept = worstStep((seconds) =>
      params({
        time: 0.3,
        feedback: 0.6,
        age: 1,
        wobble: Math.min(1, seconds),
      }),
    );
    expect(swept).toBeLessThan(still * 1.5);
  });
});

describe("taps", () => {
  // Peak-envelope timing of an impulse at `taps = 1` with no feedback, so the
  // taps are the only thing in the output. Measured, as ratios of `time`:
  //   Tape  0.99 2.00 3.00
  //   BBD   0.99 1.67 3.01 4.35 7.04 8.39
  const TABLES = [
    { name: "tape", mode: 0, ratios: [1, 2, 3] },
    {
      name: "bbd",
      mode: 1,
      // The MN3011's stages 396 / 662 / 1194 / 1726 / 2790 / 3328, normalised.
      ratios: [1, 1.6717, 3.0152, 4.3586, 7.0455, 8.404],
    },
  ];

  it.each(TABLES)(
    "$name lands on the documented ratios",
    ({ mode, ratios }) => {
      const time = 0.12;
      const [left] = play(
        { time, feedback: 0, taps: 1, mode },
        { seconds: 2, input: impulse() },
      );

      const points = envelopeRms(left, 64);
      const measured: number[] = [];
      for (let i = 1; i < points.length - 1; i++) {
        if (
          points[i] > points[i - 1] &&
          points[i] >= points[i + 1] &&
          points[i] > 0.002
        ) {
          measured.push((i * 64) / SAMPLE_RATE / time);
        }
      }

      expect(measured.length).toBe(ratios.length);
      const problems = measured.filter(
        (value, i) => Math.abs(value - ratios[i]) > 0.02,
      );
      expect(problems).toEqual([]);
    },
  );

  it.each(TABLES)("$name is a continuum, not a switch", ({ mode }) => {
    // Tail energy across five settings. Measured:
    //   Tape 1.37e-3 1.53e-3 1.94e-3 2.07e-3 2.38e-3
    //   BBD  1.02e-4 1.42e-4 1.80e-4 2.15e-4 2.42e-4
    const measured = [0, 0.25, 0.5, 0.75, 1].map((taps) => {
      const [left] = play(
        { time: 0.12, feedback: 0.3, taps, age: 0.2, mode },
        { seconds: 2, input: impulse() },
      );
      return rms(left, Math.round(0.1 * SAMPLE_RATE));
    });

    expect(measured.filter((v, i) => i > 0 && v <= measured[i - 1])).toEqual(
      [],
    );
    // No step: no single move accounts for more than half the total rise.
    const total = measured[4] - measured[0];
    const steps = measured.slice(1).map((v, i) => v - measured[i]);
    expect(Math.max(...steps) / total).toBeLessThan(0.5);
  });

  it("sweeping it is click-free, in both modes", () => {
    // Against the same render standing still at `taps = 1`, which is the fair
    // reference: more heads open is more level, and more level is more slew.
    // Measured 0.0980 sweeping against 0.0976 still (Tape), 0.0752 against
    // 0.0752 (BBD).
    const worstStep = (settings: Settings | ((seconds: number) => Values)) => {
      const [left] = play(settings, {
        seconds: 2,
        input: sine(SAMPLE_RATE * 2, 220),
      });
      return maxAbsoluteDifference(left);
    };

    const problems = [0, 1].filter((mode) => {
      const still = worstStep({
        time: 0.3,
        feedback: 0.6,
        age: 0.3,
        wobble: 0.3,
        taps: 1,
        mode,
      });
      const swept = worstStep((seconds) =>
        params({
          time: 0.3,
          feedback: 0.6,
          age: 0.3,
          wobble: 0.3,
          taps: Math.min(1, seconds),
          mode,
        }),
      );
      return swept >= still * 1.5;
    });
    expect(problems).toEqual([]);
  });

  it("makes Tape rhythmic and BBD diffuse - what the mode enum is for", () => {
    // Every tape tap is an integer multiple of `time`, so the whole envelope
    // repeats at `time` and its autocorrelation there is near 1. The MN3011's
    // are deliberately irrational, and nothing repeats. Measured at a lag of
    // `time`: 0.778 Tape, 0.024 BBD. Over the whole lag range the BBD reaches
    // 0.541 somewhere, which is why the assertion names the tap period rather
    // than taking the best lag anywhere.
    const periodicity = (mode: number) => {
      const [left] = play(
        { time: 0.12, feedback: 0.5, taps: 1, age: 0.2, mode },
        { seconds: 3, input: impulse() },
      );
      return envelopePeriodicity(left, SAMPLE_RATE, 0.11, 0.13);
    };

    expect(periodicity(0)).toBeGreaterThan(0.6);
    expect(periodicity(1)).toBeLessThan(0.15);
  });

  it("clamps the tap offsets to the line rather than allocating for 8.4x", () => {
    // At `time = maxTime` in BBD mode every tap but the first would read past
    // the end of a line sized for `maxTime`. They fold onto its maximum
    // instead: one onset at 1.50 s, nothing beyond it, nothing infinite. The
    // alternative would be a 12.6 s stereo buffer for a case nobody asks for.
    const [left] = play(
      { time: 1.5, feedback: 0.2, taps: 1, mode: 1 },
      { seconds: 3, input: impulse() },
    );

    expect(left.every(Number.isFinite)).toBe(true);
    expect(peak(left)).toBeLessThan(1);

    const points = envelopeRms(left, 256);
    const onsets: number[] = [];
    for (let i = 1; i < points.length - 1; i++) {
      if (
        points[i] > points[i - 1] &&
        points[i] >= points[i + 1] &&
        points[i] > 1e-4
      ) {
        onsets.push((i * 256) / SAMPLE_RATE);
      }
    }
    expect(onsets.length).toBe(1);
    expect(onsets[0]).toBeCloseTo(1.5, 1);
  });
});

describe("spread", () => {
  it("is mono-compatible at 0, whatever else is set", () => {
    // The two lines are the same length, read at the same offsets, through
    // identical filters, sharing one hiss source: the channels are not merely
    // similar but bit-identical, so the null is exact. Measured worst
    // difference: 0, hence -600 dBFS - the floor of the arithmetic rather
    // than of the design.
    const [left, right] = play(
      {
        time: 0.25,
        feedback: 0.6,
        taps: 0.6,
        age: 0.6,
        wobble: 0.8,
        mode: 0.5,
      },
      { seconds: 1, input: sine(4410) },
    );

    let worst = 0;
    for (let i = 0; i < left.length; i++) {
      worst = Math.max(worst, Math.abs(left[i] - right[i]));
    }
    expect(20 * Math.log10(worst + 1e-30)).toBeLessThan(-80);
  });

  it("offsets the right line as a ratio of the time", () => {
    const [left, right] = play(
      { time: 0.2, feedback: 0.3, spread: 0.5 },
      { seconds: 1, input: impulse() },
    );

    const firstPeak = (signal: Float32Array) => {
      let best = 0;
      let at = 0;
      for (let i = 100; i < SAMPLE_RATE / 2; i++) {
        if (Math.abs(signal[i]) > best) {
          best = Math.abs(signal[i]);
          at = i;
        }
      }
      return at / SAMPLE_RATE;
    };

    expect(firstPeak(left)).toBeCloseTo(0.2, 3);
    expect(firstPeak(right)).toBeCloseTo(0.3, 3);
  });
});

describe("the two modes", () => {
  it("differ in bandwidth at equal `time` and `age`", () => {
    // At 0.25 s and `age = 0.3` the MN3005's clock is already at its 10 kHz
    // floor while the tape law is still at 12 kHz. Measured corner: 13868 Hz
    // Tape, 4437 Hz BBD - a factor of three.
    const tape = repeatCorner({ time: 0.25, age: 0.3, mode: 0 });
    const bbd = repeatCorner({ time: 0.25, age: 0.3, mode: 1 });
    expect(bbd).toBeLessThan(tape / 2);
  });

  it("differ in level dependence, which is the compander", () => {
    // Output level over input level at three input amplitudes, with the
    // saturator idle at `age = 0`. Measured:
    //   Tape 0.999 0.998 0.979
    //   BBD  0.317 1.018 0.912
    // Tape is flat because nothing in it cares how loud the signal is. The
    // BBD's compander round-trips to unity in the middle and loses two thirds
    // of a very quiet signal, where its detectors stop tracking.
    const gains = (mode: number) =>
      [0.005, 0.05, 0.3].map((amplitude) => {
        const [left] = play(
          { time: 0.2, feedback: 0, age: 0, mode },
          { seconds: 1, input: sine(8820, 300, amplitude) },
        );
        const start = Math.round(0.21 * SAMPLE_RATE);
        return rms(left, start, start + 7000) / (amplitude / Math.SQRT2);
      });

    const tape = gains(0);
    const bbd = gains(1);
    expect(Math.max(...tape) / Math.min(...tape)).toBeLessThan(1.05);
    expect(Math.max(...bbd) / Math.min(...bbd)).toBeGreaterThan(2.5);
  });

  it("round-trips the compander to unity on steady material", () => {
    // The artifact is demonstrably the time-constant *mismatch*, not a broken
    // gain stage: at a level the detectors track and material slow enough for
    // them to settle, in-then-out is 1.018.
    const [left] = play(
      { time: 0.2, feedback: 0, age: 0, mode: 1 },
      { seconds: 1, input: sine(8820, 300, 0.05) },
    );
    const start = Math.round(0.21 * SAMPLE_RATE);
    const measured = rms(left, start, start + 7000) / (0.05 / Math.SQRT2);
    expect(measured).toBeGreaterThan(0.95);
    expect(measured).toBeLessThan(1.05);
  });

  it("pumps on a fast transient, measurably and within bounds", () => {
    // The compressor's detector is slower than the expander's, so a sudden
    // onset arrives at the line still carrying the gain the previous silence
    // earned, and the expander's faster detector passes that overshoot
    // straight out. Measured peak-over-steady in the repeat: 1.070 Tape,
    // 3.123 BBD. A test that only checked "not unity" would pass on a badly
    // broken compander, so both ends are bounded.
    const overshoot = (mode: number) => {
      const input = new Float32Array(SAMPLE_RATE);
      for (let i = 4410; i < 26460; i++) {
        input[i] = 0.3 * Math.sin((2 * Math.PI * 300 * i) / SAMPLE_RATE);
      }
      const [left] = play(
        { time: 0.3, feedback: 0, age: 0, mode },
        { seconds: 1, input },
      );
      const points = envelopeRms(left, 64);
      const at = (seconds: number) => Math.round((seconds * SAMPLE_RATE) / 64);
      const onset = points.slice(at(0.4), at(0.55));
      const steady = rms(points.slice(at(0.55), at(0.75)));
      return Math.max(...onset) / steady;
    };

    expect(overshoot(0)).toBeLessThan(1.2);
    expect(overshoot(1)).toBeGreaterThan(2);
    expect(overshoot(1)).toBeLessThan(5);
  });

  it("does not click on a mode change, stepped or swept", () => {
    // Measured largest step: 0.0678 stepping and 0.0473 sweeping, against
    // 0.0597 standing in Tape and 0.0883 standing in BBD.
    const worstStep = (settings: Settings | ((seconds: number) => Values)) => {
      const [left] = play(settings, {
        seconds: 2,
        input: sine(SAMPLE_RATE * 2, 220),
      });
      return maxAbsoluteDifference(left);
    };

    const base = { time: 0.3, feedback: 0.6, age: 0.3, wobble: 0.3 };
    const still = Math.max(worstStep(base), worstStep({ ...base, mode: 1 }));
    const stepped = worstStep((seconds) =>
      params({ ...base, mode: seconds < 1 ? 0 : 1 }),
    );
    const swept = worstStep((seconds) =>
      params({ ...base, mode: Math.min(1, seconds) }),
    );

    expect(stepped).toBeLessThan(still * 1.5);
    expect(swept).toBeLessThan(still * 1.5);
  });
});

describe("construction", () => {
  it("sizes its lines from maxTime and clamps `time` to them", () => {
    const [left] = play(
      { time: 1, feedback: 0.3 },
      { seconds: 1, input: impulse(), maxTime: 0.1 },
    );

    expect(left.every(Number.isFinite)).toBe(true);
    let at = 0;
    let best = 0;
    for (let i = 100; i < left.length; i++) {
      if (Math.abs(left[i]) > best) {
        best = Math.abs(left[i]);
        at = i;
      }
    }
    expect(at / SAMPLE_RATE).toBeCloseTo(0.1, 2);
  });

  it("allocates nothing per block", () => {
    const dsp = createAnalogDelay(SAMPLE_RATE);
    const inL = new Float32Array(128);
    const inR = new Float32Array(128);
    const outL = new Float32Array(128);
    const outR = new Float32Array(128);
    const Real = globalThis.Float32Array;
    let constructions = 0;

    globalThis.Float32Array = new Proxy(Real, {
      construct(target, args: any[]) {
        constructions++;
        return new (target as any)(...args);
      },
    }) as any;

    try {
      for (let block = 0; block < 200; block++) {
        dsp.update(...params({ taps: 0.5, age: 0.5, wobble: 0.5, mode: 0.5 }));
        dsp.compute(inL, inR, outL, outR);
      }
    } finally {
      globalThis.Float32Array = Real;
    }

    expect(constructions).toBe(0);
  });
});
