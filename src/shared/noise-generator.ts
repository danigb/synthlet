/**
 * Normal Distribution using the Box-Muller transform
 */
function normalRandomDistribution(
  mean: number,
  variance: number,
  u1: number,
  u2: number
): number {
  const z1 = Math.sqrt(-2.0 * Math.log(u1)) * Math.cos(2.0 * Math.PI * u2);
  const x = mean + variance * z1;
  return x;
}

/**
 * Fast white noise generation
 * 
 * The seed provided will result in a sequence with a period of 3/4 * 2^29, and with 268876131 unique output values 
 * in the [-2147483635, 2147483642] range. This is probably more than enough to generate white noise at any 
 * reasonable sample rate, but you can easily increase/max out the period and range, simply by using different seed values.

 * If you instead use g_x1 = 0x70f4f854 and g_x2 = 0xe1e9f0a7, then this will result in a sequence with a period of 
 * 3/4 * 2^32, with 1896933636 unique output values in the [-2147483647, 2147483647] range. 
 * This is probably the best you can do with a word size of 32 bits. Also note that only the highest bit will actually 
 * have the max period, lower bits will have increasingly shorter periods.
 * 
 * ⚠️ Currently this function is not in use because the result is outside range [0, 1]
 *
 * @author ed.bew@hcrikdlef.dreg
 * @source https://www.musicdsp.org/en/latest/Synthesis/216-fast-whitenoise-generator.html
 */
export function fastWhiteNoise() {
  let scale: number = 1.0 / 0xffffffff;
  let seed1: number = 0x67452301;
  let seed2: number = 0xefcdab89;
  return () => {
    seed1 ^= seed2;
    const output = seed2 * scale;
    seed2 += seed1;
    return output;
  };
}

/**
 * A simple deterministic random number generator used for testing
 */
export function linearCongruentialGenerator(seed = 1234567) {
  const a = 1664525;
  const c = 1013904223;
  const m = Math.pow(2, 32); // 2^32

  return () => {
    seed = (a * seed + c) % m;
    return seed / m;
  };
}

export class NoiseGenerator {
  /** pinking filter coefficients */
  protected bN: number[] = [0.99765, -0.96362, 0.46454];

  doWhiteNoise = Math.random;

  setDeterministicWhiteNoise(seed?: number) {
    this.doWhiteNoise = linearCongruentialGenerator(seed);
  }

  doGaussianWhiteNoise(mean: number = 0.0, variance: number = 1.0): number {
    return normalRandomDistribution(
      mean,
      variance,
      this.doWhiteNoise(),
      this.doWhiteNoise()
    );
  }

  doPinkNoise(): number {
    const white = this.doWhiteNoise();
    this.bN[0] = 0.99765 * this.bN[0] + white * 0.099046;
    this.bN[1] = 0.963 * this.bN[1] + white * 0.2965164;
    this.bN[2] = 0.57 * this.bN[2] + white * 1.0526913;
    return this.bN[0] + this.bN[1] + this.bN[2] + white * 0.1848;
  }
}
