import { Lfo, LfoWaveform } from "./lfo";

function setup() {
  const lfo = new Lfo(9);
  const buffer = new Float32Array(10);
  return { lfo, buffer };
}

describe("Lfo", () => {
  it("renders sine", () => {
    const { lfo, buffer } = setup();
    lfo.setParameters(LfoWaveform.Sine, 1, 10, 0);
    lfo.fillAudioBuffer(buffer);
    expect(Array.from(buffer)).toEqual([
      10, 7.668038368225098, 1.7256516218185425, -5, -9.400548934936523,
      -9.400548934936523, -5, 1.7256516218185425, 7.668038368225098, 10,
    ]);
  });
  it("renders triangle", () => {
    const { lfo, buffer } = setup();
    lfo.setParameters(LfoWaveform.Triangle, 1, 10, 0);
    lfo.fillAudioBuffer(buffer);
    expect(Array.from(buffer)).toEqual([
      0, 4.44444465637207, 8.88888931274414, 6.666666507720947,
      2.222222328186035, -2.222222328186035, -6.666666507720947,
      -8.88888931274414, -4.44444465637207, 4.440892098500626e-15,
    ]);
  });

  it("renders sample and hold", () => {
    const { lfo, buffer } = setup();
    // doWhiteNoise is called once (on lfo constructor) before mocking
    lfo.noiseGen.doWhiteNoise = jest.fn(() => 0.0);
    lfo.setParameters(LfoWaveform.RandSampleHold, 1, 10, 0);
    lfo.fillAudioBuffer(buffer);
    expect(lfo.noiseGen.doWhiteNoise).toHaveBeenCalledTimes(1);
    lfo.fillAudioBuffer(buffer);
    expect(lfo.noiseGen.doWhiteNoise).toHaveBeenCalledTimes(2);
    lfo.fillAudioBuffer(buffer);
    expect(lfo.noiseGen.doWhiteNoise).toHaveBeenCalledTimes(3);
  });
});
