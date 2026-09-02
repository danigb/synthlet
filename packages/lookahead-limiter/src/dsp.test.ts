import {
  createLimiter,
  createSlidingMin,
  createTruePeakDetector,
  latencySamples,
  lookaheadSamples,
  TP_DELAY,
} from "./dsp";
import { truePeakDb } from "./true-peak-oracle";

const SAMPLE_RATE = 48000;
const THRESHOLD_DB = -1;
const LOOKAHEAD_MS = 2;

const constant = (value: number) => new Float32Array([value]);

/**
 * Run a signal through a fresh limiter in fixed-size blocks, the way a worklet
 * would. `gainOut` collects the gain the limiter actually applied - the tap
 * exists so a test can reapply that gain somewhere else and compare.
 */
function process(
  channels: Float32Array[],
  {
    blockSize = 128,
    thresholdDb = THRESHOLD_DB,
    releaseMs = 168,
    driveDb = 0,
    lookaheadMs = LOOKAHEAD_MS,
  } = {},
) {
  const length = channels[0].length;
  const limiter = createLimiter(SAMPLE_RATE, lookaheadMs);
  const outputs = channels.map(() => new Float32Array(length));
  const gains = new Float32Array(length);
  const threshold = constant(thresholdDb);
  const drive = constant(driveDb);

  for (let start = 0; start < length; start += blockSize) {
    const end = Math.min(start + blockSize, length);
    limiter(
      channels.map((channel) => channel.subarray(start, end)),
      outputs.map((channel) => channel.subarray(start, end)),
      threshold,
      releaseMs,
      drive,
      gains.subarray(start, end),
    );
  }

  return { outputs, gains, stats: limiter.stats(), latency: limiter.latency };
}

// A deterministic generator, so "random" material is the same on every run.
function random(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

const fill = (length: number, f: (i: number) => number) =>
  Float32Array.from({ length }, (_, i) => f(i));

const sine = (length: number, freq: number, amp = 1, phase = 0) =>
  fill(
    length,
    (i) => amp * Math.sin((2 * Math.PI * freq * i) / SAMPLE_RATE + phase),
  );

const ADVERSARIAL_LENGTH = 24000;

// Each of these attacks a different part of the design: the impulse train the
// hold window, the bursts the attack ramp and the release, the 19 kHz sine the
// detector, the DC steps the boxcar, fs/4 the inter-sample peaks (its samples
// never exceed 1 but its reconstruction does), and the decorrelated stereo the
// "one gain for every channel" rule.
const ADVERSARIAL: Record<string, () => Float32Array[]> = {
  "impulse train": () => [
    fill(ADVERSARIAL_LENGTH, (i) =>
      i >= 200 && (i - 200) % 97 === 0 ? (i % 2 ? 1 : -1) : 0,
    ),
  ],
  "square bursts": () => [
    fill(ADVERSARIAL_LENGTH, (i) =>
      Math.floor(i / 2000) % 2 === 0 ? (Math.floor(i / 60) % 2 ? 1 : -1) : 0,
    ),
  ],
  "0 dBFS 19 kHz": () => [sine(ADVERSARIAL_LENGTH, 19000, 1, 0.37)],
  "DC steps": () => [
    fill(ADVERSARIAL_LENGTH, (i) => (Math.floor(i / 1500) % 2 ? 0.98 : -0.98)),
  ],
  "fs/4 square": () => [fill(ADVERSARIAL_LENGTH, (i) => [1, 1, -1, -1][i % 4])],
  "decorrelated stereo": () => {
    const next = random(7);
    return [
      fill(ADVERSARIAL_LENGTH, () => next() * 2 - 1),
      fill(ADVERSARIAL_LENGTH, () => next() * 2 - 1),
    ];
  },
};

const DRIVES = [0, 6, 12, 24];

describe("the ceiling holds", () => {
  describe.each(Object.entries(ADVERSARIAL))("%s", (_name, make) => {
    it.each(DRIVES)("at %i dB of drive", (driveDb) => {
      const { outputs, stats } = process(make(), { driveDb });

      // Measured by a detector of a different order, window and oversampling
      // factor - see true-peak-oracle.ts for why it must differ.
      expect(truePeakDb(outputs)).toBeLessThanOrEqual(THRESHOLD_DB + 0.1);

      // Without this the assertion above would pass on silence.
      expect(stats.minGain).toBeLessThan(0.999);

      // The step-7 backstop does fire, on samples that land exactly on the
      // ceiling: the boxcar sum is maintained incrementally, so its last bit
      // drifts. What matters is that it only ever trims float rounding - a
      // real peak getting through would be many orders of magnitude larger.
      expect(stats.maxOvershoot).toBeLessThan(1e-12);
    });
  });
});

it("overshoots without the delay line", () => {
  // The control case. The gain for sample i is computed from what the detector
  // saw `latencySamples` earlier; applying it to the *undelayed* sample i is
  // exactly the bug the delay line exists to prevent, so it must overshoot -
  // otherwise the ceiling test above would pass for the wrong reason.
  const length = 8000;
  const input = fill(length, (i) =>
    i >= 2000 && i < 4000
      ? 2.5 * Math.sin((2 * Math.PI * 1000 * i) / SAMPLE_RATE)
      : 0,
  );

  const { outputs, gains } = process([input]);
  const undelayed = fill(length, (i) => input[i] * gains[i]);

  expect(truePeakDb(outputs)).toBeLessThanOrEqual(THRESHOLD_DB + 0.1);
  expect(truePeakDb([undelayed])).toBeGreaterThan(THRESHOLD_DB + 6);
});

it("is a bit-exact delayed null below the ceiling", () => {
  const length = 6000;
  const delay = latencySamples(LOOKAHEAD_MS, SAMPLE_RATE);
  const input = sine(length, 440, 0.5);

  const { outputs, stats } = process([input]);
  const output = outputs[0];

  for (let i = 0; i < delay; i++) expect(output[i]).toBe(0);
  for (let i = 0; i + delay < length; i++)
    expect(output[i + delay]).toBe(input[i]);

  expect(stats.clampCount).toBe(0);
  expect(stats.minGain).toBe(1);
});

it("is bit-exact across block sizes", () => {
  const length = 6000;
  // Loud enough in the middle that the limiter is working while the block
  // boundaries move around underneath it.
  const input = fill(length, (i) => {
    const amp = i > 1000 && i < 3000 ? 1.6 : 0.2;
    return amp * Math.sin((2 * Math.PI * 440 * i) / SAMPLE_RATE);
  });

  const reference = process([input], { blockSize: 128 }).outputs[0];
  expect(process([input], { blockSize: 128 }).stats.minGain).toBeLessThan(
    0.999,
  );

  for (const blockSize of [1, 13, 512, 4096]) {
    expect(Array.from(process([input], { blockSize }).outputs[0])).toEqual(
      Array.from(reference),
    );
  }
});

it("recovers monotonically to exact unity", () => {
  const length = SAMPLE_RATE * 2;
  const input = fill(length, (i) =>
    i < 2000 ? 4 * Math.sin((2 * Math.PI * 300 * i) / SAMPLE_RATE) : 0,
  );

  const { gains } = process([input], { releaseMs: 168 });

  let lowest = 0;
  for (let i = 1; i < length; i++) if (gains[i] < gains[lowest]) lowest = i;
  expect(gains[lowest]).toBeLessThan(0.5);

  for (let i = lowest + 1; i < length; i++) {
    expect(gains[i]).toBeGreaterThanOrEqual(gains[i - 1]);
  }

  // Exactly 1, not 0.9999999: this is what UNITY_SNAP buys, and it is what
  // makes the bit-exact passthrough recoverable after a burst.
  expect(gains[length - 1]).toBe(1);
});

it.each([50, 168, 500])(
  "recovers 10-90%% over the release time (%i ms)",
  (releaseMs) => {
    const length = SAMPLE_RATE * 3;
    const input = fill(length, (i) =>
      i < 2000 ? 4 * Math.sin((2 * Math.PI * 300 * i) / SAMPLE_RATE) : 0,
    );

    const { gains } = process([input], { releaseMs });

    let lowest = 0;
    for (let i = 1; i < length; i++) if (gains[i] < gains[lowest]) lowest = i;

    const floor = gains[lowest];
    const at = (fraction: number) => {
      const target = floor + fraction * (1 - floor);
      for (let i = lowest; i < length; i++) if (gains[i] >= target) return i;
      return length;
    };

    // `release` is the 10-90% recovery span, not a time constant. A limiter
    // labelled under the "sum of the two time constants" convention would land
    // near 0.6x this, so 15% is a wide enough band to be about the port and a
    // narrow enough one to catch the convention drifting back.
    const spanMs = ((at(0.9) - at(0.1)) / SAMPLE_RATE) * 1000;
    expect(spanMs).toBeGreaterThan(releaseMs * 0.85);
    expect(spanMs).toBeLessThan(releaseMs * 1.15);
  },
);

describe("the sliding minimum", () => {
  it.each([1, 2, 3, 17])(
    "matches a naive scan over a window of %i",
    (window) => {
      const next = random(11 + window);
      const push = createSlidingMin(window);

      const values: number[] = [];
      let walk = 0;
      for (let i = 0; i < 500; i++) {
        walk += next() - 0.5;
        values.push(walk);

        const naive = Math.min(...values.slice(Math.max(0, i - window + 1)));
        expect(push(walk)).toBe(naive);
      }
    },
  );
});

describe("the true-peak detector", () => {
  /** The detector's reading for a steady full-scale sine, in dB. */
  function readSine(freq: number, phase: number) {
    const detector = createTruePeakDetector();
    detector.channels(1);

    let peak = 0;
    for (let i = 0; i < 12000; i++) {
      detector.advance();
      detector.write(
        0,
        Math.fround(Math.sin((2 * Math.PI * freq * i) / SAMPLE_RATE + phase)),
      );
      // Skip the fill: until the ring holds real samples the convolution is
      // running against the zeros it was created with.
      if (i < 2 * TP_DELAY * 2) continue;
      peak = Math.max(peak, detector.peak(1));
    }
    return 20 * Math.log10(peak);
  }

  const worstOver = (freq: number) => {
    let worst = 0;
    for (let k = 0; k < 16; k++) {
      const db = readSine(freq, (k * Math.PI) / 8);
      if (Math.abs(db) > Math.abs(worst)) worst = db;
    }
    return worst;
  };

  // A sine's true peak is its amplitude, analytically - so this needs no
  // second implementation to say what the right answer is. It is the
  // assertion that backs the "BS.1770-style, not the ITU coefficients"
  // wording: what the package claims about its filter is measured here.
  it.each([60, 100, 220, 440, 1000, 2000, 3150, 5000, 8000, 10000])(
    "reads a full-scale %i Hz sine within 0.1 dB",
    (freq) => {
      expect(Math.abs(worstOver(freq))).toBeLessThan(0.1);
    },
  );

  // Above 10 kHz the limit is the 4x grid rather than the filter: 4 points per
  // input sample is only ~9.6 per cycle at 20 kHz, so the densest
  // reconstruction point can sit measurably below the true peak. Every
  // BS.1770 4x detector reads low here; the bound is asserted rather than
  // hidden, and it is one-sided - the detector never reads high.
  it.each([12000, 14000, 16000, 18000, 20000])(
    "reads a full-scale %i Hz sine within 0.35 dB",
    (freq) => {
      expect(Math.abs(worstOver(freq))).toBeLessThan(0.35);
    },
  );
});

describe("lookahead sizing", () => {
  it("clamps to the supported range", () => {
    expect(lookaheadSamples(0.1, SAMPLE_RATE)).toBe(24); // 0.5 ms floor
    expect(lookaheadSamples(2, SAMPLE_RATE)).toBe(96);
    expect(lookaheadSamples(50, SAMPLE_RATE)).toBe(240); // 5 ms ceiling
  });

  it("reports the detector's group delay on top of the window", () => {
    expect(latencySamples(2, SAMPLE_RATE)).toBe(96 + TP_DELAY);
    expect(createLimiter(SAMPLE_RATE, 2).latency).toBe(102);
  });
});

it("keeps running with no input connected", () => {
  // An unconnected input arrives as `[]`. The limiter must still flush its
  // tail and recover, rather than freezing both.
  const limiter = createLimiter(SAMPLE_RATE, LOOKAHEAD_MS);
  const loud = fill(128, () => 3);
  const output = new Float32Array(128);

  limiter([loud], [output], constant(THRESHOLD_DB), 168, constant(0));
  expect(limiter.stats().minGain).toBeLessThan(1);

  for (let block = 0; block < 8; block++) {
    limiter([], [output], constant(THRESHOLD_DB), 168, constant(0));
  }
  // The tail came out and then ran dry - not a frozen last block.
  expect(Array.from(output)).toEqual(Array.from(new Float32Array(128)));
});

it("matches its recorded shape", () => {
  // A short deterministic run at a low sample rate: a change in any of the
  // seven steps moves these numbers.
  const limiter = createLimiter(1000, 2);
  const input = Float32Array.from({ length: 32 }, (_, i) =>
    i < 16 ? 2 * Math.sin((2 * Math.PI * 50 * i) / 1000) : 0,
  );
  const output = new Float32Array(32);
  const gains = new Float32Array(32);

  limiter([input], [output], constant(-1), 100, constant(0), gains);

  expect(Array.from(gains, (g) => Number(g.toFixed(4)))).toMatchSnapshot();
  expect(Array.from(output, (v) => Number(v.toFixed(4)))).toMatchSnapshot();
});
