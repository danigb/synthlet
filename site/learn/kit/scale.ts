import type { ControlScale } from "../patches/define";

/*
 * Where a slider sits, and what that means.
 *
 * Four tapers, in one file, because a taper written twice is a taper that
 * disagrees with itself: the renderer needs the position for the thumb and the
 * value for the parameter, and a lesson that says "put it in the middle" has to
 * be talking about the same middle in both directions. Every function here is
 * pure, so `scale.test.ts` can state the taper as arithmetic rather than as a
 * screenshot.
 *
 * The manifest never says any of this. It says `scale: "log"`, `min`, `max`,
 * and a `unit` to print; which curve that is, and how many decimals the readout
 * gets, is the kit's business and a theme's after it.
 */

/** What a slider needs to know about the thing it moves. */
export interface ScaleSpec {
  min: number;
  max: number;
  scale?: ControlScale;
  unit?: string;
  step?: number;
}

/**
 * How many positions a slider has.
 *
 * An `<input type="range">` steps in integers, so the position is an integer
 * count and the taper turns it into a value. A thousand is finer than any
 * screen this will be dragged on and coarse enough that the readout settles.
 */
export const POSITIONS = 1000;

const clamp01 = (value: number) => Math.min(1, Math.max(0, value));

export const dbToGain = (db: number) => 10 ** (db / 20);
export const gainToDb = (gain: number) =>
  gain > 0 ? 20 * Math.log10(gain) : -Infinity;

/**
 * The value a position means, in the parameter's own units.
 *
 * - `lin` - the straight line.
 * - `log` - `min · (max/min)^p`, the only honest taper for a frequency: the
 *   ear hears ratios, so equal travel has to be equal ratio. 20 Hz to 20 kHz
 *   puts 632 Hz at the middle, which is where the middle of hearing is.
 * - `time` - `min + p²·(max − min)`. A duration cannot be logarithmic here
 *   because every envelope stage starts at 0 and 0 has no logarithm; squaring
 *   gives the short end the travel it needs without that.
 * - `db` - `min` and `max` are **decibels** and the parameter is a **gain**.
 *   The reader is choosing a level, the `AudioParam` is a multiplier, and the
 *   conversion belongs here rather than in thirty patches.
 */
export function toValue(spec: ScaleSpec, position: number): number {
  const p = clamp01(position);
  const { min, max, scale = "lin", step } = spec;

  let value: number;
  switch (scale) {
    case "log":
      // A log taper needs a positive floor; a patch that asks for one from 0
      // gets the linear taper rather than a NaN.
      value = min > 0 ? min * (max / min) ** p : min + p * (max - min);
      break;
    case "time":
      value = min + p * p * (max - min);
      break;
    case "db":
      value = dbToGain(min + p * (max - min));
      break;
    default:
      value = min + p * (max - min);
  }

  if (step && scale !== "db") value = Math.round(value / step) * step;
  return value;
}

/** The inverse: where on the slider a value already is. */
export function toPosition(spec: ScaleSpec, value: number): number {
  const { min, max, scale = "lin" } = spec;
  if (max === min) return 0;

  switch (scale) {
    case "log":
      if (min > 0 && value > 0) {
        return clamp01(Math.log(value / min) / Math.log(max / min));
      }
      return clamp01((value - min) / (max - min));
    case "time":
      return clamp01(Math.sqrt(clamp01((value - min) / (max - min))));
    case "db":
      return clamp01((gainToDb(value) - min) / (max - min));
    default:
      return clamp01((value - min) / (max - min));
  }
}

/** How precise the readout is: enough digits to see the slider move. */
function decimals(spec: ScaleSpec): number {
  if (spec.step) {
    const text = String(spec.step);
    const dot = text.indexOf(".");
    return dot === -1 ? 0 : text.length - dot - 1;
  }
  const span = Math.abs(spec.max - spec.min);
  if (span >= 500) return 0;
  if (span >= 20) return 1;
  if (span >= 2) return 2;
  return 3;
}

/**
 * The number a control shows, with its unit.
 *
 * A `db` control prints decibels while writing a gain, which is the whole point
 * of the scale: the reader is told the thing they are choosing, not the thing
 * the graph receives.
 */
export function formatValue(spec: ScaleSpec, value: number): string {
  if (spec.scale === "db") {
    const db = gainToDb(value);
    return db === -Infinity ? "−∞ dB" : `${minus(db.toFixed(1))} dB`;
  }
  const text = minus(value.toFixed(decimals(spec)));
  return spec.unit ? `${text} ${spec.unit}` : text;
}

/**
 * A real minus sign, not a hyphen.
 *
 * `@synthlet/level-meter`'s `formatDb` does the same, for the same reason: a
 * hyphen is a different character at a different height, and a column of
 * readouts that mixes the two is a column that looks misaligned.
 */
function minus(text: string): string {
  return text.charCodeAt(0) === 45 ? `−${text.slice(1)}` : text;
}
