export function Korg35(sampleRate: number, type: number) {
  let fSampleRate = 0;
  let fConst0 = 0;
  let fConst1 = 0;
  let fConst2 = 0;
  let fHslider0 = 0;
  let fHslider1 = 0;
  let fRec1 = [0, 0];
  let fRec2 = [0, 0];
  let fRec3 = [0, 0];

  fConst0 = Math.min(1.92e5, Math.max(1.0, sampleRate));
  fConst1 = 6.2831855 / fConst0;
  fConst2 = 6.0 / fConst0;
  const process = type === 1 ? hpf : lpf;

  return { update, process };

  function update(frequency: number, resonance: number) {
    fHslider0 = frequency;
    fHslider1 = resonance;
  }

  function lpf(input: Float32Array, output: Float32Array) {
    let fSlow0 = Math.tan(fConst1 * Math.pow(1e1, fConst2 * fHslider0 + 1.0));
    let fSlow1 = fSlow0 + 1.0;
    let fSlow2 = fSlow0 / fSlow1;
    let fSlow3 = 9.293 * fHslider1 + -0.00010678119;
    let fSlow4 = 1.0 - fSlow2;
    let fSlow5 =
      1.0 / (1.0 - 0.21521823 * ((fSlow0 * fSlow3 * fSlow4) / fSlow1));
    let fSlow6 = 1.0 / fSlow1;
    let fSlow7 = 0.21521823 * fSlow3 * fSlow4;
    let fSlow8 = 2.0 * fSlow2;
    let fSlow9 = 0.21521823 * fSlow3;

    for (let i = 0; i < input.length; i++) {
      let fTemp0 = input[i] - fRec3[1];
      let fTemp1 =
        fSlow5 *
          (fRec3[1] +
            fSlow6 * (fSlow0 * fTemp0 + fSlow7 * fRec1[1] - fRec2[1])) -
        fRec1[1];
      let fTemp2 = fRec1[1] + fSlow2 * fTemp1;
      let fRec0 = fTemp2;
      fRec1[0] = fRec1[1] + fSlow8 * fTemp1;
      fRec2[0] = fRec2[1] + fSlow8 * (fSlow9 * fTemp2 - fRec2[1]);
      fRec3[0] = fRec3[1] + fSlow8 * fTemp0;
      output[i] = fRec0;
      fRec1[1] = fRec1[0];
      fRec2[1] = fRec2[0];
      fRec3[1] = fRec3[0];
    }
  }

  function hpf(input: Float32Array, output: Float32Array) {
    let fSlow0 = Math.tan(fConst1 * Math.pow(1e1, fConst2 * fHslider0 + 1.0));
    let fSlow1 = 9.293 * fHslider1 + -0.00010678119;
    let fSlow2 = fSlow0 + 1.0;
    let fSlow3 = fSlow0 / fSlow2;
    let fSlow4 =
      1.0 - 0.21521823 * ((fSlow0 * fSlow1 * (1.0 - fSlow3)) / fSlow2);
    let fSlow5 = 1.0 / fSlow4;
    let fSlow6 = 1.0 / fSlow2;
    let fSlow7 = 2.0 * fSlow3;
    let fSlow8 = 0.21521823 * (fSlow1 / fSlow4);

    for (let i = 0; i < input.length; i++) {
      let fTemp0 = input[i];
      let fTemp1 = fTemp0 - fRec3[1];
      let fTemp2 =
        fTemp0 -
        (fRec3[1] + fSlow6 * (fSlow0 * fTemp1 - fRec1[1] + fSlow3 * fRec2[1]));
      let fRec0 = fSlow5 * fTemp2;
      let fTemp3 = fSlow8 * fTemp2;
      let fTemp4 = fTemp3 - fRec2[1];
      fRec1[0] =
        fRec1[1] + fSlow7 * (fTemp3 - (fSlow3 * fTemp4 + fRec1[1] + fRec2[1]));
      fRec2[0] = fRec2[1] + fSlow7 * fTemp4;
      fRec3[0] = fRec3[1] + fSlow7 * fTemp1;
      output[i] = fRec0;
      fRec1[1] = fRec1[0];
      fRec2[1] = fRec2[0];
      fRec3[1] = fRec3[0];
    }
  }
}
