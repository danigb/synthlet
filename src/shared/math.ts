export const PI = Math.PI;
export const TWO_PI = 2.0 * PI;
export const PI_SQUARED = PI * PI;

const B: number = 4.0 / PI;
const C: number = -4.0 / PI_SQUARED;
const P: number = 0.225;

// Sinusoid approximation function (fast sin)
// http://devmaster.net/posts/9648/fast-and-accurate-sine-cosine
export function parabolicSine(angle: number): number {
  let y: number = B * angle + C * angle * Math.abs(angle);
  return P * (y * Math.abs(y) - y) + y;
}

// concave and/or convex transform correction factor
const kCTCoefficient = 5.0 / 12.0;

// concave/convex transform correction factor at x = 0
const kCTCorrFactorZero = Math.pow(10.0, -1.0 / kCTCoefficient);

// inverse concave/convex transform factor at x = 0
const kCTCorrFactorAnitZero = 1.0 / (1.0 - kCTCorrFactorZero);

// concave/convex transform correction factor at x = 1
const kCTCorrFactorUnity =
  1.0 / (1.0 + kCTCoefficient * Math.log10(1.0 + kCTCorrFactorZero));

// inverse concave/convex transform correction factor at x = 1
const kCTCorrFactorAntiUnity =
  1.0 / (1.0 + -Math.pow(10.0, -1.0 / kCTCoefficient));

// concave/convex transform correction factor
const kCTCorrFactorAntiLog =
  kCTCoefficient * Math.log10(1.0 + kCTCorrFactorZero);

// concave/convex transform scaling factor
const kCTCorrFactorAntiLogScale =
  1.0 /
  (-kCTCoefficient * Math.log10(kCTCorrFactorZero) + kCTCorrFactorAntiLog);

// Perform the MMA concave transform on a unipolar value
export function concaveXForm(xn: number) {
  if (xn >= 1.0) return 1.0;
  if (xn <= 0.0) return 0.0;

  const transformed =
    -kCTCoefficient *
      kCTCorrFactorAntiLogScale *
      Math.log10(1.0 - xn + kCTCorrFactorZero) +
    kCTCorrFactorAntiLog;

  return clamp(transformed, 0.0, 1.0);
}

export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

// calculates the bipolar [-1.0, +1.0] value FROM a unipolar [0.0, +1.0] value
export function bipolar(value: number) {
  return 2.0 * value - 1.0;
}

// https://stackoverflow.com/questions/4633177/c-how-to-wrap-a-float-to-the-interval-pi-pi
export function wrapMax(x: number, max: number): number {
  return (max + (x % max)) % max;
}

// https://stackoverflow.com/questions/4633177/c-how-to-wrap-a-float-to-the-interval-pi-pi
export function wrapMinMax(x: number, min: number, max: number): number {
  return min + wrapMax(x - min, max - min);
}
