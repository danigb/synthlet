export function Oberheim(sampleRate: number, type: number) {
  let fConst0 = 0;
  let fConst1 = 0;
  let fConst2 = 0;
  let fHslider0 = 0;
  let fHslider1 = 0;
  let fRec4 = [0, 0];
  let fRec5 = [0, 0];

  fConst0 = Math.min(1.92e5, Math.max(1.0, sampleRate));
  fConst1 = 6.2831855 / fConst0;
  fConst2 = 6.0 / fConst0;
  type = type;

  return { update, process };

  function update(cutoff: number, resonance: number) {
    fHslider0 = cutoff;
    fHslider1 = resonance;
  }

  function process(input: Float32Array, output: Float32Array) {
    let fSlow0 = Math.tan(fConst1 * Math.pow(1e1, fConst2 * fHslider0 + 1.0));
    let fSlow1 = 1.0 / (29.293 * fHslider1 + 0.707) + fSlow0;
    let fSlow2 = fSlow0 * fSlow1 + 1.0;
    let fSlow3 = fSlow0 / fSlow2;
    let fSlow4 = 1.0 / fSlow2;
    let fSlow5 = 2.0 * fSlow0;

    for (let i = 0; i < input.length; i++) {
      let fTemp0 = input[0] - (fRec4[1] + fSlow1 * fRec5[1]);
      let fTemp1 = fSlow3 * fTemp0;
      let fTemp2 = Math.max(-1.0, Math.min(1.0, fRec5[1] + fTemp1));
      let fTemp3 = fTemp2 * (1.0 - 0.33333334 * (fTemp2 * fTemp2));
      let fTemp4 = fSlow0 * fTemp3;
      let fRec0 = fRec4[1] + fTemp4;
      let fTemp5 = fSlow4 * fTemp0;
      let fRec1 = fTemp5;
      let fRec2 = fTemp3;
      let fRec3 = fTemp4 + fRec4[1] + fTemp5;
      fRec4[0] = fRec4[1] + fSlow5 * fTemp3;
      fRec5[0] = fTemp1 + fTemp3;
      output[i] =
        type == 1
          ? fRec1 // High-pass
          : type == 2
          ? fRec2 // Band-pass
          : type == 3
          ? fRec3 // Band-stop
          : fRec0; // Low-pass
      fRec4[1] = fRec4[0];
      fRec5[1] = fRec5[0];
    }
  }
}
