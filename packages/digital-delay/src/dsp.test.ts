import { createDelayLine } from "./_delay";
import {
  createDigitalDelay,
  DEFAULT_MAX_TIME,
  MOD_RATE_HZ,
  softClip,
} from "./dsp";
import {
  centroid,
  fundamental,
  maxAbsoluteDifference,
  render,
  rt60,
} from "./_spectrum";

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
  tone?: number;
  mod?: number;
  spread?: number;
  cross?: number;
  diffuse?: number;
};

type Values = [number, number, number, number, number, number, number, number];

/** Parameters in `update()` order, defaulting to fully wet so the tail is visible. */
const params = (over: Settings = {}): Values => {
  const s = {
    time: 0.25,
    feedback: 0.4,
    mix: 1,
    tone: 0,
    mod: 0,
    spread: 0,
    cross: 0,
    diffuse: 0,
    ...over,
  };
  return [
    s.time,
    s.feedback,
    s.mix,
    s.tone,
    s.mod,
    s.spread,
    s.cross,
    s.diffuse,
  ];
};

const sine = (length: number, frequency = 440) =>
  Float32Array.from({ length }, (_, i) =>
    Math.sin((2 * Math.PI * frequency * i) / SAMPLE_RATE),
  );

function noise(length: number, seed = 7) {
  const out = new Float32Array(length);
  let state = seed;
  for (let i = 0; i < length; i++) {
    state = (state * 1103515245 + 12345) & 0x7fffffff;
    out[i] = state / 0x3fffffff - 1;
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

/** Short-time energy envelope, one point per `hop`. */
function envelope(signal: ArrayLike<number>, hop = 128) {
  const out: number[] = [];
  for (let i = 0; i + hop <= signal.length; i += hop)
    out.push(rms(signal, i, i + hop));
  return out;
}

/**
 * Echo density: how filled-in the tail is, as the reciprocal of the energy
 * envelope's crest factor. A train of discrete repeats is one tall peak per
 * delay period against near-silence, so its crest is large and its density
 * small; a wash is a flat envelope, crest near 1, density near 1.
 *
 * The ticket proposed zero crossings per unit time. That measures spectral
 * content rather than density and moves the wrong way here: diffusion smooths
 * the transient that a bare repeat preserves, so zero-crossing rate *falls*
 * as `diffuse` rises (measured 6862, 1696, 1266, 1113, 1029 per second across
 * `diffuse` 0 to 1). Envelope crest measures the thing the criterion is about.
 */
function echoDensity(signal: ArrayLike<number>, hop = 128) {
  const points = envelope(signal, hop);
  const mean = points.reduce((a, b) => a + b, 0) / points.length;
  return mean / Math.max(...points);
}

const delay = (over: Settings = {}, maxTime = DEFAULT_MAX_TIME) => ({
  dsp: createDigitalDelay(SAMPLE_RATE, maxTime),
  values: params(over),
});

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

describe("the delay itself", () => {
  it("repeats at the delay time", () => {
    // 50 ms of 440 Hz through a 250 ms delay: the peaks land at 250, 500 and
    // 750 ms, measured to within one 256-sample envelope hop (5.8 ms).
    const { dsp, values } = delay({ time: 0.25, feedback: 0.5 });
    const [left] = render(dsp, {
      length: SAMPLE_RATE,
      sampleRate: SAMPLE_RATE,
      input: sine(2205),
      params: values,
    });

    const points = envelope(left, 256);
    const onsets: number[] = [];
    for (let i = 1; i < points.length; i++) {
      const quiet = points[i - 1] < 0.02;
      if (quiet && points[i] >= 0.02) onsets.push((i * 256) / SAMPLE_RATE);
    }

    expect(onsets.length).toBeGreaterThanOrEqual(3);
    expect(onsets[0]).toBeCloseTo(0.25, 2);
    expect(onsets[1]).toBeCloseTo(0.5, 2);
    expect(onsets[2]).toBeCloseTo(0.75, 2);
  });

  it("combs below one render quantum - ticket criterion 1", () => {
    // 1 ms is 44 samples: a seventh of the 128-sample floor a `DelayNode` in
    // a Web Audio feedback cycle is clamped to, so no arrangement of native
    // nodes can produce this at all.
    const { dsp, values } = delay({ time: 0.001, feedback: 0.7 });
    const [left] = render(dsp, {
      length: SAMPLE_RATE / 2,
      sampleRate: SAMPLE_RATE,
      input: noise(4410),
      params: values,
    });

    expect(left.every(Number.isFinite)).toBe(true);
    // A resonant comb: broadband noise in, a pitch at 1 / time out. Measured
    // 979 Hz against a nominal 1000 - the shortfall is the sample the loop
    // spends between write and read, plus the stability filter's group delay.
    const pitch = fundamental(
      left.subarray(5000, 25000),
      SAMPLE_RATE,
      400,
      3000,
    );
    expect(pitch).toBeGreaterThan(900);
    expect(pitch).toBeLessThan(1050);
  });

  it("keeps a tail after the input stops", () => {
    const { dsp, values } = delay({ time: 0.1, feedback: 0.8 });
    const [left] = render(dsp, {
      length: SAMPLE_RATE * 2,
      sampleRate: SAMPLE_RATE,
      input: sine(4410),
      params: values,
    });
    // The input is 100 ms long; there is still signal a second and a half later.
    expect(rms(left, (SAMPLE_RATE * 3) / 2, left.length)).toBeGreaterThan(
      0.001,
    );
  });

  it("self-oscillates and stays bounded at feedback 1.2 - ticket criterion 3", () => {
    // Sixty seconds of loop, which is where a runaway, a NaN or a denormal
    // stall would have long since shown up. Measured peak 0.78.
    const { dsp, values } = delay({ time: 0.15, feedback: 1.2 });
    const [left, right] = render(dsp, {
      length: SAMPLE_RATE * 60,
      sampleRate: SAMPLE_RATE,
      input: sine(4410),
      params: values,
    });

    let peak = 0;
    for (let i = 0; i < left.length; i++) {
      if (!Number.isFinite(left[i]) || !Number.isFinite(right[i])) {
        throw Error(`not finite at sample ${i}`);
      }
      peak = Math.max(peak, Math.abs(left[i]), Math.abs(right[i]));
    }

    // The soft limiter bounds the line's contents at 1, and `mix: 1` passes
    // them through; 1.2 is the ceiling this module claims.
    expect(peak).toBeLessThan(1.2);
    // And it is genuinely still oscillating a minute in, not silently dead.
    expect(rms(left, left.length - SAMPLE_RATE, left.length)).toBeGreaterThan(
      0.05,
    );
  }, 30000);
});

describe("tone - ticket criterion 4", () => {
  // Centroid of successive repeats of the same noise burst, in Hz. Measured:
  //   tone -1  11169  6018  2018   845   556
  //   tone  0  11143 11201 11234 11257 11274
  //   tone +1  11152 11671 11953 12152 12307
  const repeats = (tone: number) => {
    const { dsp, values } = delay({ time: 0.2, feedback: 0.8, tone });
    const [left] = render(dsp, {
      length: SAMPLE_RATE * 2,
      sampleRate: SAMPLE_RATE,
      input: noise(4410),
      params: values,
    });
    return [1, 2, 3, 4, 5].map((n) =>
      centroid(left.subarray(n * 8820, n * 8820 + 4096), SAMPLE_RATE),
    );
  };

  it("darkens each repeat at -1", () => {
    const measured = repeats(-1);
    expect(measured.filter((c, i) => i > 0 && c >= measured[i - 1])).toEqual(
      [],
    );
    // Not merely monotone: the fifth repeat is an order of magnitude darker.
    expect(measured[4]).toBeLessThan(measured[0] / 10);
  });

  it("thins each repeat at +1", () => {
    const measured = repeats(1);
    expect(measured.filter((c, i) => i > 0 && c <= measured[i - 1])).toEqual(
      [],
    );
  });

  it("is flat at 0, bar the stability high-pass", () => {
    // The tilt is bypassed exactly at 0, but the feedback high-pass never is -
    // it is what stops sub-bass piling up - so the centroid creeps upward.
    // Measured drift across five repeats: 1.2%.
    const measured = repeats(0);
    const drift = Math.abs(measured[4] - measured[0]) / measured[0];
    expect(drift).toBeLessThan(0.03);
  });
});

describe("spread and cross - ticket criterion 5", () => {
  it("is mono-compatible at spread 0, cross 0, whatever else is set", () => {
    // The two lines are the same length, read at the same offset, through
    // identical filters, with an identity cross-feed: the channels are not
    // merely similar but bit-identical, so the null is exact.
    const { dsp, values } = delay({
      time: 0.2,
      feedback: 0.6,
      tone: -0.4,
      mod: 0.5,
      diffuse: 0.5,
    });
    const [left, right] = render(dsp, {
      length: SAMPLE_RATE,
      sampleRate: SAMPLE_RATE,
      input: sine(4410),
      params: values,
    });

    let worst = 0;
    for (let i = 0; i < left.length; i++) {
      worst = Math.max(worst, Math.abs(left[i] - right[i]));
    }
    // Measured: exactly zero, so -600 dBFS is the floor of the arithmetic
    // rather than of the design. The criterion asks for -80.
    expect(20 * Math.log10(worst + 1e-30)).toBeLessThan(-80);
  });

  it("offsets the right line as a ratio of the time", () => {
    const { dsp, values } = delay({ time: 0.2, feedback: 0.3, spread: 0.5 });
    const [left, right] = render(dsp, {
      length: SAMPLE_RATE,
      sampleRate: SAMPLE_RATE,
      input: impulse(),
      params: values,
    });

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

  // The decay time of the loop, measured on total energy rather than on the
  // channel sum. With a mono source the sum is the projection onto (1, 1), and
  // the rotation turns the state away from that axis - so the sum beats even
  // though no energy has gone anywhere. sqrt(L^2 + R^2) is the invariant the
  // orthogonality claim is actually about.
  const decay = (cross: number) => {
    const { dsp, values } = delay({ time: 0.12, feedback: 0.7, cross });
    const [left, right] = render(dsp, {
      length: SAMPLE_RATE * 4,
      sampleRate: SAMPLE_RATE,
      input: sine(2205),
      params: values,
    });
    return rt60(
      Float64Array.from(left, (value, i) => Math.hypot(value, right[i])),
      SAMPLE_RATE,
    );
  };

  it("keeps the decay time as cross sweeps - ticket criterion 5b", () => {
    // Measured, in seconds: 2.500 2.524 2.524 2.513 2.545. Spread 1.8%; the
    // criterion allows 5%.
    const measured = [0, 0.25, 0.5, 0.75, 1].map(decay);
    const reference = measured[0];
    const problems = measured.filter(
      (value) => Math.abs(value - reference) / reference > 0.05,
    );
    expect(problems).toEqual([]);
  });

  it("would not, with the symmetric matrix - the control", () => {
    // The assertion above is only worth anything if the measurement can fail.
    // This is the same loop with `[[a, b], [b, a]]` instead of a rotation -
    // the obvious choice, and the wrong one. It is written here rather than
    // exposed as an option on the module so that the shipped code carries no
    // path that exists only for a test.
    const symmetric = (cross: number) => {
      const lines = [createDelayLine(8192), createDelayLine(8192)];
      const samples = Math.round(0.12 * SAMPLE_RATE);
      const gain = 0.7;
      const a = Math.cos(cross * Math.PI * 0.5);
      const b = Math.sin(cross * Math.PI * 0.5);
      const input = sine(2205);
      const length = SAMPLE_RATE * 4;
      const energy = new Float64Array(length);

      for (let i = 0; i < length; i++) {
        const wetL = lines[0].read(samples);
        const wetR = lines[1].read(samples);
        const dry = i < input.length ? input[i] : 0;
        lines[0].write(dry + gain * (a * wetL + b * wetR));
        lines[1].write(dry + gain * (b * wetL + a * wetR));
        energy[i] = Math.hypot(wetL, wetR);
      }
      return rt60(energy, SAMPLE_RATE);
    };

    const measured = [0, 0.25, 0.5, 0.75, 1].map(symmetric);
    const reference = measured[0];
    const failures = measured.filter(
      (value) => !(Math.abs(value - reference) / reference <= 0.05),
    );
    // At least one intermediate setting breaks the same 5% bound the rotation
    // holds - which is what makes that assertion a test and not a formality.
    expect(failures.length).toBeGreaterThan(0);
  });

  it("ping-pongs at cross 1", () => {
    // Successive repeats alternate channels. That needs the input rotation as
    // well as the feedback one: a 90-degree feedback rotation on its own swaps
    // two equally loud lines and nothing is heard to move.
    const { dsp, values } = delay({ time: 0.15, feedback: 0.7, cross: 1 });
    const [left, right] = render(dsp, {
      length: SAMPLE_RATE,
      sampleRate: SAMPLE_RATE,
      input: sine(2205),
      params: values,
    });

    const window = Math.round(0.15 * SAMPLE_RATE);
    const repeats = [1, 2, 3, 4].map((n) => ({
      left: rms(left, n * window, (n + 1) * window),
      right: rms(right, n * window, (n + 1) * window),
    }));

    const problems = repeats.filter((repeat, i) =>
      i % 2 === 0
        ? !(repeat.right > repeat.left * 20)
        : !(repeat.left > repeat.right * 20),
    );
    expect(problems).toEqual([]);
  });
});

describe("diffuse - ticket criterion 6", () => {
  it("is a continuum, not a switch", () => {
    // Echo density of the tail of an impulse, across five settings. Measured:
    //   0      0.25     0.5      0.75     1
    //   0.0099 0.0560   0.0758   0.0988   0.1903
    // Monotone, no step, and the ends differ by a factor of 19.
    const measured = [0, 0.25, 0.5, 0.75, 1].map((diffuse) => {
      const { dsp, values } = delay({ time: 0.08, feedback: 0.85, diffuse });
      const [left] = render(dsp, {
        length: SAMPLE_RATE * 3,
        sampleRate: SAMPLE_RATE,
        input: impulse(),
        params: values,
      });
      return echoDensity(left.subarray(SAMPLE_RATE));
    });

    expect(measured.filter((v, i) => i > 0 && v <= measured[i - 1])).toEqual(
      [],
    );
    expect(measured[4]).toBeGreaterThan(measured[0] * 8);
  });

  it("leaves the loop alone at 0", () => {
    // What "diffuse = 0 is free" means where it can be observed: the allpasses
    // are 142 and 379 samples long, so if they were in the path at 0 the loop
    // would be that much longer than `time`. Measured loop length at
    // `time = 0.05` (2205 samples): 2203.5 at `diffuse = 0`, 2629.3 at 1.
    const loopSamples = (diffuse: number) => {
      const { dsp, values } = delay({ time: 0.05, feedback: 0.8, diffuse });
      const [left] = render(dsp, {
        length: SAMPLE_RATE,
        sampleRate: SAMPLE_RATE,
        input: sine(441),
        params: values,
      });
      return (
        SAMPLE_RATE /
        fundamental(left.subarray(SAMPLE_RATE / 4), SAMPLE_RATE, 12, 30)
      );
    };

    expect(loopSamples(0) / 2205).toBeGreaterThan(0.99);
    expect(loopSamples(0) / 2205).toBeLessThan(1.01);
    expect(loopSamples(1)).toBeGreaterThan(2205 * 1.05);
  });
});

describe("mod - ticket criterion 7", () => {
  // Pitch of a 440 Hz tone through the tail, one reading per 4096 samples.
  const pitches = (
    settings: Settings | ((seconds: number) => Values),
    seconds = 3,
  ) => {
    const dsp = createDigitalDelay(SAMPLE_RATE);
    const [left] = render(dsp, {
      length: SAMPLE_RATE * seconds,
      sampleRate: SAMPLE_RATE,
      input: sine(SAMPLE_RATE / 4),
      params: typeof settings === "function" ? settings : params(settings),
    });

    const readings: number[] = [];
    const window = 4096;
    const start = SAMPLE_RATE / 2;
    for (let n = 0; start + (n + 1) * window < left.length; n++) {
      readings.push(
        fundamental(
          left.subarray(start + n * window, start + (n + 1) * window),
          SAMPLE_RATE,
          350,
          550,
        ),
      );
    }
    return readings;
  };

  const median = (values: number[]) =>
    [...values].sort((a, b) => a - b)[values.length >> 1];

  it("bends pitch, and does not at 0", () => {
    // Median |f - 440| over the tail. Measured: 0.00 Hz at `mod = 0`,
    // 3.30 at 0.5, 6.62 at 1 - a vibrato of about 26 cents at full depth,
    // which is what a 3 ms excursion at 0.7 Hz comes to.
    const still = pitches({ time: 0.25, feedback: 0.6, mod: 0 });
    const bent = pitches({ time: 0.25, feedback: 0.6, mod: 1 });

    expect(median(still.map((f) => Math.abs(f - 440)))).toBeLessThan(0.5);
    expect(median(bent.map((f) => Math.abs(f - 440)))).toBeGreaterThan(3);
  });

  it("modulates at the documented rate", () => {
    // The excursion is periodic at MOD_RATE_HZ, and that is the property which
    // separates it from any other source of pitch wobble: the pitch trace
    // itself is a signal, and its own fundamental is the LFO's.
    //
    // The trace is one reading per 4096 samples, so it is sampled at 10.77 Hz
    // and four LFO cycles fit in six seconds of tail. Measured: 0.71 Hz.
    const traceRate = SAMPLE_RATE / 4096;
    const bent = pitches({ time: 0.25, feedback: 0.6, mod: 1 }, 6);
    const mean = bent.reduce((a, b) => a + b, 0) / bent.length;
    const trace = Float64Array.from(bent, (f) => f - mean);

    const measured = fundamental(trace, traceRate, 0.3, 2);
    expect(measured / MOD_RATE_HZ).toBeGreaterThan(0.85);
    expect(measured / MOD_RATE_HZ).toBeLessThan(1.15);
  });

  it("does not transpose when `time` is swept - the crossfade's whole promise", () => {
    // Sweeping 0.5 s to 0.1 s over one second, at `mod = 0`.
    //
    // The oracle is what the other read strategy would do: a glide, where the
    // pointer travels rather than handing over, resamples the buffer by the
    // rate at which the delay is changing. Here that is 0.4 s per second, so a
    // 440 Hz tone would come back at 440 / (1 - 0.4) = 733 Hz - up a fifth and
    // a half. That is `analog-delay`'s behaviour, and it is precisely what
    // this module is built not to do.
    //
    // Measured median pitch through the sweep: 440.4 Hz.
    const glide = 440 / (1 - 0.4);
    expect(glide).toBeGreaterThan(700);

    const swept = pitches((seconds) =>
      params({ time: 0.5 - 0.4 * Math.min(1, seconds), feedback: 0.6 }),
    );

    expect(median(swept)).toBeGreaterThan(440 * 0.985);
    expect(median(swept)).toBeLessThan(440 * 1.015);
  });
});

describe("clicks - ticket criterion 2", () => {
  // The largest sample-to-sample step in a rendered second, against the same
  // render with nothing moving. A click is a step the signal's own slew does
  // not account for, so the static case is the bound.
  const worstStep = (settings: Settings | ((seconds: number) => Values)) => {
    const dsp = createDigitalDelay(SAMPLE_RATE);
    const [left] = render(dsp, {
      length: SAMPLE_RATE * 2,
      sampleRate: SAMPLE_RATE,
      input: sine(SAMPLE_RATE),
      params: typeof settings === "function" ? settings : params(settings),
    });
    return maxAbsoluteDifference(left);
  };

  it("does not click when `time` is swept", () => {
    // Measured: 0.065 sweeping, 0.100 standing still. The sweep is quieter
    // than the reference because a handover briefly averages two heads.
    const still = worstStep({ time: 0.5, feedback: 0.6 });
    const swept = worstStep((seconds) =>
      params({ time: seconds < 1 ? 0.5 - 0.4 * seconds : 0.1, feedback: 0.6 }),
    );
    expect(swept).toBeLessThan(still * 1.5);
  });

  it("does not click when `time` steps", () => {
    const still = worstStep({ time: 0.3, feedback: 0.6 });
    const stepped = worstStep((seconds) =>
      params({ time: seconds < 0.6 ? 0.3 : 0.1, feedback: 0.6 }),
    );
    expect(stepped).toBeLessThan(still * 1.5);
  });

  it("does not click when `diffuse` is swept", () => {
    const still = worstStep({ time: 0.2, feedback: 0.6 });
    const swept = worstStep((seconds) =>
      params({ time: 0.2, feedback: 0.6, diffuse: Math.min(1, seconds) }),
    );
    expect(swept).toBeLessThan(still * 1.5);
  });

  it("does not click when `cross` or `tone` is swept", () => {
    const still = worstStep({ time: 0.2, feedback: 0.6 });
    const swept = worstStep((seconds) =>
      params({
        time: 0.2,
        feedback: 0.6,
        cross: Math.min(1, seconds),
        tone: Math.max(-1, -seconds),
      }),
    );
    expect(swept).toBeLessThan(still * 1.5);
  });
});

describe("construction", () => {
  it("sizes its lines from maxTime and clamps `time` to them", () => {
    // A short line asked for a long delay reads its own maximum rather than
    // running past the write pointer.
    const dsp = createDigitalDelay(SAMPLE_RATE, 0.1);
    const [left] = render(dsp, {
      length: SAMPLE_RATE,
      sampleRate: SAMPLE_RATE,
      input: impulse(),
      params: params({ time: 1, feedback: 0.3 }),
    });

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
    const dsp = createDigitalDelay(SAMPLE_RATE);
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
        dsp.update(...params({ mod: 0.5, diffuse: 0.5, cross: 0.5 }));
        dsp.compute(inL, inR, outL, outR);
      }
    } finally {
      globalThis.Float32Array = Real;
    }

    expect(constructions).toBe(0);
  });
});
