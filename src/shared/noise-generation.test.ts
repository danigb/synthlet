import {
  NoiseGenerator,
  fastWhiteNoise,
  linearCongruentialGenerator,
} from "./noise-generator";

function setup() {
  const noiseGenerator = new NoiseGenerator();
  noiseGenerator.setDeterministicWhiteNoise();
  const buffer = Array.from({ length: 10 }, () => 0);
  return { noiseGenerator, buffer };
}

describe("fastWhiteNoise", () => {});

describe("NoiseGenerator", () => {
  it.skip("fastWhiteNoise generates white noise in [0.0, 1.0] range", () => {
    const generate = fastWhiteNoise();
    for (let i = 0; i < 10000; i++) {
      const value = generate();
      expect(value).toBeGreaterThanOrEqual(0.0);
      expect(value).toBeLessThanOrEqual(1.0);
    }
  });

  it("linearCongruentialGenerator generates white noise in [0.0, 1.0] range", () => {
    const generate = linearCongruentialGenerator();
    let max = 0,
      min = 0;
    for (let i = 0; i < 10000; i++) {
      const value = generate();
      max = Math.max(max, value);
      min = Math.min(min, value);
      expect(value).toBeGreaterThanOrEqual(0.0);
      expect(value).toBeLessThanOrEqual(1.0);
    }
    expect(max).toBe(0.9998433205764741);
    expect(min).toBe(0);
  });
  it("can generate deterministic white noise", () => {
    const { noiseGenerator, buffer } = setup();
    const output = buffer.map(() => noiseGenerator.doWhiteNoise());
    expect(output).toEqual([
      0.695505274925381, 0.15381314256228507, 0.0571914603933692,
      0.8516792457085103, 0.6325309309177101, 0.7838537741918117,
      0.4395545981824398, 0.8536075984593481, 0.4238935192115605,
      0.596133595565334,
    ]);
  });

  it("can generate deterministic pink noise", () => {
    const { noiseGenerator, buffer } = setup();
    const output = buffer.map(() => noiseGenerator.doPinkNoise());
    expect(output).toEqual([
      1.4679247250864105, 1.1860996355870266, 0.9585949720960211,
      2.1539843090831288, 2.5368705445016038, 3.129499936399707,
      3.0143581489162408, 3.728191799691076, 3.520650741950054,
      3.787913888725774,
    ]);
  });
});
