// The shared gate contract itself, not a package's copy of it: the claim
// being tested is that a linear slew still satisfies `<= 0`.
import { createGateDetector } from "../../../scripts/_gate";
import { createSlew, SlewType } from "./dsp";

/**
 * The slew generator, driven directly.
 *
 * The two laws are tested against different things on purpose. `Linear` is an
 * arithmetic claim - a straight ramp, arriving at a predictable sample - so it
 * is checked against the ideal ramp sample by sample. `Exponential` is a
 * proportional claim, so what is checked is that the *duration* does not depend
 * on the size of the step.
 */

const SAMPLE_RATE = 44100;
const BLOCK = 128;

describe("createSlew", () => {
  describe("Linear: a rate limiter, in seconds per unit", () => {
    it("is a straight ramp that arrives", () => {
      const out = render({
        channels: [() => 1],
        type: SlewType.Linear,
        rise: 0.1,
        length: Math.round(0.15 * SAMPLE_RATE),
      });

      const samples = 0.1 * SAMPLE_RATE;
      for (let i = 0; i < samples; i++) {
        expect(Math.abs(out[i] - (i + 1) / samples)).toBeLessThan(1e-6);
      }
      // Arrives, rather than approaching: the clamp takes the remaining
      // distance once it is smaller than a step.
      expect(out[samples - 1]).toBe(1);
      expect(out[samples]).toBe(1);
    });

    it("takes twice as long over twice the distance, which is what per-unit means", () => {
      const out = render({
        channels: [() => 2],
        type: SlewType.Linear,
        rise: 0.1,
        length: Math.round(0.25 * SAMPLE_RATE),
      });
      expect(firstAtLeast(out, 2)).toBe(0.2 * SAMPLE_RATE - 1);
    });

    it("reaches exactly zero, so a gate through one still closes", () => {
      // The gates doc warns against smoothing a gate, and the warning is about
      // the *other* law: a signal that asymptotes towards zero never arrives,
      // so the gate never closes. This one arrives.
      const out = render({
        channels: [(i) => (i < BLOCK ? 1 : 0)],
        type: SlewType.Linear,
        rise: 0,
        fall: 0.01,
        length: Math.round(0.05 * SAMPLE_RATE),
      });

      const detect = createGateDetector();
      const edges = Array.from(out)
        .map(detect)
        .filter((e) => e !== undefined);
      expect(edges).toEqual([true, false]);
      expect(out[out.length - 1]).toBe(0);
    });
  });

  describe("Exponential: proportional, in seconds for 99 % of a step", () => {
    it("covers 99 % of a step in `rise`, whatever the step is", () => {
      const one = render({
        channels: [() => 1],
        rise: 0.1,
        length: Math.round(0.2 * SAMPLE_RATE),
      });
      const two = render({
        channels: [() => 2],
        rise: 0.1,
        length: Math.round(0.2 * SAMPLE_RATE),
      });

      expect(within(firstAtLeast(one, 0.99), 0.1 * SAMPLE_RATE, 0.02)).toBe(
        true,
      );
      expect(within(firstAtLeast(two, 1.98), 0.1 * SAMPLE_RATE, 0.02)).toBe(
        true,
      );
    });

    it("means the same thing at 48 kHz", () => {
      const out = render({
        channels: [() => 1],
        rise: 0.1,
        sampleRate: 48000,
        length: Math.round(0.2 * 48000),
      });
      expect(within(firstAtLeast(out, 0.99), 0.1 * 48000, 0.02)).toBe(true);
    });

    it("never overshoots and stays where it arrives", () => {
      const out = render({
        channels: [() => 1],
        rise: 0.05,
        length: SAMPLE_RATE * 60,
      });
      for (let i = 0; i < out.length; i += 997)
        expect(out[i]).toBeLessThan(1.0001);
      expect(out[out.length - 1]).toBeCloseTo(1, 6);
      expect(out.every(Number.isFinite)).toBe(true);
    });
  });

  it.each([
    ["Exponential", SlewType.Exponential],
    ["Linear", SlewType.Linear],
  ])("rises and falls independently: %s", (_name, type) => {
    // Part 16's Figure 16, the shark's tooth: `rise` 50x `fall`.
    const out = render({
      channels: [(i) => (i < SAMPLE_RATE ? 1 : 0)],
      type,
      rise: 0.5,
      fall: 0.01,
      length: SAMPLE_RATE * 2,
    });

    const rose = firstAtLeast(out, 0.99);
    const fell = firstAtMost(out.subarray(SAMPLE_RATE), 0.01);
    expect(rose / fell).toBeGreaterThan(45);
    expect(rose / fell).toBeLessThan(55);
  });

  it.each([
    ["Exponential", SlewType.Exponential],
    ["Linear", SlewType.Linear],
  ])("is a bit-exact bypass at zero: %s", (_name, type) => {
    // A full-scale square wave, which is the worst case for both laws: every
    // edge is the largest step the signal can make.
    const square = (i: number) => (Math.floor(i / 64) % 2 ? -1 : 1);
    const out = render({
      channels: [square],
      type,
      rise: 0,
      fall: 0,
      length: BLOCK * 8,
    });
    expect(Array.from(out)).toEqual(
      Array.from(Float32Array.from({ length: BLOCK * 8 }, (_, i) => square(i))),
    );
  });

  it("keeps one state per channel", () => {
    const [left, right] = renderChannels({
      channels: [() => 1, () => -1],
      rise: 0.05,
      fall: 0.05,
      length: Math.round(0.1 * SAMPLE_RATE),
    });
    expect(left[left.length - 1]).toBeCloseTo(1, 3);
    expect(right[right.length - 1]).toBeCloseTo(-1, 3);
  });

  it("allocates nothing in its render function", () => {
    // Growing the per-channel state is the one allocation, and it lives in the
    // block prologue rather than the sample loop.
    const source = String(createSlew(SAMPLE_RATE));
    const loops = source.slice(source.indexOf("for (let c"));
    expect(loops).not.toMatch(/\bnew\b/);
  });
});

type RenderOptions = {
  channels: ((i: number) => number)[];
  length: number;
  type?: SlewType;
  rise?: number;
  fall?: number;
  sampleRate?: number;
};

const render = (options: RenderOptions) => renderChannels(options)[0];

/** Drives the slew block by block, the way a graph does. */
function renderChannels(options: RenderOptions) {
  const slew = createSlew(options.sampleRate ?? SAMPLE_RATE);
  const total = options.length;
  const count = options.channels.length;

  const out = Array.from({ length: count }, () => new Float32Array(total));
  const inputs = Array.from({ length: count }, () => new Float32Array(BLOCK));
  const blocks = Array.from({ length: count }, () => new Float32Array(BLOCK));
  const params = {
    type: [options.type ?? SlewType.Exponential],
    rise: [options.rise ?? 0.1],
    fall: [options.fall ?? 0.1],
  };

  for (let at = 0; at < total; at += BLOCK) {
    const size = Math.min(BLOCK, total - at);
    for (let i = 0; i < size; i++) {
      for (let c = 0; c < count; c++)
        inputs[c][i] = options.channels[c](at + i);
    }
    const view = (bs: Float32Array[]) =>
      size === BLOCK ? bs : bs.map((b) => b.subarray(0, size));
    const viewed = view(blocks);
    slew(view(inputs), viewed, params);
    for (let c = 0; c < count; c++) out[c].set(viewed[c], at);
  }

  return out;
}

const firstAtLeast = (signal: Float32Array, level: number) =>
  signal.findIndex((v) => v >= level);

const firstAtMost = (signal: Float32Array, level: number) =>
  signal.findIndex((v) => v <= level);

const within = (value: number, of: number, tolerance: number) =>
  value > 0 && Math.abs(value - of) / of <= tolerance;

// This file declares helpers at the top level: make it a module so they don't
// collide with the identically named helpers in sibling packages.
export {};
