import { magnitudes, peakFrequency, rt60 } from "./_spectrum";
import { createResonatorBank, FIELDS, packModes } from "./dsp";
import {
  cowbell,
  harmonic,
  kettleDrum,
  membrane,
  ResonatorMode,
} from "./modes";

/**
 * The modal resonator, measured on the real processor.
 *
 * Every table here is one of Synth Secrets' - Part 32's kettle drum, Part 41's
 * cowbell - and every assertion reads it back off the output the way Reid read
 * it off a spectrogram: where the peaks are, how loud each partial is at the
 * strike, how long each one takes to die.
 *
 * The processor is driven **block by block**, 128 samples at a time, because a
 * k-rate parameter arrives once per block and the coefficient ramp that answers
 * a sweep only exists at block edges. Rendering a second in one call would be
 * testing a processor no browser would ever run.
 *
 * Every figure pinned below was measured on a model of this engine before it
 * was written, and the tolerance is around the figure rather than a floor under
 * it - so a regression that still clears the ticket's line is caught anyway.
 */

const SAMPLE_RATE = 44100;
const BLOCK = 128;
const T60 = Math.log(1000);

describe("ModalResonatorProcessor", () => {
  let Worklet: any;

  beforeAll(async () => {
    createWorkletTestContext(SAMPLE_RATE);
    Worklet = (await import("./worklet")).ModalResonatorProcessor;
  });

  afterEach(() => {
    createWorkletTestContext(SAMPLE_RATE);
  });

  it("registers processor", () => {
    expect(global.registerProcessor).toHaveBeenCalledWith(
      "ModalResonatorProcessor",
      Worklet,
    );
  });

  it("stops on DISPOSE", () => {
    const processor = create(Worklet, SAMPLE_RATE);
    const block = [new Float32Array(BLOCK)];
    const params = { frequency: [220], decay: [1], brightness: [1] };
    expect(processor.process([[]], [block], params)).toBe(true);
    processor.port.onmessage({ data: { type: "DISPOSE" } });
    expect(processor.process([[]], [block], params)).toBe(false);
  });

  // -------------------------------------------------------------------------
  // One mode
  // -------------------------------------------------------------------------

  describe("one mode rings true", () => {
    const ONE: ResonatorMode[] = [{ ratio: 1, level: 1, decay: 1 }];

    describe.each([44100, 48000])("at %d Hz", (sampleRate) => {
      it.each([
        [1, 1.0],
        [0.25, 0.25],
      ])("decay %d falls 60 dB in %d s", (decay, seconds) => {
        const { out } = render(Worklet, sampleRate, {
          length: 2 * sampleRate,
          modes: ONE,
          params: { frequency: 440, decay },
        });

        // Least-squares over -5...-35 dB, extrapolated to -60. Measured
        // 1.0000 and 0.2499 at 44.1 kHz, 0.9999 and 0.2498 at 48 kHz.
        expect(Math.abs(rt60(out, sampleRate) / seconds - 1)).toBeLessThan(
          0.02,
        );

        // A sine at 440 Hz, within one bin (0.67 Hz at 44.1 kHz).
        expect(Math.abs(peakFrequency(out, sampleRate) - 440)).toBeLessThan(
          binWidth(out, sampleRate),
        );
      });
    });

    it("has nothing else in its spectrum", () => {
      // "every other bin 40 dB down" - taken as every bin more than 20 Hz
      // from the mode, because the bins beside a decaying sine are its own
      // skirt rather than something else. Measured -89.8 dB.
      const { out } = render(Worklet, SAMPLE_RATE, {
        length: 2 * SAMPLE_RATE,
        modes: ONE,
        params: { frequency: 440 },
      });
      const spectrum = magnitudes(out);
      const bin = binWidth(out, SAMPLE_RATE);
      const top = Math.max(...spectrum);
      let loudest = -Infinity;
      for (let i = 1; i < spectrum.length; i++) {
        if (Math.abs(i * bin - 440) > 20) {
          loudest = Math.max(loudest, db(spectrum[i] / top));
        }
      }
      expect(loudest).toBeLessThan(-40);
      expect(loudest).toBeLessThan(-80);
    });

    it("puts the envelope at level on the strike, whatever the decay and pitch", () => {
      // The output is sine-phase and starts at zero, so its first *peak* is a
      // quarter cycle in and a little decayed (0.945 at 30 Hz, decay 1). The
      // claim that holds exactly is about the envelope - the length of the
      // mode's state vector - which is `level * r^n` from the first sample.
      for (const [frequency, decay, level] of [
        [440, 1, 1],
        [30, 0.01, 0.5],
        [4000, 10, 0.25],
      ]) {
        const { processor } = render(Worklet, SAMPLE_RATE, {
          length: BLOCK,
          modes: [{ ratio: 1, level, decay: 1 }],
          params: { frequency, decay },
        });
        const r = Math.exp(-T60 / (decay * SAMPLE_RATE));
        const envelope = Math.hypot(processor.b.u[0], processor.b.v[0]);
        const expected = level * Math.pow(r, BLOCK - 1);
        expect(Math.abs(envelope - expected) / expected).toBeLessThan(1e-9);
      }
    });
  });

  // -------------------------------------------------------------------------
  // The tables
  // -------------------------------------------------------------------------

  describe("the table is the sound: kettleDrum() at 150 Hz (Part 32)", () => {
    const { out } = renderOnce(() =>
      render(Worklet, SAMPLE_RATE, {
        length: SAMPLE_RATE,
        modes: kettleDrum(),
        params: { frequency: 150, decay: 1 },
      }),
    );
    const FREQUENCIES = [150, 225, 297, 366];

    it("peaks at Table 2's frequencies", () => {
      // docs/synth-secrets.md:4049-4055. Measured 149.4, 224.8, 297.4, 366.1
      // against a 1.35 Hz bin.
      const signal = out();
      const found = localMaxima(signal, SAMPLE_RATE, -40).map(([f]) => f);
      expect(found).toHaveLength(4);
      found.forEach((f, i) =>
        expect(Math.abs(f - FREQUENCIES[i])).toBeLessThan(
          binWidth(signal, SAMPLE_RATE),
        ),
      );
    });

    // Each mode's own envelope, by demodulating the sum at its frequency over
    // sliding Hann windows from 20 to 250 ms and fitting a straight line in dB.
    // A spectrum cannot answer "how loud at the strike": a decaying partial's
    // spectral peak is proportional to level x decay, which is why mode 3 is
    // the loudest line in `magnitudes` (-13.1, -1.9, 0, -10.8 dB) even though
    // mode 1 is the loudest at the strike.
    const fits = () =>
      FREQUENCIES.map((_, n) =>
        envelopeFit(out(), 150 * kettleDrum()[n].ratio, SAMPLE_RATE),
      );

    it("strikes 5 : 4 : 3 : 1, 10 ms in", () => {
      // docs/synth-secrets.md:4032. Measured 0, -1.46, -3.80, -13.39 dB
      // against the table's 0, -1.94, -4.44, -13.98: the modes that decay
      // slower have lost less of their level in 10 ms.
      const at10ms = fits().map((fit) => fit.at(0.01));
      const relative = at10ms.map((level) => level - at10ms[0]);
      const expected = [5, 4, 3, 1].map((level) => db(level / 5));
      relative.forEach((level, i) =>
        expect(Math.abs(level - expected[i])).toBeLessThan(1),
      );
    });

    it("decays 45 : 73 : 91 : 84", () => {
      // docs/synth-secrets.md:4030. With `decay: 1` the table's decays *are*
      // seconds, which is what "verbatim" buys. Measured 0.450, 0.730, 0.909,
      // 0.838.
      const expected = [0.45, 0.73, 0.91, 0.84];
      fits().forEach((fit, i) =>
        expect(Math.abs(fit.seconds / expected[i] - 1)).toBeLessThan(0.05),
      );
    });
  });

  it("cowbell() at 587 Hz is two tones and nothing else (Part 41)", () => {
    // docs/synth-secrets.md:5181. Four rows, two ratios: the impact and the
    // tail of each tone are one sine each. Measured 586.8 Hz and 845.2 Hz.
    const { out } = render(Worklet, SAMPLE_RATE, {
      length: SAMPLE_RATE,
      modes: cowbell(),
      params: { frequency: 587 },
    });
    const found = localMaxima(out, SAMPLE_RATE, -40).map(([f]) => f);
    expect(found).toHaveLength(2);
    expect(Math.abs(found[0] - 587)).toBeLessThan(binWidth(out, SAMPLE_RATE));
    expect(Math.abs(found[1] - 845)).toBeLessThan(binWidth(out, SAMPLE_RATE));
  });

  describe("brightness tilts", () => {
    const levelsAt = (brightness: number) => {
      const { out } = render(Worklet, SAMPLE_RATE, {
        length: 1 << 16,
        modes: harmonic(8),
        params: { frequency: 220, brightness },
      });
      const spectrum = magnitudes(out);
      const bin = binWidth(out, SAMPLE_RATE);
      const at = (f: number) => {
        const i = Math.round(f / bin);
        return Math.max(spectrum[i - 1], spectrum[i], spectrum[i + 1]);
      };
      return [1, 2, 3, 4, 5, 6, 7, 8].map((n) => db(at(220 * n) / at(220)));
    };

    it("leaves mode 1 alone at 0", () => {
      // The other modes get exactly no input; what is left at their bins is
      // mode 1's skirt. Measured -109 dB and below.
      const [, ...rest] = levelsAt(0);
      for (const level of rest) expect(level).toBeLessThan(-60);
    });

    it("puts mode 4 at -18 dB at 0.5", () => {
      // 0.5^3 = 0.125 = -18.06 dB. Measured -18.22.
      expect(Math.abs(levelsAt(0.5)[3] + 18)).toBeLessThan(1);
    });
  });

  it("silences every mode past 0.45 x sampleRate", () => {
    // harmonic(32) at 2 kHz: mode 9 is 18 kHz, mode 10 is 20 kHz and past
    // 0.45 x 44100 = 19845 Hz. Exactly nine peaks, at the nine modes below.
    const { out } = render(Worklet, SAMPLE_RATE, {
      length: 1 << 16,
      modes: harmonic(32),
      params: { frequency: 2000 },
    });
    const found = localMaxima(out, SAMPLE_RATE, -60).map(([f]) => f);
    expect(found).toHaveLength(9);
    found.forEach((f, i) =>
      expect(Math.abs(f - 2000 * (i + 1))).toBeLessThan(
        binWidth(out, SAMPLE_RATE),
      ),
    );
  });

  // -------------------------------------------------------------------------
  // Moving it while it rings
  // -------------------------------------------------------------------------

  describe("a frequency sweep", () => {
    const LENGTH = Math.round(0.1 * SAMPLE_RATE);
    const ONE: ResonatorMode[] = [{ ratio: 1, level: 1, decay: 1 }];
    const ramp = (seconds: number) =>
      seconds < 0.05 ? 100 + 2000 * seconds : 200;

    it("does not zipper", () => {
      // A coefficient step at a block edge is a kink, not a jump: the signal
      // stays continuous and only its slope changes. So the ticket's criterion
      // - the largest sample-to-sample step - cannot see it; even with no
      // interpolation a 100 -> 200 Hz sweep has a smaller largest step than a
      // tone held at 200 Hz (0.0199 against 0.0285), because it is never
      // faster than 200 Hz. The third difference sees the kink. Measured:
      // 1.58e-5 interpolated, 2.31e-5 held at 200 Hz, 7.38e-4 stepped.
      const sweep = render(Worklet, SAMPLE_RATE, {
        length: LENGTH,
        modes: ONE,
        params: (seconds) => ({ frequency: ramp(seconds) }),
      }).out;
      const held = render(Worklet, SAMPLE_RATE, {
        length: LENGTH,
        modes: ONE,
        params: { frequency: 200 },
      }).out;
      expect(thirdDifference(sweep)).toBeLessThanOrEqual(thirdDifference(held));

      // And the same bank with the ramp switched off fails it, by a lot - so
      // it is the ramp that passes the test and not the test that cannot fail.
      const bank = createResonatorBank(SAMPLE_RATE, 1, { interpolate: false });
      bank.setModes(packModes(ONE, 1), 1);
      const stepped = new Float32Array(LENGTH);
      const block = new Float32Array(BLOCK);
      for (let at = 0; at < LENGTH; at += BLOCK) {
        const x = new Float32Array(BLOCK);
        if (at === 0) x[0] = 1;
        bank.update(ramp(at / SAMPLE_RATE), 1, 1);
        bank.process([x], block);
        stepped.set(block.subarray(0, Math.min(BLOCK, LENGTH - at)), at);
      }
      expect(thirdDifference(stepped)).toBeGreaterThan(
        10 * thirdDifference(held),
      );

      // The ticket's own comparison, kept, and passing - for what it is worth.
      expect(maxStep(sweep)).toBeLessThanOrEqual(maxStep(held));
    });

    it("does not change the loudness of a ringing mode", () => {
      // A drum pitch envelope, 2000 -> 100 Hz in 50 ms, at decay 10 so the
      // envelope is still near full scale at 200 ms. The rotation preserves
      // the length of the state vector, so the envelope is where the decay
      // alone puts it: measured -0.32 dB. The direct-form resonator the ticket
      // first specified measured +12.9 dB on this exact case.
      const blocks = Math.ceil((0.2 * SAMPLE_RATE) / BLOCK);
      const { processor } = render(Worklet, SAMPLE_RATE, {
        length: blocks * BLOCK,
        modes: ONE,
        params: (seconds) => ({
          frequency: seconds < 0.05 ? 2000 - 38000 * seconds : 100,
          decay: 10,
        }),
      });
      const r = Math.exp(-T60 / (10 * SAMPLE_RATE));
      const expected = Math.pow(r, blocks * BLOCK - 1);
      const envelope = Math.hypot(processor.b.u[0], processor.b.v[0]);
      expect(Math.abs(db(envelope / expected))).toBeLessThan(0.5);
    });
  });

  describe("setModes mid-ring", () => {
    it.each([
      ["harmonic(8)", harmonic(8), "membrane()", membrane(), 440],
      ["harmonic(8)", harmonic(8), "kettleDrum()", kettleDrum(), 440],
      ["kettleDrum()", kettleDrum(), "harmonic(32)", harmonic(32), 150],
      ["harmonic(32)", harmonic(32), "cowbell()", cowbell(), 587],
    ] as const)("%s -> %s is clean", (_from, before, _to, after, frequency) => {
      // Measured worst ratio 0.843 over these four pairs and four times.
      for (const seconds of [0.05, 0.1, 0.2137, 0.3]) {
        const swap = Math.floor((seconds * SAMPLE_RATE) / BLOCK) * BLOCK;
        const { out } = render(Worklet, SAMPLE_RATE, {
          length: SAMPLE_RATE,
          modes: [...before],
          params: { frequency, decay: 2 },
          beforeBlock: (processor, at) => {
            if (at === swap) post(processor, [...after]);
          },
        });
        const pre = peakOf(out, 0, swap);
        const postPeak = peakOf(out, swap, out.length);
        expect(out.every(Number.isFinite)).toBe(true);
        expect(postPeak).toBeLessThanOrEqual(pre);
      }
    });

    it("keeps modes that are in both tables ringing", () => {
      // Swapping harmonic(8) for itself is not a restart.
      const struck = render(Worklet, SAMPLE_RATE, {
        length: SAMPLE_RATE / 4,
        modes: harmonic(8),
        params: { frequency: 220 },
      }).out;
      const swapped = render(Worklet, SAMPLE_RATE, {
        length: SAMPLE_RATE / 4,
        modes: harmonic(8),
        params: { frequency: 220 },
        beforeBlock: (processor, at) => {
          if (at === 40 * BLOCK) post(processor, harmonic(8));
        },
      }).out;
      expect(swapped).toEqual(struck);
    });

    it("truncates a table longer than the pool, silences a shrink, and grows back silent", () => {
      const processor = create(Worklet, SAMPLE_RATE, { maxModes: 32 });
      const bank = processor.b;
      post(processor, harmonic(40));
      step(processor, impulse);
      // 32 rows kept: mode 32 (index 31) rings and holds harmonic(40)'s 32nd
      // row, and the pool has no index 32 to put the rest in.
      expect(bank.u.length).toBe(32);
      expect(bank.table[31 * FIELDS]).toBe(32);
      expect(bank.table[31 * FIELDS + 1]).toBe(1 / 40);
      expect(Math.hypot(bank.u[31], bank.v[31])).toBeGreaterThan(0);

      post(processor, harmonic(4));
      step(processor, silence);
      for (let k = 4; k < 32; k++) {
        expect([bank.u[k], bank.v[k]]).toEqual([0, 0]);
      }

      post(processor, harmonic(32));
      step(processor, silence);
      for (let k = 4; k < 32; k++) {
        expect([bank.u[k], bank.v[k]]).toEqual([0, 0]);
      }
      expect(Math.hypot(bank.u[0], bank.v[0])).toBeGreaterThan(0);
    });

    it("silences a bad row rather than letting a NaN into the sum", () => {
      const good = harmonic(3);
      const bad: ResonatorMode[] = [
        good[0],
        { ratio: NaN, level: 1, decay: 1 },
        good[1],
        { ratio: 0, level: 1, decay: 1 },
        good[2],
        { ratio: 5, level: 1, decay: -1 },
        { ratio: 6, level: Infinity, decay: 1 },
      ];
      const clean = render(Worklet, SAMPLE_RATE, {
        length: SAMPLE_RATE / 4,
        modes: bad,
        params: { frequency: 220 },
      }).out;
      const expected = render(Worklet, SAMPLE_RATE, {
        length: SAMPLE_RATE / 4,
        modes: good,
        params: { frequency: 220 },
      }).out;
      expect(clean.every(Number.isFinite)).toBe(true);
      expect(clean).toEqual(expected);
    });
  });

  // -------------------------------------------------------------------------
  // Stability, silence, mono, allocation
  // -------------------------------------------------------------------------

  it("is stable under a minute of noise, and silent after it", () => {
    // harmonic(64) at decay 10 is sixty-four resonators with a Q in the
    // thousands. Levels are normalised for a *strike*, so continuous input is
    // amplified by the resonance - the ticket's "no growth beyond the sum of
    // levels" is not a property any resonator has. What stability means here
    // is a plateau: the output settles at the level the noise gain predicts,
    // `sigma * sqrt(sum(g^2 / (2 (1 - r^2))))`, and stays there. Measured RMS
    // 9.1 with levels summing to 1.
    const minute = 60 * SAMPLE_RATE;
    const random = lcg(0x9e3779b9);
    const noise = new Float32Array(minute);
    for (let i = 0; i < minute; i++) noise[i] = random() * 2 - 1;

    const started = Date.now();
    const { out } = render(Worklet, SAMPLE_RATE, {
      length: 2 * minute,
      maxModes: 64,
      modes: harmonic(64),
      params: { frequency: 220, decay: 10 },
      input: [(i) => (i < minute ? noise[i] : 0)],
    });

    expect(out.every(Number.isFinite)).toBe(true);

    const early = rmsOf(out, 20 * SAMPLE_RATE, 30 * SAMPLE_RATE);
    const late = rmsOf(out, 50 * SAMPLE_RATE, 60 * SAMPLE_RATE);
    expect(Math.abs(db(late / early))).toBeLessThan(1);

    const r = Math.exp(-T60 / (10 * SAMPLE_RATE));
    const g = 1 / 64;
    const predicted =
      Math.sqrt(1 / 3) * Math.sqrt((64 * g * g) / (2 * (1 - r * r)));
    expect(Math.abs(db(late / predicted))).toBeLessThan(1);

    // After the input stops the tail falls at the declared rate - 6 dB a
    // second - and reaches exact zero once every mode is below -300 dB,
    // rather than creeping along in denormals.
    const tail = out.subarray(minute);
    expect(
      Math.abs(
        rt60(tail.subarray(0, 20 * SAMPLE_RATE), SAMPLE_RATE, 4096) / 10 - 1,
      ),
    ).toBeLessThan(0.05);
    let lastNonZero = -1;
    for (let i = 0; i < tail.length; i++) if (tail[i] !== 0) lastNonZero = i;
    expect(lastNonZero).toBeLessThan(tail.length - SAMPLE_RATE);

    // Two minutes of 64 modes, block by block, in bounded wall clock.
    expect(Date.now() - started).toBeLessThan(10000);
  });

  it("is silent with nothing connected", () => {
    const { out } = render(Worklet, SAMPLE_RATE, {
      length: SAMPLE_RATE,
      input: [],
    });
    expect(out.every((sample) => sample === 0)).toBe(true);
  });

  it("keeps ringing after its input is disconnected", () => {
    const { out } = render(Worklet, SAMPLE_RATE, {
      length: SAMPLE_RATE / 2,
      input: (at) => (at < BLOCK ? [impulse] : []),
    });
    expect(peakOf(out, BLOCK, out.length)).toBeGreaterThan(0.1);
  });

  it("sums its input channels to one output channel", () => {
    const random = lcg(1);
    const x = new Float32Array(2048).map(() => random() * 2 - 1);
    const signal = (i: number) => (i < x.length ? x[i] : 0);
    const zero = () => 0;
    const options = { length: SAMPLE_RATE / 4, params: { frequency: 330 } };

    const mono = render(Worklet, SAMPLE_RATE, { ...options, input: [signal] });
    const left = render(Worklet, SAMPLE_RATE, {
      ...options,
      input: [signal, zero],
    });
    const both = render(Worklet, SAMPLE_RATE, {
      ...options,
      input: [signal, signal],
    });

    expect(left.out).toEqual(mono.out);
    both.out.forEach((sample, i) =>
      expect(sample).toBeCloseTo(2 * mono.out[i], 5),
    );
  });

  it("allocates nothing while it runs or when a table arrives", () => {
    const processor = create(Worklet, SAMPLE_RATE, { maxModes: 64 });
    const { u, v, table } = processor.b;
    for (let n = 0; n < 1000; n++) {
      if (n % 10 === 0) post(processor, n % 20 ? harmonic(64) : kettleDrum());
      step(processor, n % 50 === 0 ? impulse : silence);
    }
    expect(processor.b.u).toBe(u);
    expect(processor.b.v).toBe(v);
    expect(processor.b.table).toBe(table);
  });

  it("starts on harmonic(8) with no table given", () => {
    const processor = create(Worklet, SAMPLE_RATE);
    expect(Array.from(processor.b.table.subarray(0, 8 * FIELDS))).toEqual(
      Array.from(packModes(harmonic(8), 8)),
    );
    expect(processor.b.maxModes).toBe(32);
  });
});

// ---------------------------------------------------------------------------
// Harness
// ---------------------------------------------------------------------------

type Params = { frequency?: number; decay?: number; brightness?: number };
type Signal = (i: number) => number;

type RenderOptions = {
  length: number;
  /** Channel functions; default a unit impulse on one channel. */
  input?: Signal[] | ((at: number) => Float32Array[]);
  params?: Params | ((seconds: number) => Params);
  modes?: ResonatorMode[];
  maxModes?: number;
  /** Called before each block with the block's first sample index. */
  beforeBlock?: (processor: any, at: number) => void;
};

const impulse = (() => {
  const block = new Float32Array(BLOCK);
  block[0] = 1;
  return block;
})();
const silence = new Float32Array(BLOCK);

function create(
  Worklet: any,
  sampleRate: number,
  options: { maxModes?: number; modes?: ResonatorMode[] } = {},
) {
  createWorkletTestContext(sampleRate);
  return new Worklet({
    processorOptions: {
      maxModes: options.maxModes,
      modes: options.modes
        ? packModes(options.modes, options.maxModes ?? 32)
        : undefined,
    },
  });
}

/** Deliver a table the way the node does: a `MODES` message on the port. */
function post(processor: any, modes: ResonatorMode[]) {
  const data = packModes(modes, modes.length);
  processor.port.onmessage({
    data: { type: "MODES", modes: data, count: modes.length },
  });
}

/** One block with the default parameters and a single-channel input. */
function step(processor: any, input: Float32Array) {
  processor.process([[input]], [[new Float32Array(BLOCK)]], {
    frequency: [220],
    decay: [1],
    brightness: [1],
  });
}

function render(Worklet: any, sampleRate: number, options: RenderOptions) {
  const processor = create(Worklet, sampleRate, options);
  const out = new Float32Array(options.length);
  const block = new Float32Array(BLOCK);
  const channels = [new Float32Array(BLOCK), new Float32Array(BLOCK)];
  const input = options.input ?? [(i: number) => (i === 0 ? 1 : 0)];

  for (let at = 0; at < options.length; at += BLOCK) {
    const values =
      typeof options.params === "function"
        ? options.params(at / sampleRate)
        : (options.params ?? {});
    options.beforeBlock?.(processor, at);

    let connected: Float32Array[];
    if (typeof input === "function") {
      connected = input(at);
    } else {
      connected = input.map((signal, ch) => {
        for (let i = 0; i < BLOCK; i++) channels[ch][i] = signal(at + i);
        return channels[ch];
      });
    }

    block.fill(0);
    processor.process([connected], [[block]], {
      frequency: [values.frequency ?? 220],
      decay: [values.decay ?? 1],
      brightness: [values.brightness ?? 1],
    });
    out.set(block.subarray(0, Math.min(BLOCK, options.length - at)), at);
  }
  return { out, processor };
}

/** Render lazily and once, for a `describe` whose tests share one output. */
function renderOnce(make: () => { out: Float32Array }) {
  let cached: Float32Array | undefined;
  return { out: () => (cached ??= make().out) };
}

function db(ratio: number) {
  return 20 * Math.log10(ratio);
}

/** The analysis resolution `magnitudes` actually has for this signal. */
function binWidth(signal: ArrayLike<number>, sampleRate: number) {
  let size = 1;
  while (size * 2 <= signal.length) size *= 2;
  return sampleRate / size;
}

/** Local maxima of the spectrum within `floor` dB of its peak, as [Hz, dB]. */
function localMaxima(
  signal: ArrayLike<number>,
  sampleRate: number,
  floor: number,
) {
  const spectrum = magnitudes(signal);
  const bin = binWidth(signal, sampleRate);
  const top = Math.max(...spectrum);
  const found: [number, number][] = [];
  for (let i = 1; i < spectrum.length - 1; i++) {
    const level = db(spectrum[i] / top);
    if (
      spectrum[i] > spectrum[i - 1] &&
      spectrum[i] >= spectrum[i + 1] &&
      level > floor
    ) {
      found.push([i * bin, level]);
    }
  }
  return found;
}

/**
 * One partial's envelope inside a sum: the magnitude of the signal demodulated
 * at `frequency` over Hann windows of 2048 samples, every 10 ms from 20 to
 * 250 ms, with a least-squares line through it in dB.
 *
 * 2048 samples is a 47 ms window whose main lobe is narrower than the 69 Hz
 * between the kettle drum's closest pair, so each fit sees one mode.
 */
function envelopeFit(
  signal: ArrayLike<number>,
  frequency: number,
  sampleRate: number,
) {
  const W = 2048;
  const hann = Float64Array.from(
    { length: W },
    (_, i) => 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (W - 1)),
  );
  const sum = hann.reduce((a, b) => a + b, 0);
  const times: number[] = [];
  const levels: number[] = [];
  for (let start = 0.02; start < 0.25; start += 0.01) {
    const from = Math.round(start * sampleRate);
    let re = 0;
    let im = 0;
    for (let i = 0; i < W; i++) {
      const phase = (2 * Math.PI * frequency * (from + i)) / sampleRate;
      re += hann[i] * signal[from + i] * Math.cos(phase);
      im += hann[i] * signal[from + i] * Math.sin(phase);
    }
    times.push((from + W / 2) / sampleRate);
    levels.push(db((2 * Math.hypot(re, im)) / sum));
  }
  const n = times.length;
  const meanT = times.reduce((a, b) => a + b, 0) / n;
  const meanL = levels.reduce((a, b) => a + b, 0) / n;
  let covariance = 0;
  let variance = 0;
  for (let i = 0; i < n; i++) {
    covariance += (times[i] - meanT) * (levels[i] - meanL);
    variance += (times[i] - meanT) ** 2;
  }
  const slope = covariance / variance;
  return {
    at: (seconds: number) => meanL + slope * (seconds - meanT),
    seconds: -60 / slope,
  };
}

function thirdDifference(signal: ArrayLike<number>) {
  let worst = 0;
  for (let i = 3; i < signal.length; i++) {
    const d = signal[i] - 3 * signal[i - 1] + 3 * signal[i - 2] - signal[i - 3];
    worst = Math.max(worst, Math.abs(d));
  }
  return worst;
}

function maxStep(signal: ArrayLike<number>) {
  let worst = 0;
  for (let i = 1; i < signal.length; i++) {
    worst = Math.max(worst, Math.abs(signal[i] - signal[i - 1]));
  }
  return worst;
}

function peakOf(signal: ArrayLike<number>, from: number, to: number) {
  let peak = 0;
  for (let i = from; i < to; i++) peak = Math.max(peak, Math.abs(signal[i]));
  return peak;
}

function rmsOf(signal: ArrayLike<number>, from: number, to: number) {
  let sum = 0;
  for (let i = from; i < to; i++) sum += signal[i] * signal[i];
  return Math.sqrt(sum / (to - from));
}

/** A seeded uniform generator in [0, 1), so the noise is the same every run. */
function lcg(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

function createWorkletTestContext(sampleRate: number) {
  // @ts-ignore
  global.sampleRate = sampleRate;
  // @ts-ignore
  global.AudioWorkletProcessor = class AudioWorkletNodeStub {
    port: { postMessage: jest.Mock; onmessage: jest.Mock };
    constructor() {
      this.port = { postMessage: jest.fn(), onmessage: jest.fn() };
    }
  };
  // @ts-ignore
  global.registerProcessor = jest.fn();
}

// This file declares helpers at the top level: make it a module so they don't
// collide with the identically named helpers in sibling packages.
export {};
