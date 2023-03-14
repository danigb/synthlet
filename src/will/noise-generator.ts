/**
 * Normal Distribution using the Box-Muller transform
 */
function normalRandomDistribution(
  mean: number,
  variance: number,
  random: () => number
): number {
  const u1 = random();
  const u2 = random();
  const z1 = Math.sqrt(-2.0 * Math.log(u1)) * Math.cos(2.0 * Math.PI * u2);
  const x = mean + variance * z1;
  return x;
}

class NoiseGenerator {
  constructor() {}

  /** random number generator */
  defaultGeneratorEngine: () => number = Math.random;

  /** noise generation functions */
  doGaussianWhiteNoise(mean: number = 0.0, variance: number = 1.0): number {
    return normalRandomDistribution(
      mean,
      variance,
      this.defaultGeneratorEngine
    );
  }

  /**
   * Fast white noise generation
   *
   * @source https://www.musicdsp.org/en/latest/Synthesis/216-fast-whitenoise-generator.html
   */
  doWhiteNoise(): number {
    this.g_x1 ^= this.g_x2;
    const output = this.g_x2 * this.g_fScale;
    this.g_x2 += this.g_x1;
    return output;
  }

  doPinkNoise(): number {
    const white = this.doWhiteNoise();
    return this.doPinkingFilter(white);
  }

  protected doPinkingFilter(white: number): number {
    this.bN[0] = 0.99765 * this.bN[0] + white * 0.099046;
    this.bN[1] = 0.963 * this.bN[1] + white * 0.2965164;
    this.bN[2] = 0.57 * this.bN[2] + white * 1.0526913;
    return this.bN[0] + this.bN[1] + this.bN[2] + white * 0.1848;
  }

  protected pinkNoiseBuffer: number[] = [0, 0];

  /** pinking filter coefficients */
  protected bN: number[] = [0.99765, -0.96362, 0.46454];

  // --- another method of white noise, faster
  protected g_fScale: number = 2.0 / 0xffffffff;
  protected g_x1: number = 0x67452301;
  protected g_x2: number = 0xefcdab89;
}
