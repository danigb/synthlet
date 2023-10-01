import { NoiseGenerator } from "./noise-generator";

function setup() {
  const noiseGenerator = new NoiseGenerator();
  const buffer = Array.from({ length: 10 }, () => 0);
  return { noiseGenerator, buffer };
}

describe("NoiseGenerator", () => {
  it("generates deterministic white noise", () => {
    const { noiseGenerator, buffer } = setup();
    const output = buffer.map(() => noiseGenerator.doWhiteNoise());
    expect(output).toEqual([
      1.8734640525359343, 0.9401307187369398, 0.8219281036457811,
      0.024390800396071468, -0.7649939308792805, -0.7268511133098162,
      -1.4292637387824394, -1.561261197449933, -1.8800436737667872,
      -2.1893516816639695,
    ]);
  });

  it("generates deterministic pink noise", () => {
    const { noiseGenerator, buffer } = setup();
    const output = buffer.map(() => noiseGenerator.doPinkNoise());
    expect(output).toEqual([
      3.391594665310802, 3.6297723383657376, 3.824420553058747,
      2.775878680954277, 0.9732056992167836, -0.03422226736651296,
      -1.8753673812055955, -3.2906362511075344, -4.8430858635424165,
      -6.482714421024954,
    ]);
  });
});
