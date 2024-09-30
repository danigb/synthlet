export function Diode(sampleRate: number) {
  let fHslider0 = 0;
  let fHslider1 = 0;
  let fRec1 = [0, 0];
  let fRec2 = [0, 0];
  let fRec3 = [0, 0];
  let fRec4 = [0, 0];

  const fConst0 = Math.min(1.92e5, Math.max(1.0, sampleRate));
  const fConst1 = 6.2831855 / fConst0;
  const fConst2 = 6.0 / fConst0;
  const fConst3 = 2.0 / fConst0;

  return { update, process };

  function update(frequency: number, resonance: number) {
    fHslider0 = frequency;
    fHslider1 = resonance;
  }

  function process(input: Float32Array, output: Float32Array) {
    let fSlow0 = fHslider0;
    let fSlow1 = Math.tan(fConst1 * Math.pow(1e1, fConst2 * fSlow0 + 1.0));
    let fSlow2 = fSlow1 + 1.0;
    let fSlow3 = fSlow1 / fSlow2;
    let fSlow4 = fSlow1 * fSlow1;
    let fSlow5 = fSlow1 * (1.0 - 0.25 * fSlow3) + 1.0;
    let fSlow6 = fSlow2 * fSlow5;
    let fSlow7 = 0.25 * (fSlow4 / fSlow6) + 1.0;
    let fSlow8 = fSlow1 / fSlow5;
    let fSlow9 = fSlow1 * (1.0 - 0.25 * fSlow8) + 1.0;
    let fSlow10 = fSlow5 * fSlow9;
    let fSlow11 = 0.25 * (fSlow4 / fSlow10) + 1.0;
    let fSlow12 = fSlow1 / fSlow9;
    let fSlow13 = 0.5 * fSlow12;
    let fSlow14 = fSlow1 * (1.0 - fSlow13) + 1.0;
    let fSlow15 = 17.0 - 9.7 * Math.pow(fConst3 * fSlow0, 1e1);
    let fSlow16 = 24.293 * fHslider1 + -0.00010678119;
    let fSlow17 =
      (0.5 * (fSlow4 / (fSlow9 * fSlow14)) + 1.0) /
      (0.0051455377 *
        ((fSlow1 * fSlow1 * fSlow1 * fSlow1 * fSlow15 * fSlow16) /
          (fSlow6 * fSlow9 * fSlow14)) +
        1.0);
    let fSlow18 = (fSlow15 * fSlow16) / fSlow2;
    let fSlow19 = 0.02058215 * fSlow8;
    let fSlow20 = 0.5 * fSlow3;
    let fSlow21 = 0.02058215 * fSlow12;
    let fSlow22 = 0.5 * fSlow8;
    let fSlow23 =
      0.0051455377 * ((fSlow1 * fSlow1 * fSlow1) / (fSlow10 * fSlow14));
    let fSlow24 = 1.0 / fSlow9;
    let fSlow25 = 0.5 * (fSlow1 / fSlow14);
    let fSlow26 = 1.0 / fSlow5;
    let fSlow27 = 1.0 / fSlow2;
    let fSlow28 = 2.0 * fSlow3;

    for (let i = 0; i < input.length; i++) {
      let fTemp0 = Math.max(-1.0, Math.min(1.0, 1e2 * input[i]));
      let fTemp1 = fSlow20 * fRec1[1] + fRec2[1];
      let fTemp2 = fSlow22 * fTemp1;
      let fTemp3 = fTemp2 + fRec3[1];
      let fTemp4 = fSlow12 * fTemp3 + fRec4[1];
      let fTemp5 =
        fSlow17 *
          (1.5 * fTemp0 * (1.0 - 0.33333334 * (fTemp0 * fTemp0)) -
            fSlow18 *
              (0.0411643 * fRec1[1] +
                fSlow19 * fTemp1 +
                fSlow21 * fTemp3 +
                fSlow23 * fTemp4)) +
        fSlow24 * (fTemp3 + fSlow25 * fTemp4) -
        fRec4[1];
      let fTemp6 =
        0.5 *
          (fSlow11 * (fRec4[1] + fSlow3 * fTemp5) +
            fSlow26 * (fTemp1 + fSlow13 * fTemp3)) -
        fRec3[1];
      let fTemp7 =
        0.5 *
          (fSlow7 * (fRec3[1] + fSlow3 * fTemp6) +
            fSlow27 * (fRec1[1] + fTemp2)) -
        fRec2[1];
      let fTemp8 = 0.5 * (fRec2[1] + fSlow3 * fTemp7) - fRec1[1];
      let fRec0 = fRec1[1] + fSlow3 * fTemp8;
      fRec1[0] = fRec1[1] + fSlow28 * fTemp8;
      fRec2[0] = fRec2[1] + fSlow28 * fTemp7;
      fRec3[0] = fRec3[1] + fSlow28 * fTemp6;
      fRec4[0] = fRec4[1] + fSlow28 * fTemp5;
      output[i] = fRec0;
      fRec1[1] = fRec1[0];
      fRec2[1] = fRec2[0];
      fRec3[1] = fRec3[0];
      fRec4[1] = fRec4[0];
    }
  }
}
