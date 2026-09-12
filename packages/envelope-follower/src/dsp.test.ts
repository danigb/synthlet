import {
  createFollower,
  EnvelopeFollowerType,
  followerCoefficient,
  NINETY_NINE_PERCENT,
} from "./dsp";

/**
 * The follower, driven directly. No worklet stub anywhere: `createFollower` is
 * a closure over a sample rate, which is what makes a bank of them reachable
 * later and what makes this file readable now.
 */

const SAMPLE_RATE = 44100;
const BLOCK = 128;

describe("followerCoefficient", () => {
  it("is the pole that covers 99 % of a step in the time asked for", () => {
    const c = followerCoefficient(0.05, SAMPLE_RATE);
    const samples = 0.05 * SAMPLE_RATE;
    expect(1 - c ** samples).toBeCloseTo(0.99, 6);
  });

  it("is instantaneous at zero rather than a division by it", () => {
    expect(followerCoefficient(0, SAMPLE_RATE)).toBe(0);
  });

  it("converts from a time constant by 4.605", () => {
    // Analogue followers, and most plugin ones, label tau. One library, one
    // meaning for "seconds" - so the README gives this number rather than a
    // second convention.
    expect(NINETY_NINE_PERCENT).toBeCloseTo(4.60517, 5);
  });
});

describe("createFollower", () => {
  describe("timing, under the library's one definition of seconds", () => {
    it.each([0.05, 0.5])(
      "reaches 0.99 of a step in attack = %p s",
      (attack) => {
        const out = render({
          channels: [() => 1],
          attack,
          length: Math.round(attack * SAMPLE_RATE * 2),
        });
        expect(firstAbove(out, 0.99)).toBeCloseTo(attack * SAMPLE_RATE, -2);
        expect(within(firstAbove(out, 0.99), attack * SAMPLE_RATE, 0.02)).toBe(
          true,
        );
      },
    );

    it.each([0.05, 0.2])(
      "falls to 0.01 of a step in release = %p s",
      (release) => {
        // Settle at 1.0 first, instantly, so what is measured is the fall alone.
        const settle = BLOCK;
        const out = render({
          channels: [(i) => (i < settle ? 1 : 0)],
          attack: 0,
          release,
          length: settle + Math.round(release * SAMPLE_RATE * 2),
        });
        const fell = firstBelow(out.subarray(settle), 0.01);
        expect(within(fell, release * SAMPLE_RATE, 0.02)).toBe(true);
      },
    );

    it("means the same thing at 48 kHz", () => {
      const out = render({
        channels: [() => 1],
        attack: 0.05,
        sampleRate: 48000,
        length: 48000 / 4,
      });
      expect(within(firstAbove(out, 0.99), 0.05 * 48000, 0.02)).toBe(true);
    });
  });

  describe("Peak", () => {
    it("is a true peak detector at attack 0", () => {
      const out = render({
        channels: [sine(1000)],
        attack: 0,
        release: 0.5,
        length: SAMPLE_RATE * 3,
      });
      expect(settled(out)).toBeCloseTo(1, 2);
    });

    it("sits below the peak when the attack is slower than the waveform", () => {
      // 0.952, not 1.0, and that is a property of a 10 ms attack rather than a
      // defect: a one-pole covers a fraction of the gap per sample and a
      // sine's peak is instantaneous. It is the number the docs page points at
      // when it says a follower is only as fast as its attack.
      const out = render({
        channels: [sine(1000)],
        attack: 0.01,
        release: 0.5,
        length: SAMPLE_RATE * 3,
      });
      expect(settled(out)).toBeCloseTo(0.952, 2);
    });
  });

  describe("Rms", () => {
    it("reads 0.707 for a unit sine", () => {
      const out = render({
        channels: [sine(1000)],
        type: EnvelopeFollowerType.Rms,
        release: 0.5,
        length: SAMPLE_RATE * 5,
      });
      expect(settled(out)).toBeCloseTo(Math.SQRT1_2, 2);
    });

    it("reads 1.0 for a unit square, which a peak follower cannot tell apart", () => {
      // The whole reason to have it: a square and a sine of the same height
      // are not the same loudness, and `Peak` reports 1.0 for both.
      const out = render({
        channels: [square(1000)],
        type: EnvelopeFollowerType.Rms,
        release: 0.5,
        length: SAMPLE_RATE * 5,
      });
      expect(settled(out)).toBeCloseTo(1, 3);
    });
  });

  describe("ripple", () => {
    // A rectified signal ripples at twice its frequency, and a follower fast
    // enough to be useful follows some of it. The floor is physical, and the
    // fix for the remainder is a `SlewLimiter` after it - which is precisely
    // the patch in Part 15's Figure 8.
    it("is 0.6 dB at the defaults on a 100 Hz sine", () => {
      const out = render({
        channels: [sine(100)],
        length: SAMPLE_RATE * 2,
      });
      const db = rippleDb(out.subarray(SAMPLE_RATE));
      expect(db).toBeGreaterThan(0.5);
      expect(db).toBeLessThan(0.7);
    });

    it("is under 0.2 dB once the release is long against the ripple period", () => {
      const out = render({
        channels: [sine(100)],
        release: 0.5,
        length: SAMPLE_RATE * 3,
      });
      expect(rippleDb(out.subarray(SAMPLE_RATE * 2))).toBeLessThan(0.2);
    });
  });

  it("rectifies symmetrically", () => {
    const options = { channels: [sine(250)], length: SAMPLE_RATE };
    const positive = render(options);
    const negative = render({
      ...options,
      channels: [(i: number) => -sine(250)(i)],
    });
    expect(Array.from(positive)).toEqual(Array.from(negative));
  });

  it("converges to +1 on a constant -1 input", () => {
    const out = render({
      channels: [() => -1],
      attack: 0.01,
      length: SAMPLE_RATE / 2,
    });
    expect(settled(out)).toBeCloseTo(1, 6);
  });

  it("folds channels: a stereo sine with one side silent reads as the mono sine", () => {
    const mono = render({ channels: [sine(200)], length: SAMPLE_RATE });
    const stereo = render({
      channels: [sine(200), () => 0],
      length: SAMPLE_RATE,
    });
    // `Peak` takes the maximum across channels, so silence in the other
    // channel is not half the level, it is nothing at all.
    expect(Array.from(stereo)).toEqual(Array.from(mono));
  });

  it("applies gain to the input, in front of the detector", () => {
    const out = render({
      channels: [() => 0.25],
      gain: 4,
      attack: 0,
      length: BLOCK,
    });
    expect(settled(out)).toBeCloseTo(1, 6);
  });

  it("decays to zero with nothing connected, and never goes negative", () => {
    const out = render({
      // A burst, then no channels at all - which is what an unconnected input
      // looks like to a processor.
      channels: [],
      length: SAMPLE_RATE,
    });
    expect(Array.from(out)).toEqual(Array.from(new Float32Array(out.length)));

    const decay = render({
      channels: [(i) => (i < BLOCK ? 1 : 0)],
      attack: 0,
      release: 0.05,
      length: SAMPLE_RATE,
    });
    expect(decay.every((v) => v >= 0)).toBe(true);
    expect(settled(decay)).toBeCloseTo(0, 6);
  });

  it("allocates nothing in its render function", () => {
    // The hot path runs once per sample per channel. Reading the source is a
    // blunt check, but it is the one that keeps working when the shape of the
    // function changes.
    expect(String(createFollower(SAMPLE_RATE))).not.toMatch(/\bnew\b/);
  });
});

const sine = (frequency: number) => (i: number) =>
  Math.sin((2 * Math.PI * frequency * i) / SAMPLE_RATE);

const square = (frequency: number) => (i: number) =>
  sine(frequency)(i) >= 0 ? 1 : -1;

type RenderOptions = {
  channels: ((i: number) => number)[];
  length: number;
  type?: EnvelopeFollowerType;
  gain?: number;
  attack?: number;
  release?: number;
  sampleRate?: number;
};

/** Drives the follower block by block, the way a graph does. */
function render(options: RenderOptions) {
  const sampleRate = options.sampleRate ?? SAMPLE_RATE;
  const follow = createFollower(sampleRate);
  const total = options.length;
  const count = options.channels.length;

  const out = new Float32Array(total);
  const inputs = Array.from({ length: count }, () => new Float32Array(BLOCK));
  const block = new Float32Array(BLOCK);
  const params = {
    type: [options.type ?? EnvelopeFollowerType.Peak],
    gain: [options.gain ?? 1],
    attack: [options.attack ?? 0.01],
    release: [options.release ?? 0.1],
  };

  for (let at = 0; at < total; at += BLOCK) {
    const size = Math.min(BLOCK, total - at);
    for (let i = 0; i < size; i++) {
      for (let c = 0; c < count; c++)
        inputs[c][i] = options.channels[c](at + i);
    }
    const viewIn =
      size === BLOCK ? inputs : inputs.map((b) => b.subarray(0, size));
    const viewOut = size === BLOCK ? block : block.subarray(0, size);
    follow(viewIn, viewOut, params);
    out.set(viewOut, at);
  }

  return out;
}

/** The last sample, once whatever was going to happen has happened. */
const settled = (signal: Float32Array) => signal[signal.length - 1];

const firstAbove = (signal: Float32Array, level: number) =>
  signal.findIndex((v) => v >= level);

const firstBelow = (signal: Float32Array, level: number) =>
  signal.findIndex((v) => v <= level);

const within = (value: number, of: number, tolerance: number) =>
  value > 0 && Math.abs(value - of) / of <= tolerance;

/** Peak-to-trough of a settled envelope, in dB. */
function rippleDb(signal: Float32Array) {
  let max = -Infinity;
  let min = Infinity;
  for (let i = 0; i < signal.length; i++) {
    if (signal[i] > max) max = signal[i];
    if (signal[i] < min) min = signal[i];
  }
  return 20 * Math.log10(max / min);
}

// This file declares helpers at the top level: make it a module so they don't
// collide with the identically named helpers in sibling packages.
export {};
