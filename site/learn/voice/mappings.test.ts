import { describe, expect, it } from "vitest";
import {
  bindingPosition,
  bindingValue,
  DEFAULT_PAD_MAPPING,
  PAD_MAPPINGS,
  padMapping,
  type PadAxis,
} from "./mappings";
import { learnVoiceParams } from "./params";
import { GALLERY_PRESET_NAMES } from "./presets";

/*
 * A mapping that asks for a value the parameter will not take is a pad with a
 * dead end on it: the `AudioParam` clamps, the sound stops moving somewhere in
 * the middle of the axis, and nothing anywhere says so. So the ranges are
 * checked against the parameter table rather than read.
 */

const axes = (mapping: { x: PadAxis; y: PadAxis }) => [mapping.x, mapping.y];

const everyMapping = [
  ["the default", DEFAULT_PAD_MAPPING] as const,
  ...Object.entries(PAD_MAPPINGS),
];

describe("the gallery's pads", () => {
  it("gives one to every preset in the gallery, and to nothing else", () => {
    expect(Object.keys(PAD_MAPPINGS).sort()).toEqual(
      [...GALLERY_PRESET_NAMES].sort(),
    );
  });

  it("falls back to cutoff and resonance", () => {
    expect(padMapping()).toBe(DEFAULT_PAD_MAPPING);
    expect(padMapping("attack")).toBe(DEFAULT_PAD_MAPPING);
    expect(padMapping("nothing-of-the-sort")).toBe(DEFAULT_PAD_MAPPING);
    expect(padMapping("wow-bass")).toBe(PAD_MAPPINGS["wow-bass"]);
  });

  it("stays inside every parameter's declared range", () => {
    const violations: string[] = [];

    for (const [name, mapping] of everyMapping) {
      for (const axis of axes(mapping)) {
        for (const binding of axis.bind) {
          const spec = learnVoiceParams[binding.param];
          const low = Math.min(binding.min, binding.max);
          const high = Math.max(binding.min, binding.max);
          if (low < spec.min || high > spec.max) {
            violations.push(
              `${name}: ${binding.param} ${low}…${high} is outside ` +
                `${spec.min}…${spec.max}`,
            );
          }
          if (binding.curve === "log" && low <= 0) {
            violations.push(`${name}: ${binding.param} is log from ${low}`);
          }
        }
      }
    }

    expect(violations).toEqual([]);
  });

  it("binds something to both axes, and labels them", () => {
    for (const [name, mapping] of everyMapping) {
      for (const axis of axes(mapping)) {
        expect(axis.bind.length, name).toBeGreaterThan(0);
        expect(axis.label, name).not.toBe("");
      }
    }
  });

  it("keeps Ableton's two", () => {
    // The two the reference publishes, so the one thing this file copies is
    // checked rather than remembered.
    expect(PAD_MAPPINGS["wow-bass"].x.bind.map((b) => b.param)).toEqual([
      "cutoff",
    ]);
    expect(PAD_MAPPINGS["wow-bass"].y.bind.map((b) => b.param)).toEqual([
      "resonance",
    ]);
    expect(
      PAD_MAPPINGS["two-sounds-in-one"].x.bind.map((b) => b.param),
    ).toEqual(["lfoRate", "pulseWidth"]);
    expect(
      PAD_MAPPINGS["two-sounds-in-one"].y.bind.map((b) => b.param),
    ).toEqual(["resonance", "filterLfo"]);
  });
});

describe("the taper", () => {
  const linear = { param: "cutoff", min: 100, max: 1100 } as const;
  const log = { param: "cutoff", min: 100, max: 10000, curve: "log" } as const;

  it("reaches both ends exactly", () => {
    for (const binding of [linear, log]) {
      expect(bindingValue(binding, 0)).toBeCloseTo(binding.min, 6);
      expect(bindingValue(binding, 1)).toBeCloseTo(binding.max, 6);
    }
  });

  it("puts the geometric middle in the middle of a log axis", () => {
    expect(bindingValue(log, 0.5)).toBeCloseTo(1000, 6);
    expect(bindingValue(linear, 0.5)).toBeCloseTo(600, 6);
  });

  it("clamps a position that left the pad", () => {
    expect(bindingValue(linear, -3)).toBe(100);
    expect(bindingValue(linear, 9)).toBe(1100);
  });

  it("inverts itself, which is how the pad finds the sound it arrived on", () => {
    for (const binding of [linear, log]) {
      for (const p of [0, 0.13, 0.5, 0.87, 1]) {
        expect(bindingPosition(binding, bindingValue(binding, p))).toBeCloseTo(
          p,
          6,
        );
      }
    }
  });

  it("falls back to a straight line where a logarithm has no floor", () => {
    const impossible = { param: "filterLfo", min: 0, max: 100 } as const;
    expect(bindingValue({ ...impossible, curve: "log" }, 0.5)).toBe(50);
  });
});
