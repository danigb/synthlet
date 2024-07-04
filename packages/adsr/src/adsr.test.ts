import { Adsr } from "./adsr";

describe("Adsr Generator", () => {
  const defaultParams = {
    gate: [0],
    attack: [0.3],
    decay: [0.2],
    sustain: [0.5],
    release: [0.4],
    offset: [0],
    gain: [1],
  };

  describe("ADSR", () => {
    it("process input with adsr adsr", () => {
      const adsr = Adsr(20);
      const outputGateOn = new Float32Array(20);
      adsr.agen(outputGateOn, {
        ...defaultParams,
        gate: [1],
      });
      expect(outputGateOn).toMatchSnapshot();

      const outputGateOff = new Float32Array(20);
      adsr.agen(outputGateOff, {
        ...defaultParams,
        gate: [0],
      });
      expect(outputGateOff).toMatchSnapshot();
    });
  });
});
