import {
  centsToRatio,
  createFlexSource,
  DEFAULT_CONFIG,
  type FlexConfig,
} from "./dsp";
import { HALF_TAPS, reachFor, resampleAt } from "./resampler";

const SAMPLE_RATE = 44100;

const config = (over: Partial<FlexConfig> = {}): FlexConfig => ({
  sampleRate: SAMPLE_RATE,
  ...DEFAULT_CONFIG,
  channels: 1,
  ...over,
});

/** A linear ramp from 0 to 1: sample `i` says exactly where in it you are. */
const ramp = (length: number) =>
  Float32Array.from({ length }, (_, i) => i / length);

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
  flex.start();

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
    flex.start();

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
      flex.start();
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

  it("plays a region given by startOffset and endOffset", () => {
    const input = sine(30000, 440);
    const flex = createFlexSource(config());
    flex.setBuffer([input]);
    flex.setControls(10000 / SAMPLE_RATE, 15000 / SAMPLE_RATE, 0, 0);
    flex.start();

    const out = [new Float32Array(64)];
    flex.process(out, 0, 64, 1, 0);
    for (let i = 0; i < 64; i++) {
      expect(out[0][i]).toBeCloseTo(input[10000 + i], 5);
    }
  });

  describe("a live region", () => {
    /** Render `blocks` quanta of 128 and return them joined. */
    const play = (
      flex: ReturnType<typeof createFlexSource>,
      blocks: number,
    ) => {
      const joined = new Float32Array(blocks * 128);
      const out = [new Float32Array(128)];
      let ended = -1;
      for (let b = 0; b < blocks; b++) {
        if (flex.process(out, 0, 128, 1, 0) && ended < 0) ended = b;
        joined.set(out[0], b * 128);
      }
      return { joined, ended };
    };

    it("moves the region mid-playback without rewinding", () => {
      // On a ramp the output sample *is* the source position, so a rewind
      // would be unmissable: the value would drop back to the new region
      // start instead of carrying on from where the playhead was.
      const input = ramp(40000);
      const flex = createFlexSource(config());
      flex.setBuffer([input]);
      flex.setControls(5000 / SAMPLE_RATE, 0, 0, 0);
      flex.start();

      const { joined: before } = play(flex, 20);
      const at = before[before.length - 1];
      expect(at).toBeCloseTo(7559 / 40000, 3);

      // Both edges move, with the playhead left inside: start back to the top
      // of the buffer, end pulled in to 30000.
      flex.setControls(0, 30000 / SAMPLE_RATE, 0, 0);
      const { joined: after } = play(flex, 5);

      // Continuous across the change: the first sample carries on from the
      // last of the old region rather than rewinding to the new start.
      expect(Math.abs(after[0] - at)).toBeLessThan(1e-3);
      expect(after[after.length - 1]).toBeGreaterThan(at);
      // Still walking forwards at rate 1, one sample of ramp per sample out.
      expect(after[after.length - 1] - at).toBeCloseTo(640 / 40000, 3);
    });

    it("ends playback when endOffset sweeps in past the playhead", () => {
      const input = ramp(40000);
      const flex = createFlexSource(config());
      flex.setBuffer([input]);
      flex.setControls(0, 0, 0, 0);
      flex.start();

      play(flex, 20);
      expect(flex.isPlaying()).toBe(true);

      // A region end well behind where the playhead already is.
      flex.setControls(0, 1000 / SAMPLE_RATE, 0, 0);
      const { ended } = play(flex, 20);
      expect(ended).toBeGreaterThanOrEqual(0);
      expect(flex.isPlaying()).toBe(false);
    });

    it("holds the previous region when one arrives inverted", () => {
      // A region swept by an LFO can cross itself for a block or two. That
      // must not kill the note.
      const input = sine(40000, 220);
      const flex = createFlexSource(config());
      flex.setBuffer([input]);
      flex.setControls(0, 0, 0, 0);
      flex.start();

      play(flex, 10);
      flex.setControls(0.5, 0.2, 0, 0); // end before start
      const { joined, ended } = play(flex, 10);

      expect(ended).toBe(-1);
      expect(flex.isPlaying()).toBe(true);
      expect(rms(joined)).toBeGreaterThan(0.5);
    });

    it("refuses to start on a region with nothing in it", () => {
      // The hold rule above is for a region moving *under* a playing note.
      // Starting into an empty one still has to refuse, or the worklet never
      // posts ENDED and the main thread's `playing` latch sticks.
      const flex = createFlexSource(config());
      flex.setBuffer([sine(4000, 300)]);
      flex.setControls(1, 0, 0, 0); // one second into a 0.09 s clip
      expect(flex.start()).toBe(false);
    });
  });

  describe("reverse", () => {
    /** Play a whole region to its end under `controls`, and join the blocks. */
    function renderWith(
      input: Float32Array,
      controls: [number, number, number, number],
      playbackRate = 1,
      detune = 0,
    ) {
      const flex = createFlexSource(config());
      flex.setBuffer([input]);
      flex.setControls(...controls);
      flex.start();

      const block = 128;
      const chunks: Float32Array[] = [];
      let guard = 0;
      while (guard++ < 4000) {
        const out = [new Float32Array(block)];
        const done = flex.process(out, 0, block, playbackRate, detune);
        chunks.push(out[0]);
        if (done) break;
      }
      if (guard >= 4000) throw Error("render did not finish");
      const joined = new Float32Array(chunks.length * block);
      chunks.forEach((chunk, i) => joined.set(chunk, i * block));
      return joined;
    }

    it("plays a ramp back to front, sample for sample", () => {
      const input = ramp(20000);
      const output = renderWith(input, [0, 0, 1, 0]);
      // Reverse is a coordinate mirror, so at rate 1 it is as transparent as
      // forward playback is - not merely "descending".
      for (let i = 0; i < 18000; i++) {
        expect(output[i]).toBeCloseTo(input[input.length - 1 - i], 6);
      }
    });

    it("starts on the region's last sample", () => {
      // The onset guarantee, backwards: `firstWindow` puts its rise-free half
      // at the mirrored start, which is the region's end.
      const input = sine(20000, 440);
      const output = renderWith(input, [
        5000 / SAMPLE_RATE,
        15000 / SAMPLE_RATE,
        1,
        0,
      ]);
      for (let i = 0; i < 64; i++) {
        expect(output[i]).toBeCloseTo(input[14999 - i], 5);
      }
    });

    it("leaves pitch and duration alone", () => {
      const input = sine(44100, 220);
      const forward = renderWith(input, [0, 0, 0, 0]);
      const backward = renderWith(input, [0, 0, 1, 0]);

      const lengths =
        audibleLength(backward) / Math.max(1, audibleLength(forward));
      expect(lengths).toBeGreaterThan(0.95);
      expect(lengths).toBeLessThan(1.05);

      const body = backward.subarray(4000, audibleLength(backward) - 4000);
      expect(Math.abs(period(body) - SAMPLE_RATE / 220)).toBeLessThan(2);
    });

    it.each([
      [0.5, 0],
      [2, 0],
      [1, 1200],
      [1, -1200],
    ])("composes with playbackRate %p and detune %p", (rate, cents) => {
      const input = sine(44100, 220);
      const output = renderWith(input, [0, 0, 1, 0], rate, cents);
      const body = output.subarray(4000, audibleLength(output) - 4000);

      // Duration follows `playbackRate` alone, pitch follows `detune` alone -
      // exactly as forwards.
      const ratio = audibleLength(output) / input.length;
      expect(ratio).toBeGreaterThan(0.9 / rate);
      expect(ratio).toBeLessThan(1.1 / rate);
      const expected = SAMPLE_RATE / (220 * centsToRatio(cents));
      expect(Math.abs(period(body) - expected) / expected).toBeLessThan(0.02);
    });

    describe("flipped mid-playback", () => {
      /** `before` blocks forwards, then `after` blocks reversed. */
      const flipped = (input: Float32Array, before: number, after: number) => {
        const flex = createFlexSource(config());
        flex.setBuffer([input]);
        flex.setControls(0, 0, 0, 0);
        flex.start();

        const out = [new Float32Array(128)];
        const joined = new Float32Array((before + after) * 128);
        for (let b = 0; b < before + after; b++) {
          if (b === before) flex.setControls(0, 0, 1, 0);
          flex.process(out, 0, 128, 1, 0);
          joined.set(out[0], b * 128);
        }
        return joined;
      };

      it("reverses the playhead in place, not to the mirror point", () => {
        const length = 20000;
        const output = flipped(ramp(length), 20, 20);
        const at = 20 * 128;
        const playhead = output[at - 1];

        // The mirror point is what a naive implementation would jump to.
        expect(
          Math.abs(playhead - (length - 1 - 2559) / length),
        ).toBeGreaterThan(0.5);
        expect(output[at]).toBeCloseTo(playhead, 3);

        // Then it retraces what it just played. The flip lands on the next
        // analysis frame, so the retrace lags by up to one synthesis hop -
        // 661 samples at the default geometry, 0.034 of this ramp.
        for (let k = 200; k < 2000; k += 100) {
          expect(Math.abs(output[at + k] - output[at - 1 - k])).toBeLessThan(
            0.035,
          );
        }
        expect(output[output.length - 1]).toBeLessThan(playhead);
      });

      it("does not click at the flip", () => {
        // 220 Hz at 44.1 kHz steps by at most 2*pi*f/fs between samples. A
        // discontinuity at the flip would show up here and nowhere else.
        const output = flipped(sine(20000, 220), 20, 20);
        const theory = (2 * Math.PI * 220) / SAMPLE_RATE;
        const at = 20 * 128;

        let largest = 0;
        for (let i = at - 300; i < at + 300; i++) {
          largest = Math.max(largest, Math.abs(output[i] - output[i - 1]));
        }
        expect(largest).toBeLessThan(2 * theory);
      });
    });
  });

  describe("loop", () => {
    /** The engine's analysis frame N at the default geometry. */
    const FRAME = (() => {
      const n = Math.round((DEFAULT_CONFIG.frameMs * SAMPLE_RATE) / 1000);
      return n % 2 === 0 ? n : n + 1;
    })();

    /** Loop `from`..`to` (in samples) for `blocks` quanta. */
    function loopRender(
      input: Float32Array,
      from: number,
      to: number,
      blocks: number,
      reverse = 0,
    ) {
      const flex = createFlexSource(config());
      flex.setBuffer([input]);
      flex.setControls(from / SAMPLE_RATE, to / SAMPLE_RATE, reverse, 1);
      flex.start();

      const out = [new Float32Array(128)];
      const joined = new Float32Array(blocks * 128);
      let ended = -1;
      for (let b = 0; b < blocks; b++) {
        if (flex.process(out, 0, 128, 1, 0) && ended < 0) ended = b;
        joined.set(out[0], b * 128);
      }
      return { flex, joined, ended };
    }

    /** Largest sample-to-sample step, and how many exceed `loud`. */
    function steps(signal: Float32Array, loud = 0.1) {
      let largest = 0;
      let over = 0;
      for (let i = 1; i < signal.length; i++) {
        const delta = Math.abs(signal[i] - signal[i - 1]);
        if (delta > largest) largest = delta;
        if (delta > loud) over++;
      }
      return { largest, over };
    }

    /** Where each isolated excursion above `floor` peaks. */
    function peaks(signal: Float32Array, floor: number) {
      const found: number[] = [];
      for (let i = 0; i < signal.length; i++) {
        if (Math.abs(signal[i]) <= floor) continue;
        let at = i;
        let best = Math.abs(signal[i]);
        while (i < signal.length && Math.abs(signal[i]) > floor) {
          if (Math.abs(signal[i]) > best) {
            best = Math.abs(signal[i]);
            at = i;
          }
          i++;
        }
        found.push(at);
      }
      return found;
    }

    /** A sine with a narrow Gaussian burst at each of `marks`. */
    const marked = (length: number, marks: number[]) =>
      Float32Array.from({ length }, (_, i) => {
        let value = 0.25 * Math.sin((2 * Math.PI * 220 * i) / SAMPLE_RATE);
        for (const mark of marks) {
          value += Math.exp(-((i - mark) ** 2) / (2 * 40 ** 2));
        }
        return value;
      });

    // 220 Hz over a 10,000 sample region is 49.9 periods, so the wrap lands
    // mid-phase and a butt-join would be unmissable. The metric is the largest
    // sample-to-sample step, against the theoretical maximum for the tone.
    const THEORY = (2 * Math.PI * 220) / SAMPLE_RATE;

    it("wraps with a seam at the material's own step limit", () => {
      const input = sine(60000, 220);
      const { joined } = loopRender(input, 5000, 15000, 235); // ~3 loops
      const seam = steps(joined);

      // Prototyped at 1.01x; measured here at 1.007x, with no step anywhere
      // near the 0.1 a click would leave.
      expect(seam.largest).toBeLessThan(2 * THEORY);
      expect(seam.over).toBe(0);
    });

    it("...where the naive butt-join of the same region is 17x that", () => {
      // The control, asserted beside the seam so the metric is shown to have
      // teeth rather than merely to pass.
      const input = sine(60000, 220);
      const naive = Float32Array.from(
        { length: 30000 },
        (_, i) => input[5000 + (i % 10000)],
      );
      const butt = steps(naive);
      expect(butt.largest).toBeGreaterThan(10 * THEORY);
      expect(butt.over).toBeGreaterThan(0);
    });

    it("never reports done: ENDED can only come from stop()", () => {
      const { flex, ended } = loopRender(sine(20000, 220), 5000, 15000, 400);
      expect(ended).toBe(-1);
      expect(flex.isPlaying()).toBe(true);

      flex.stop();
      expect(flex.isPlaying()).toBe(false);
    });

    it("plays out to endOffset when loop is turned off mid-cycle", () => {
      const input = sine(60000, 220);
      const flex = createFlexSource(config());
      flex.setBuffer([input]);
      flex.setControls(5000 / SAMPLE_RATE, 15000 / SAMPLE_RATE, 0, 1);
      flex.start();

      const out = [new Float32Array(128)];
      let ended = -1;
      for (let b = 0; b < 400; b++) {
        // Half-way through a cycle, drop the loop.
        if (b === 120) {
          flex.setControls(5000 / SAMPLE_RATE, 15000 / SAMPLE_RATE, 0, 0);
        }
        if (flex.process(out, 0, 128, 1, 0) && ended < 0) ended = b;
      }
      expect(ended).toBeGreaterThan(120);
      expect(flex.isPlaying()).toBe(false);
    });

    it("cycles the region at the length it was asked for", () => {
      // A burst marker inside the region shows up once per cycle, so the gap
      // between two of them is the loop length.
      const input = marked(60000, [6000]);
      const { joined } = loopRender(input, 5000, 15000, 300);
      const found = peaks(joined, 0.8);

      expect(found.length).toBeGreaterThan(1);
      const cycle = found[found.length - 1] - found[found.length - 2];
      // Within the similarity search's own shift - it is free to move the
      // wrap by a few samples to align the waveform, and that is the point.
      expect(Math.abs(cycle - 10000)).toBeLessThan(40);
    });

    it("clamps by one frame when there is no runway past endOffset", () => {
      // Looping the whole buffer to its very last sample has nothing to
      // crossfade the seam with, so the loop point comes in by a frame - 30 ms
      // at the default geometry. Far better than a click every cycle.
      const length = 60000;
      const input = marked(length, [6000]);
      const { joined } = loopRender(input, 0, 0, 1600);
      const found = peaks(joined, 0.8);

      expect(found.length).toBeGreaterThan(1);
      const cycle = found[1] - found[0];
      expect(Math.abs(cycle - (length - FRAME))).toBeLessThan(40);
      // ...and it really is short of the whole buffer, not merely close to it.
      expect(length - cycle).toBeGreaterThan(FRAME / 2);
    });

    it("wraps rather than ending when endOffset sweeps in behind it", () => {
      // The one-shot answer to this is to end (asserted above). Looping, the
      // playhead is simply past the new edge, and the modulo wrap carries it
      // back into the region however far past it has got.
      const input = sine(60000, 220);
      const flex = createFlexSource(config());
      flex.setBuffer([input]);
      flex.setControls(5000 / SAMPLE_RATE, 25000 / SAMPLE_RATE, 0, 1);
      flex.start();

      const out = [new Float32Array(128)];
      const joined = new Float32Array(300 * 128);
      let ended = -1;
      for (let b = 0; b < 300; b++) {
        // Pull the end in to 10000, well behind where the playhead has got.
        if (b === 120) {
          flex.setControls(5000 / SAMPLE_RATE, 10000 / SAMPLE_RATE, 0, 1);
        }
        if (flex.process(out, 0, 128, 1, 0) && ended < 0) ended = b;
        joined.set(out[0], b * 128);
      }

      const after = joined.subarray(20000);
      expect(ended).toBe(-1);
      expect(flex.isPlaying()).toBe(true);
      expect(rms(after)).toBeGreaterThan(0.5);
      // ...and the smaller region's seam is still a seam, not a click.
      expect(steps(after).largest).toBeLessThan(2 * THEORY);
      expect(steps(after).over).toBe(0);
    });

    it("composes with reverse", () => {
      // Mirrored space is still [start, end), so the same wrap serves both
      // directions - and the runway is taken from before `startOffset`.
      const input = sine(60000, 220);
      const { joined, ended } = loopRender(input, 5000, 15000, 235, 1);
      const seam = steps(joined);

      expect(ended).toBe(-1);
      expect(seam.largest).toBeLessThan(2 * THEORY);
      expect(seam.over).toBe(0);
      expect(rms(joined)).toBeGreaterThan(0.5);
    });

    it("survives a region shorter than one analysis frame", () => {
      // It buzzes at the loop rate. That is a legitimate effect, not a bug -
      // what matters is that it stays finite and inside the material's range.
      const input = sine(60000, 220);
      const { joined } = loopRender(input, 5000, 5200, 100);

      expect(Array.from(joined).every(Number.isFinite)).toBe(true);
      expect(Math.max(...Array.from(joined).map(Math.abs))).toBeLessThan(2);
      expect(rms(joined)).toBeGreaterThan(0.1);
    });

    it("renders a snapshot", () => {
      const input = sine(20000, 220);
      const { joined } = loopRender(input, 5000, 15000, 120);
      const sampled = Array.from(joined.subarray(9800, 10200))
        .filter((_, i) => i % 20 === 0)
        .map((value) => Math.round(value * 1e4) / 1e4);
      expect(sampled).toMatchSnapshot();
    });
  });

  it("reports done once and then falls silent", () => {
    const input = sine(4000, 300);
    const flex = createFlexSource(config());
    flex.setBuffer([input]);
    flex.start();

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

    flex.start();
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
    flex.start();
    flex.process(first, 0, 256, 0.8, 300);

    const second = [new Float32Array(256)];
    flex.start();
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

  it("survives detune being automated back to zero", () => {
    // The resampler's unity-ratio short circuit is only exact at an integral
    // read position, and any non-zero detune leaves `readPos` fractional.
    // Without the guard on that, returning to detune 0 wrote NaN into every
    // remaining sample of the playback - and NaN never washes out.
    const input = sine(40000, 220);
    const flex = createFlexSource(config());
    flex.setBuffer([input]);
    flex.start();

    const out = [new Float32Array(128)];
    for (let b = 0; b < 5; b++) flex.process(out, 0, 128, 1, 700);
    const shifted = rms(out[0]);

    for (let b = 0; b < 20; b++) flex.process(out, 0, 128, 1, 0);
    expect(Array.from(out[0]).every(Number.isFinite)).toBe(true);
    // Still playing the sample, not silently dropped to zero.
    expect(rms(out[0])).toBeGreaterThan(0.5 * shifted);
  });

  it("allocates nothing after construction", () => {
    const input = sine(40000, 220);
    const flex = createFlexSource(config());
    flex.setBuffer([input]);
    flex.start();
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
    let finite = true;
    try {
      for (let i = 0; i < 150; i++) {
        // Every control sweeping, not just the two the render loop consumes:
        // `setControls` runs on the audio thread too.
        flex.setControls(
          ((i % 11) * 1000) / SAMPLE_RATE,
          i % 3 === 0 ? (20000 + (i % 13) * 500) / SAMPLE_RATE : 0,
          i % 4 === 0 ? 1 : 0,
          i % 5 === 0 ? 1 : 0,
        );
        flex.process(outputs, 0, 128, 0.8 + (i % 5) * 0.1, (i % 7) * 100);
        for (const value of outputs[0]) {
          if (!Number.isFinite(value)) finite = false;
        }
      }
    } finally {
      (globalThis as any).Float32Array = before;
    }
    expect(allocations).toBe(0);
    // The detune cycle above returns to 0 every seventh block. Asserted here
    // as well as in its own test because this loop always walked that path.
    expect(finite).toBe(true);
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
