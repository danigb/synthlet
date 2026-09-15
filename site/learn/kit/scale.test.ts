import { describe, expect, it } from "vitest";
import type { ControlScale } from "../patches/define";
import {
  dbToGain,
  formatValue,
  gainToDb,
  toPosition,
  toValue,
  type ScaleSpec,
} from "./scale";

/*
 * The four tapers, as arithmetic.
 *
 * A slider is the one part of the kit whose correctness is a number rather than
 * a look: "the midpoint of a 20 Hz to 20 kHz control is 632 Hz" is either true
 * or it is not, and if it is not then every filter lesson in the course spends
 * four fifths of its travel above 4 kHz and the reader is told the wrong thing
 * about what a filter does. So it is stated here, once, in the units a lesson
 * would state it in.
 */

describe("the log taper", () => {
  const hearing: ScaleSpec = { min: 20, max: 20000, scale: "log" };

  it("puts 632 Hz at the middle of human hearing", () => {
    // 20 * sqrt(1000): the geometric mean, which is what "the middle" means to
    // an ear that hears ratios.
    expect(toValue(hearing, 0.5)).toBeCloseTo(632.4555, 3);
  });

  it("spends equal travel on equal ratios", () => {
    const decade = toPosition(hearing, 2000) - toPosition(hearing, 200);
    const otherDecade = toPosition(hearing, 200) - toPosition(hearing, 20);
    expect(decade).toBeCloseTo(otherDecade, 10);
  });

  it("ends where it says it does", () => {
    expect(toValue(hearing, 0)).toBeCloseTo(20, 10);
    expect(toValue(hearing, 1)).toBeCloseTo(20000, 6);
  });

  it("falls back to linear when the floor is zero", () => {
    // `log(0)` is not a number, and a patch that asks for one should get a
    // usable control rather than a NaN.
    const fromZero: ScaleSpec = { min: 0, max: 100, scale: "log" };
    expect(toValue(fromZero, 0.5)).toBeCloseTo(50, 10);
  });
});

describe("the db taper", () => {
  // The control is decibels; the parameter is a gain. That is the whole point.
  const level: ScaleSpec = { min: -60, max: 0, scale: "db" };

  it("writes a gain and shows decibels", () => {
    expect(toValue(level, 1)).toBeCloseTo(1, 10);
    expect(formatValue(level, 1)).toBe("0.0 dB");

    const halfPower = toValue(level, toPosition(level, dbToGain(-6)));
    expect(halfPower).toBeCloseTo(0.5012, 4);
    expect(formatValue(level, halfPower)).toBe("−6.0 dB");
  });

  it("puts −30 dB at the middle of a −60…0 control", () => {
    expect(gainToDb(toValue(level, 0.5))).toBeCloseTo(-30, 10);
  });

  it("calls silence silence", () => {
    expect(formatValue(level, 0)).toBe("−∞ dB");
  });
});

describe("the time taper", () => {
  const envelope: ScaleSpec = { min: 0, max: 10, scale: "time", unit: "s" };

  it("gives the short end the travel", () => {
    // Half the slider is a tenth of the range: a plucked note is playable.
    expect(toValue(envelope, 0.5)).toBeCloseTo(2.5, 10);
    expect(toValue(envelope, 0.1)).toBeCloseTo(0.1, 10);
  });

  it("starts at zero, which is why it is not a log", () => {
    expect(toValue(envelope, 0)).toBe(0);
    expect(toPosition(envelope, 0)).toBe(0);
  });
});

describe("every taper", () => {
  const specs: Record<ControlScale, ScaleSpec> = {
    lin: { min: -12, max: 12 },
    log: { min: 20, max: 20000, scale: "log" },
    time: { min: 0, max: 10, scale: "time" },
    db: { min: -60, max: 0, scale: "db" },
  };

  it("round-trips a position through a value and back", () => {
    for (const spec of Object.values(specs)) {
      for (const position of [0, 0.13, 0.5, 0.77, 1]) {
        expect(toPosition(spec, toValue(spec, position))).toBeCloseTo(
          position,
          6,
        );
      }
    }
  });

  it("stays inside the slider at either end", () => {
    for (const spec of Object.values(specs)) {
      expect(toPosition(spec, spec.min - 1000)).toBe(0);
      expect(toPosition(spec, spec.max + 1000)).toBe(1);
    }
  });
});

describe("the readout", () => {
  it("prints the unit the manifest gave it", () => {
    expect(formatValue({ min: 20, max: 20000, unit: "Hz" }, 440)).toBe(
      "440 Hz",
    );
    expect(formatValue({ min: 1, max: 16, step: 1 }, 8)).toBe("8");
  });
});
