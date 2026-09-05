import { createDelayLine } from "./_delay";

const SAMPLE_RATE = 44100;

/** Write `values` into a fresh line and hand it back. */
function filled(maxSamples: number, values: ArrayLike<number>) {
  const line = createDelayLine(maxSamples);
  for (let i = 0; i < values.length; i++) line.write(values[i]);
  return line;
}

const rms = (values: ArrayLike<number>) => {
  let sum = 0;
  for (let i = 0; i < values.length; i++) sum += values[i] * values[i];
  return Math.sqrt(sum / values.length);
};

describe("createDelayLine", () => {
  it("rounds up to a power of two with room for Hermite's support", () => {
    // 60 + 4 fits 64; 61 + 4 does not, so it takes the next one.
    expect(createDelayLine(60).size).toBe(64);
    expect(createDelayLine(61).size).toBe(128);
    expect(createDelayLine(1).size).toBe(8);
  });

  it("starts zeroed", () => {
    const line = createDelayLine(60);
    expect(line.read(0)).toBe(0);
    expect(line.read(40)).toBe(0);
  });
});

describe("read", () => {
  it("returns the sample written `delay` writes ago, across three wraps", () => {
    const line = createDelayLine(60);
    const size = line.size;
    const written: number[] = [];
    const problems: unknown[] = [];

    // Three full wraps and change, so a read that mishandles the negative
    // difference cannot pass by never crossing zero.
    for (let n = 0; n < size * 3 + 7; n++) {
      const value = Math.sin(n * 0.37);
      line.write(value);
      written.push(value);

      for (let d = 0; d <= size - 4; d++) {
        if (d >= written.length) break;
        const expected = Math.fround(written[written.length - 1 - d]);
        if (line.read(d) !== expected)
          problems.push([n, d, line.read(d), expected]);
      }
    }

    expect(problems).toEqual([]);
  });

  it("reads exactly what the fractional reads read at integer delays", () => {
    const line = filled(
      60,
      Array.from({ length: 200 }, (_, i) => Math.sin(i * 0.21)),
    );
    const problems: unknown[] = [];

    for (let d = 1; d <= line.size - 4; d++) {
      if (line.readLinear(d) !== line.read(d)) problems.push(["linear", d]);
      if (line.readHermite(d) !== line.read(d)) problems.push(["hermite", d]);
    }

    expect(problems).toEqual([]);
  });
});

describe("readLinear", () => {
  it("lands on the analytic midpoint of a ramp", () => {
    // A ramp is the one signal linear interpolation is exact on, so this
    // checks the indexing rather than the kernel: at `d + 0.5` the answer is
    // the average of the samples at `d` and `d + 1`.
    const line = filled(
      60,
      Array.from({ length: 300 }, (_, i) => i / 300),
    );
    const problems: unknown[] = [];

    for (let d = 0; d <= line.size - 5; d++) {
      const expected = (line.read(d) + line.read(d + 1)) / 2;
      if (Math.abs(line.readLinear(d + 0.5) - expected) > 1e-6) {
        problems.push([d, line.readLinear(d + 0.5), expected]);
      }
    }

    expect(problems).toEqual([]);
  });
});

describe("readHermite", () => {
  it("reproduces a cubic exactly", () => {
    // The defining property of a 3rd-order interpolator, and the assertion
    // that catches a mistyped coefficient: a linear read fails it outright,
    // which is what makes it worth writing.
    const cubic = (x: number) =>
      0.4 - 0.03 * x + 0.0007 * x * x - 0.000004 * x * x * x;
    const length = 400;
    const line = filled(
      120,
      Array.from({ length }, (_, i) => cubic(i)),
    );
    const problems: unknown[] = [];
    let worstLinear = 0;

    for (let d = 1; d < line.size - 5; d += 0.25) {
      // `read(0)` is sample `length - 1`, so delay `d` is `length - 1 - d`.
      const expected = cubic(length - 1 - d);
      const error = Math.abs(line.readHermite(d) - expected);
      if (error > 1e-5) problems.push([d, line.readHermite(d), expected]);
      worstLinear = Math.max(
        worstLinear,
        Math.abs(line.readLinear(d) - expected),
      );
    }

    expect(problems).toEqual([]);
    // The control: the same sweep read linearly is nowhere near exact, so the
    // assertion above is testing the kernel and not the harness.
    expect(worstLinear).toBeGreaterThan(1e-3);
  });

  it("tracks a shifted sine more closely than a linear read", () => {
    // 1 kHz at 44.1 kHz, read at every fractional delay from 1 to 2, against
    // the analytically shifted sine.
    //
    // Measured worst absolute error over the sweep:
    //   hermite 3.31e-5   linear 2.02e-3   (61x)
    // The bounds below are those, with a 2x margin.
    const frequency = 1000;
    const length = 4000;
    const omega = (2 * Math.PI * frequency) / SAMPLE_RATE;
    const line = filled(
      600,
      Array.from({ length }, (_, i) => Math.sin(omega * i)),
    );

    let hermite = 0;
    let linear = 0;
    for (let d = 1; d <= 2; d += 1 / 64) {
      const expected = Math.sin(omega * (length - 1 - d));
      hermite = Math.max(hermite, Math.abs(line.readHermite(d) - expected));
      linear = Math.max(linear, Math.abs(line.readLinear(d) - expected));
    }

    expect(hermite).toBeLessThan(6.7e-5);
    expect(linear).toBeGreaterThan(1e-3);
    expect(hermite * 30).toBeLessThan(linear);
  });
});

describe("allpass", () => {
  // White noise in, the same energy out: that is what "allpass" means, and it
  // is the property that fails first if the feedback sum or the output sign is
  // written the other way round.
  it.each([0.3, 0.5, 0.7])("has flat magnitude at coefficient %p", (k) => {
    const line = createDelayLine(600);
    const length = 40000;
    const input = new Float32Array(length);
    const output = new Float32Array(length);

    let seed = 12345;
    for (let i = 0; i < length; i++) {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      input[i] = seed / 0x3fffffff - 1;
    }

    for (let i = 0; i < length; i++) output[i] = line.allpass(input[i], 137, k);

    // Discard the first 137 samples: the line starts empty, so the section has
    // not reached steady state until it has been round once.
    const ratio = rms(output.subarray(500)) / rms(input.subarray(500));
    expect(ratio).toBeGreaterThan(0.99);
    expect(ratio).toBeLessThan(1.01);
  });

  it("modulates its delay without discontinuity", () => {
    const line = createDelayLine(600);
    let previous = 0;
    let biggestJump = 0;

    for (let i = 0; i < 20000; i++) {
      const delay = 137 + 12 * Math.sin((2 * Math.PI * 0.7 * i) / SAMPLE_RATE);
      const y = line.allpass(Math.sin(i * 0.05), delay, 0.7);
      if (i > 500) biggestJump = Math.max(biggestJump, Math.abs(y - previous));
      previous = y;
    }

    // The input's own step at 0.05 rad/sample is about 0.05; a fractional read
    // that snapped to integers would show jumps an order of magnitude larger.
    expect(biggestJump).toBeLessThan(0.2);
  });
});

describe("allocation", () => {
  it("allocates nothing after construction", () => {
    const line = createDelayLine(600);
    const Real = globalThis.Float32Array;
    let constructions = 0;

    globalThis.Float32Array = new Proxy(Real, {
      construct(target, args: any[]) {
        constructions++;
        return new (target as any)(...args);
      },
    }) as any;

    try {
      for (let i = 0; i < 200; i++) {
        line.write(Math.sin(i));
        line.read(3);
        line.readLinear(3.25);
        line.readHermite(3.25);
        line.allpass(0.5, 17.5, 0.7);
      }
    } finally {
      globalThis.Float32Array = Real;
    }

    expect(constructions).toBe(0);
  });
});
