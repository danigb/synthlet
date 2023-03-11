export const PI = Math.PI;
export const TWO_PI = Math.PI * 2;

export const pitchFactor = (pitch: number) => Math.pow(1.0595, pitch);
export const pitchToFrequency = (pitch: number) =>
  440 * pitchFactor(pitch - 69);

export const fastAtan = (x: number) => x / (1.0 + 0.28 * (x * x));

// http://www.kvraudio.com/forum/viewtopic.php?t=375517
export function blep(phase: number, phaseIncrement: number): number {
  if (phase < phaseIncrement) {
    phase /= phaseIncrement;
    return phase + phase - phase * phase - 1.0;
  } else if (phase > 1.0 - phaseIncrement) {
    phase = (phase - 1.0) / phaseIncrement;
    return phase * phase + phase + phase + 1.0;
  }
  return 0.0;
}

export function pulse(
  phase: number,
  phaseIncrement: number,
  width: number
): number {
  let v = phase < width ? 1.0 : -1.0;
  v += blep(phase, phaseIncrement);
  v -= blep((phase + (1.0 - width)) % 1.0, phaseIncrement);
  return v;
}

// https://stackoverflow.com/questions/1640258/need-a-fast-random-generator-for-c
let x = 123456789;
let y = 362436069;
let z = 521288629;

function xorshift(): number {
  let t: number;
  x ^= x << 16;
  x ^= x >> 5;
  x ^= x << 1;
  t = x;
  x = y;
  y = z;
  z = t ^ x ^ y;
  return z;
}

const xorshiftMultiplier = 2.0 / 4294967295.0; // ULONG_MAX is 4294967295
export function random(): number {
  return -1.0 + xorshift() * xorshiftMultiplier;
}
