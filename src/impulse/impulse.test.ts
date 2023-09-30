import { Impulse } from "./impulse";

describe("Impulse", () => {
  it("fills control", () => {
    let synth = new Impulse(10);
    synth.setParams(1);
    let control = new Float32Array(5);

    synth.fillControl(control);
    expect(control).toEqual(new Float32Array([1, 0, 0, 0, 0]));
    synth.fillControl(control);
    expect(control).toEqual(new Float32Array([0, 0, 0, 0, 0]));
    synth.fillControl(control);
    expect(control).toEqual(new Float32Array([1, 0, 0, 0, 0]));
  });
});
