// The MoogLadder filter implemented in Faust
export function Moog(sampleRate: number) {
  let fHslider0 = 0;
  let fHslider1 = 0;
  let fRec0 = [0, 0];
  let fRec1 = [0, 0];
  let fRec2 = [0, 0];
  let fRec3 = [0, 0];

  const fConst0 = 3.1415927 / Math.min(1.92e5, Math.max(1.0, sampleRate));

  return { update, process };

  function update(frequency: number, resonance: number) {
    fHslider0 = frequency;
    fHslider1 = resonance;
  }

  function process(input: Float32Array, output: Float32Array) {
    let fSlow0 = Math.tan(fConst0 * fHslider0);
    let fSlow1 = fSlow0 + 1.0;
    let fSlow2 = fSlow0 / fSlow1;
    let fSlow3 = 24.293 * fHslider1 + -0.00010678119;
    let fSlow4 = 0.1646572 * fSlow3 * (1.0 - fSlow2);
    let fSlow5 =
      1.0 /
      (0.1646572 *
        ((fSlow0 * fSlow0 * fSlow0 * fSlow0 * fSlow3) /
          (fSlow1 * fSlow1 * fSlow1 * fSlow1)) +
        1.0);
    let fSlow6 = 2.0 * fSlow2;

    for (let i = 0; i < input.length; i++) {
      let fTemp0 =
        fSlow5 *
          (input[i] -
            fSlow4 *
              (fRec3[1] +
                fSlow2 *
                  (fRec2[1] + fSlow2 * (fRec1[1] + fSlow2 * fRec0[1])))) -
        fRec0[1];
      fRec0[0] = fRec0[1] + fSlow6 * fTemp0;
      let fTemp1 = fRec0[1] + fSlow2 * fTemp0 - fRec1[1];
      fRec1[0] = fRec1[1] + fSlow6 * fTemp1;
      let fTemp2 = fRec1[1] + fSlow2 * fTemp1 - fRec2[1];
      fRec2[0] = fRec2[1] + fSlow6 * fTemp2;
      let fTemp3 = fRec2[1] + fSlow2 * fTemp2 - fRec3[1];
      fRec3[0] = fRec3[1] + fSlow6 * fTemp3;
      let fRec4 = fRec3[1] + fSlow2 * fTemp3;
      output[i] = fRec4;
      fRec0[1] = fRec0[0];
      fRec1[1] = fRec1[0];
      fRec2[1] = fRec2[0];
      fRec3[1] = fRec3[0];
    }
  }
}
