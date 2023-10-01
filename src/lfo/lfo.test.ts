import { Lfo, LfoWaveform } from "./lfo";

function setup() {
  const lfo = new Lfo(9);
  lfo.setFrequency(1);
  const buffer = new Float32Array(10);
  return { lfo, buffer };
}

describe("Lfo", () => {
  it("renders sine", () => {
    const { lfo, buffer } = setup();
    lfo.setWaveform(LfoWaveform.Sine);
    lfo.fillAudioBuffer(buffer);
    expect(Array.from(buffer)).toEqual([
      10, 7.668038368225098, 1.7256516218185425, -5, -9.400548934936523,
      -9.400548934936523, -5, 1.7256516218185425, 7.668038368225098, 10,
    ]);
  });
  it("renders triangle", () => {
    const { lfo, buffer } = setup();
    lfo.setWaveform(LfoWaveform.Triangle);
    lfo.fillAudioBuffer(buffer);
    expect(Array.from(buffer)).toEqual([
      0, 4.44444465637207, 8.88888931274414, 6.666666507720947,
      2.222222328186035, -2.222222328186035, -6.666666507720947,
      -8.88888931274414, -4.44444465637207, 4.440892098500626e-15,
    ]);
  });
});
