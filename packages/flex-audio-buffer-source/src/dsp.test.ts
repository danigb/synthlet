import { createFlexSource, DEFAULT_CONFIG, type FlexConfig } from "./dsp";
import { HALF_TAPS, reachFor, resampleAt } from "./resampler";

const SAMPLE_RATE = 44100;

const config = (over: Partial<FlexConfig> = {}): FlexConfig => ({
  sampleRate: SAMPLE_RATE,
  ...DEFAULT_CONFIG,
  channels: 1,
  ...over,
});

const sine = (length: number, frequency: number) =>
  Float32Array.from({ length }, (_, i) =>
    Math.sin((2 * Math.PI * frequency * i) / SAMPLE_RATE),
  );

/** Play a whole buffer through the kernel and return the rendered channels. */
function render(
  source: Float32Array[],
  playbackRate: number,
  detune: number,
  over: Partial<FlexConfig> = {},
) {
  const flex = createFlexSource(config({ channels: source.length, ...over }));
  flex.setBuffer(source);
  flex.start(0, 0);

  const block = 128;
  const chunks: Float32Array[][] = [];
  let guard = 0;
  while (guard++ < 4000) {
    const outputs = source.map(() => new Float32Array(block));
    const done = flex.process(outputs, 0, block, playbackRate, detune);
    chunks.push(outputs);
    if (done) break;
  }
  if (guard >= 4000) throw Error("render did not finish: playback never ended");

  return source.map((_, c) => {
    const joined = new Float32Array(chunks.length * block);
    chunks.forEach((chunk, i) => joined.set(chunk[c], i * block));
    return joined;
  });
}

/** Dominant period by autocorrelation, in samples. */
function period(signal: Float32Array, min = 20, max = 900) {
  // O(n * lags): cap the window, a fifth of a second is ample to find a pitch.
  if (signal.length > 20000) signal = signal.subarray(0, 20000);
  let bestLag = min;
  let best = -Infinity;
  for (let lag = min; lag <= max; lag++) {
    let dot = 0;
    for (let i = 0; i + lag < signal.length; i++)
      dot += signal[i] * signal[i + lag];
    if (dot > best) {
      best = dot;
      bestLag = lag;
    }
  }
  return bestLag;
}

const rms = (signal: Float32Array) => {
  let sum = 0;
  for (const value of signal) sum += value * value;
  return Math.sqrt(sum / Math.max(1, signal.length));
};

/** Where the rendered signal stops being non-trivial, in samples. */
function audibleLength(signal: Float32Array, floor = 0.02) {
  for (let i = signal.length - 1; i >= 0; i--) {
    if (Math.abs(signal[i]) > floor) return i + 1;
  }
  return 0;
}

/** Magnitude of a single bin, by direct correlation. */
function binMagnitude(signal: Float32Array, frequency: number) {
  let re = 0;
  let im = 0;
  for (let i = 0; i < signal.length; i++) {
    const angle = (2 * Math.PI * frequency * i) / SAMPLE_RATE;
    re += signal[i] * Math.cos(angle);
    im += signal[i] * Math.sin(angle);
  }
  return (2 * Math.sqrt(re * re + im * im)) / signal.length;
}

describe("resampleAt", () => {
  it("is an exact passthrough at ratio 1 and integer positions", () => {
    const input = sine(2000, 300);
    const read = (n: number) => (n < 0 || n >= input.length ? 0 : input[n]);
    for (let n = 500; n < 520; n++) {
      expect(resampleAt(read, n, 1, 0, input.length)).toBeCloseTo(input[n], 6);
    }
  });

  it("interpolates a half sample within a hair of the true value", () => {
    const input = sine(2000, 300);
    const read = (n: number) => (n < 0 || n >= input.length ? 0 : input[n]);
    for (let n = 500; n < 520; n++) {
      const exact = Math.sin((2 * Math.PI * 300 * (n + 0.5)) / SAMPLE_RATE);
      expect(resampleAt(read, n + 0.5, 1, 0, input.length)).toBeCloseTo(
        exact,
        4,
      );
    }
  });

  it("widens its reach when reading faster, to keep the cutoff at Nyquist/β", () => {
    expect(reachFor(1)).toBe(HALF_TAPS + 1);
    expect(reachFor(2)).toBe(2 * HALF_TAPS + 1);
  });

  it("does not fade in at the start of a buffer", () => {
    // The taps reaching back before sample 0 read zero. Dividing by the
    // realised tap weight rather than a constant is what keeps the first
    // samples at full amplitude.
    const input = new Float32Array(2000).fill(1);
    const read = (n: number) => (n < 0 || n >= input.length ? 0 : input[n]);
    for (let n = 0; n < 8; n++) {
      expect(resampleAt(read, n + 0.5, 1.5, 0, input.length)).toBeCloseTo(1, 3);
    }
  });
});

describe("createFlexSource", () => {
  describe("time, at constant pitch", () => {
    it.each([
      [0.5, 2],
      [1, 1],
      [2, 0.5],
    ])("playbackRate %p renders %px the length", (rate, factor) => {
      const input = sine(44100, 220);
      const [output] = render([input], rate, 0);
      const ratio = audibleLength(output) / input.length;
      expect(ratio).toBeGreaterThan(factor * 0.9);
      expect(ratio).toBeLessThan(factor * 1.1);
    });

    it.each([0.5, 1, 2])("keeps pitch at playbackRate %p", (rate) => {
      const input = sine(44100, 220);
      const [output] = render([input], rate, 0);
      const body = output.subarray(4000, audibleLength(output) - 4000);
      expect(Math.abs(period(body) - SAMPLE_RATE / 220)).toBeLessThan(2);
    });
  });

  describe("pitch, at constant duration", () => {
    it.each([
      [1200, 2],
      [700, 1.4983],
      [-700, 0.6674],
      [-1200, 0.5],
    ])("detune %p multiplies pitch by %p", (cents, ratio) => {
      const input = sine(44100, 220);
      const [output] = render([input], 1, cents);
      const body = output.subarray(4000, audibleLength(output) - 4000);
      const expected = SAMPLE_RATE / (220 * ratio);
      expect(Math.abs(period(body) - expected) / expected).toBeLessThan(0.02);
    });

    it.each([-1200, -700, 0, 700, 1200])(
      "holds duration at detune %p",
      (cents) => {
        const input = sine(44100, 220);
        const [output] = render([input], 1, cents);
        const ratio = audibleLength(output) / input.length;
        expect(ratio).toBeGreaterThan(0.9);
        expect(ratio).toBeLessThan(1.1);
      },
    );
  });

  it("is an exact passthrough of the engine at detune 0", () => {
    // The bypass must be bit-identical, not merely close: this is what makes
    // automating `detune` through zero click-free.
    const input = sine(20000, 330);
    const [pitched] = render([input], 1, 0);
    for (let i = 0; i < 2000; i++) {
      expect(pitched[i]).toBeCloseTo(input[i], 6);
    }
  });

  it("does not alias when pitching up", () => {
    // A 10 kHz tone shifted up an octave lands at 20 kHz. Without the kernel
    // stretch it would fold back below 10 kHz instead.
    const input = sine(30000, 10000);
    const [output] = render([input], 1, 1200);
    const body = output.subarray(4000, 20000);

    const reference = binMagnitude(body, 20000);
    for (const frequency of [2000, 4000, 6000, 8000, 9000]) {
      const magnitude = binMagnitude(body, frequency);
      expect(
        20 * Math.log10(magnitude / Math.max(reference, 1e-9)),
      ).toBeLessThan(-60);
    }
  });

  it("combines rate and pitch independently", () => {
    const input = sine(44100, 220);
    const [output] = render([input], 0.5, 1200);
    const body = output.subarray(4000, audibleLength(output) - 4000);
    // Twice as long, an octave up.
    expect(audibleLength(output) / input.length).toBeGreaterThan(1.8);
    expect(Math.abs(period(body) - SAMPLE_RATE / 440)).toBeLessThan(2);
  });

  // Success criterion 2, as far as a test can carry it: a rate that changes
  // during playback must change the tempo and leave the pitch alone. The
  // audible half - that it ramps without artefacts beyond WSOLA's own
  // character - is still a listening test.
  it("changes tempo mid-playback without moving the pitch", () => {
    const input = sine(60000, 220);
    const flex = createFlexSource(config());
    flex.setBuffer([input]);
    flex.start(0, 0);

    const block = 128;
    const halves: Float32Array[][] = [[], []];
    // 60 blocks at rate 1, then 60 at rate 0.5, sweeping through the middle so
    // the engine sees a ramp rather than one step.
    for (let b = 0; b < 120; b++) {
      const rate = b < 50 ? 1 : b > 70 ? 0.5 : 1 - ((b - 50) / 20) * 0.5;
      const out = [new Float32Array(block)];
      flex.process(out, 0, block, rate, 0);
      if (b < 40) halves[0].push(out[0]);
      if (b >= 80) halves[1].push(out[0]);
    }

    const join = (blocks: Float32Array[]) => {
      const joined = new Float32Array(blocks.length * block);
      blocks.forEach((chunk, i) => joined.set(chunk, i * block));
      return joined;
    };
    const fast = join(halves[0]);
    const slow = join(halves[1]);

    // Pitch is the same either side of the ramp...
    const expected = SAMPLE_RATE / 220;
    expect(Math.abs(period(fast) - expected)).toBeLessThan(2);
    expect(Math.abs(period(slow) - expected)).toBeLessThan(2);
    // ...and neither half has collapsed to silence or blown up.
    expect(rms(fast)).toBeGreaterThan(0.5);
    expect(rms(slow)).toBeGreaterThan(0.5);
    expect(Math.max(...Array.from(slow).map(Math.abs))).toBeLessThan(1.5);
  });

  it("consumes the source more slowly at a lower rate", () => {
    // The tempo half of the criterion above, measured directly: at rate 0.5
    // the same number of output blocks covers half as much of the source.
    const input = sine(80000, 220);
    const consumed = (rate: number) => {
      const flex = createFlexSource(config());
      flex.setBuffer([input]);
      flex.start(0, 0);
      let blocks = 0;
      while (!flex.process([new Float32Array(128)], 0, 128, rate, 0)) {
        if (++blocks > 4000) throw Error("never ended");
      }
      return blocks;
    };
    const atOne = consumed(1);
    const atHalf = consumed(0.5);
    expect(atHalf / atOne).toBeGreaterThan(1.9);
    expect(atHalf / atOne).toBeLessThan(2.1);
  });

  it("plays a region given by offset and duration", () => {
    const input = sine(30000, 440);
    const flex = createFlexSource(config());
    flex.setBuffer([input]);
    flex.start(10000, 5000);

    const out = [new Float32Array(64)];
    flex.process(out, 0, 64, 1, 0);
    for (let i = 0; i < 64; i++) {
      expect(out[0][i]).toBeCloseTo(input[10000 + i], 5);
    }
  });

  it("reports done once and then falls silent", () => {
    const input = sine(4000, 300);
    const flex = createFlexSource(config());
    flex.setBuffer([input]);
    flex.start(0, 0);

    let ended = 0;
    for (let i = 0; i < 200; i++) {
      if (flex.process([new Float32Array(128)], 0, 128, 1, 0)) ended++;
    }
    expect(ended).toBe(1);
    expect(flex.isPlaying()).toBe(false);

    const after = [new Float32Array(128)];
    flex.process(after, 0, 128, 1, 0);
    expect(Array.from(after[0])).toEqual(new Array(128).fill(0));
  });

  it("is silent before start and after stop", () => {
    const input = sine(20000, 300);
    const flex = createFlexSource(config());
    flex.setBuffer([input]);

    const before = [new Float32Array(64)];
    flex.process(before, 0, 64, 1, 0);
    expect(Array.from(before[0])).toEqual(new Array(64).fill(0));

    flex.start(0, 0);
    flex.process([new Float32Array(64)], 0, 64, 1, 0);
    flex.stop();

    const after = [new Float32Array(64)];
    flex.process(after, 0, 64, 1, 0);
    expect(Array.from(after[0])).toEqual(new Array(64).fill(0));
  });

  it("restarts from the top", () => {
    const input = sine(20000, 275);
    const flex = createFlexSource(config());
    flex.setBuffer([input]);

    const first = [new Float32Array(256)];
    flex.start(0, 0);
    flex.process(first, 0, 256, 0.8, 300);

    const second = [new Float32Array(256)];
    flex.start(0, 0);
    flex.process(second, 0, 256, 0.8, 300);

    expect(Array.from(second[0])).toEqual(Array.from(first[0]));
  });

  it("keeps a hard-panned stereo source panned", () => {
    const left = sine(20000, 220);
    const right = new Float32Array(20000);
    const [outLeft, outRight] = render([left, right], 0.5, 700);
    expect(rms(outLeft)).toBeGreaterThan(0.1);
    expect(rms(outRight)).toBe(0);
  });

  it("allocates nothing after construction", () => {
    const input = sine(40000, 220);
    const flex = createFlexSource(config());
    flex.setBuffer([input]);
    flex.start(0, 0);
    const outputs = [new Float32Array(128)];
    flex.process(outputs, 0, 128, 1, 0);

    const before = (globalThis as any).Float32Array;
    let allocations = 0;
    (globalThis as any).Float32Array = new Proxy(before, {
      construct(target, args) {
        allocations++;
        return new target(...(args as [number]));
      },
    });
    try {
      for (let i = 0; i < 150; i++) {
        flex.process(outputs, 0, 128, 0.8 + (i % 5) * 0.1, (i % 7) * 100);
      }
    } finally {
      (globalThis as any).Float32Array = before;
    }
    expect(allocations).toBe(0);
  });

  it("renders a snapshot", () => {
    const input = sine(8000, 220);
    const [output] = render([input], 0.5, 700);
    const sampled = Array.from(output.subarray(0, 400))
      .filter((_, i) => i % 20 === 0)
      .map((value) => Math.round(value * 1e4) / 1e4);
    expect(sampled).toMatchSnapshot();
  });
});
