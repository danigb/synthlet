export function createChorus(sampleRate: number) {
  const ftbl0ChorusSIG0 = new Float32Array(65536);
  const ftbl1ChorusSIG1 = new Float32Array(65536);

  const fSampleRate = sampleRate;
  let fRec0 = new Float32Array(2);
  let fRec1 = new Float32Array(2);
  let fRec10 = new Float32Array(2);
  let fRec11 = new Float32Array(2);
  let fRec12 = new Float32Array(2);
  let fRec2 = new Float32Array(2);
  let fRec4 = new Float32Array(2);
  let fRec5 = new Float32Array(2);
  let fRec7 = new Float32Array(2);
  let fRec8 = new Float32Array(2);
  let fRec9 = new Float32Array(2);
  let fVec1 = new Float32Array(8192);
  let IOTA0 = 0;
  let iVec0 = new Int32Array(2);

  let fConst0 = Math.min(1.92e5, Math.max(1.0, fSampleRate));
  let fConst1 = Math.exp(-(44.12234 / fConst0));
  let fConst2 = 1.0 - fConst1;
  let fConst3 = 0.33333334 / fConst0;
  let fConst4 = 1.0 / fConst0;
  let fConst5 = 0.14285715 / fConst0;
  let fConst6 = 0.5 / fConst0;
  let fConst7 = 0.25 / fConst0;
  let fConst8 = 0.16666667 / fConst0;
  let fConst9 = 0.125 / fConst0;
  let fVslider0 = 0.5;
  let fVslider1 = 0.5;
  let fVslider2 = 0.5;
  let fVslider3 = 0.5;
  fillTable(ftbl0ChorusSIG0, sig0Fn);
  fillTable(ftbl1ChorusSIG1, sig1Fn);

  function compute(
    input0: Float32Array,
    output0: Float32Array,
    output1: Float32Array
  ): void {
    let fSlow0 = fConst2 * fVslider0;
    let fSlow1 = 4.096 * fVslider1;
    let fSlow2 = 6.25e-5 * fVslider2;
    let fSlow3 = fConst2 * fVslider3;
    for (let i = 0; i < input0.length; i++) {
      // Assume all necessary variables exist (fRec0, fRec1, fRec2, fRec4, fRec5, fRec7, fRec8, fVec1, ftbl0ChorusSIG0, ftbl1ChorusSIG1, IOTA0, etc.)

      let fTemp0 = input0[i]; // Assume input0 is an array and we're in a loop
      iVec0[0] = 1;
      fRec0[0] = fSlow0 + fConst1 * fRec0[1];
      let fTemp1 = fTemp0 * fRec0[0];
      fVec1[IOTA0 & 8191] = fTemp1;

      fRec1[0] = fSlow1 + 0.999 * fRec1[1];
      fRec2[0] = fSlow2 * fRec1[0] + 0.999 * fRec2[1];
      // Simulate i32::wrapping_sub: not sure if needed
      //let iTemp2 = (1 - iVec0[1] + 4294967296) % 4294967296;
      let iTemp2 = 1 - iVec0[1];
      fRec5[0] = fSlow3 + fConst1 * fRec5[1];
      let fTemp3 = iTemp2 !== 0 ? 0.0 : fRec4[1] + fConst3 * fRec5[0];
      fRec4[0] = fTemp3 - Math.floor(fTemp3);
      let fTemp4 = Math.min(
        4096.0,
        0.375 * fRec1[0] +
          fRec2[0] *
            ftbl0ChorusSIG0[
              Math.max(0, Math.min(Math.floor(65536.0 * fRec4[0]), 65535))
            ]
      );
      let iTemp5 = Math.floor(fTemp4);
      let fTemp6 = Math.floor(fTemp4);
      let fTemp7 = iTemp2 !== 0 ? 0.0 : fRec7[1] + fConst4 * fRec5[0];
      fRec7[0] = fTemp7 - Math.floor(fTemp7);
      let fTemp8 = Math.min(
        4096.0,
        0.125 * fRec1[0] +
          fRec2[0] *
            ftbl1ChorusSIG1[
              Math.max(0, Math.min(Math.floor(65536.0 * fRec7[0]), 65535))
            ]
      );
      let fTemp9 = Math.floor(fTemp8);
      let iTemp10 = Math.floor(fTemp8);
      let fTemp11 = fTemp0 * (1.0 - fRec0[0]);
      let fTemp12 = iTemp2 !== 0 ? 0.0 : fRec8[1] + fConst5 * fRec5[0];
      fRec8[0] = fTemp12 - Math.floor(fTemp12);
      let fTemp13 = Math.min(
        4096.0,
        0.875 * fRec1[0] -
          fRec2[0] *
            ftbl0ChorusSIG0[
              Math.max(0, Math.min(Math.floor(65536.0 * fRec8[0]), 65535))
            ]
      );
      let iTemp14 = Math.floor(fTemp13);
      let fTemp15 = Math.floor(fTemp13);

      output0[i] =
        0.70710677 *
          (fVec1[(IOTA0 - Math.min(4097, Math.max(0, iTemp5))) & 8191] *
            (fTemp6 + (1.0 - fTemp4)) +
            (fTemp4 - fTemp6) *
              fVec1[(IOTA0 - Math.min(4097, Math.max(0, iTemp5 + 1))) & 8191]) +
        (fTemp8 - fTemp9) *
          fVec1[(IOTA0 - Math.min(4097, Math.max(0, iTemp10 + 1))) & 8191] +
        fTemp11 +
        fVec1[(IOTA0 - Math.min(4097, Math.max(0, iTemp10))) & 8191] *
          (fTemp9 + (1.0 - fTemp8)) -
        0.70710677 *
          (fVec1[(IOTA0 - Math.min(4097, Math.max(0, iTemp14))) & 8191] *
            (fTemp15 + (1.0 - fTemp13)) +
            (fTemp13 - fTemp15) *
              fVec1[(IOTA0 - Math.min(4097, Math.max(0, iTemp14 + 1))) & 8191]);

      let fTemp16 = iTemp2 !== 0 ? 0.0 : fRec9[1] + fConst6 * fRec5[0];
      fRec9[0] = fTemp16 - Math.floor(fTemp16);
      let iTemp17 = Math.max(
        0,
        Math.min(Math.floor(65536.0 * fRec9[0]), 65535)
      );
      let fTemp18 = Math.min(
        4096.0,
        0.25 * fRec1[0] +
          fRec2[0] *
            (0.70710677 * ftbl1ChorusSIG1[iTemp17] +
              0.70710677 * ftbl0ChorusSIG0[iTemp17])
      );
      let iTemp19 = Math.floor(fTemp18);
      let fTemp20 = Math.floor(fTemp18);
      let fTemp21 = iTemp2 !== 0 ? 0.0 : fRec10[1] + fConst7 * fRec5[0];
      fRec10[0] = fTemp21 - Math.floor(fTemp21);
      let iTemp22 = Math.max(
        0,
        Math.min(Math.floor(65536.0 * fRec10[0]), 65535)
      );
      let fTemp23 = Math.min(
        4096.0,
        0.5 * fRec1[0] +
          fRec2[0] *
            (0.70710677 * ftbl0ChorusSIG0[iTemp22] -
              0.70710677 * ftbl1ChorusSIG1[iTemp22])
      );
      let iTemp24 = Math.floor(fTemp23);
      let fTemp25 = Math.floor(fTemp23);
      let fTemp26 = iTemp2 !== 0 ? 0.0 : fRec11[1] + fConst8 * fRec5[0];
      fRec11[0] = fTemp26 - Math.floor(fTemp26);
      let iTemp27 = Math.max(
        0,
        Math.min(Math.floor(65536.0 * fRec11[0]), 65535)
      );
      let fTemp28 = Math.min(
        4096.0,
        0.75 * fRec1[0] -
          fRec2[0] *
            (0.70710677 * ftbl1ChorusSIG1[iTemp27] +
              0.70710677 * ftbl0ChorusSIG0[iTemp27])
      );
      let iTemp29 = Math.floor(fTemp28);
      let fTemp30 = Math.floor(fTemp28);
      let fTemp31 = iTemp2 !== 0 ? 0.0 : fRec12[1] + fConst9 * fRec5[0];
      fRec12[0] = fTemp31 - Math.floor(fTemp31);
      let iTemp32 = Math.max(
        0,
        Math.min(Math.floor(65536.0 * fRec12[0]), 65535)
      );
      let fTemp33 = Math.min(
        4096.0,
        fRec1[0] +
          fRec2[0] *
            (0.70710677 * ftbl1ChorusSIG1[iTemp32] -
              0.70710677 * ftbl0ChorusSIG0[iTemp32])
      );
      let iTemp34 = Math.floor(fTemp33);
      let fTemp35 = Math.floor(fTemp33);

      output1[i] =
        fTemp11 -
        (0.38268343 *
          (fVec1[(IOTA0 - Math.min(4097, Math.max(0, iTemp19))) & 8191] *
            (fTemp20 + (1.0 - fTemp18)) +
            (fTemp18 - fTemp20) *
              fVec1[
                (IOTA0 - Math.min(4097, Math.max(0, iTemp19 + 1))) & 8191
              ]) +
          0.9238795 *
            (fVec1[(IOTA0 - Math.min(4097, Math.max(0, iTemp24))) & 8191] *
              (fTemp25 + (1.0 - fTemp23)) +
              (fTemp23 - fTemp25) *
                fVec1[
                  (IOTA0 - Math.min(4097, Math.max(0, iTemp24 + 1))) & 8191
                ]) +
          0.9238795 *
            (fVec1[(IOTA0 - Math.min(4097, Math.max(0, iTemp29))) & 8191] *
              (fTemp30 + (1.0 - fTemp28)) +
              (fTemp28 - fTemp30) *
                fVec1[
                  (IOTA0 - Math.min(4097, Math.max(0, iTemp29 + 1))) & 8191
                ]) +
          0.38268343 *
            (fVec1[(IOTA0 - Math.min(4097, Math.max(0, iTemp34))) & 8191] *
              (fTemp35 + (1.0 - fTemp33)) +
              (fTemp33 - fTemp35) *
                fVec1[
                  (IOTA0 - Math.min(4097, Math.max(0, iTemp34 + 1))) & 8191
                ]));

      iVec0[1] = iVec0[0];
      fRec0[1] = fRec0[0];
      IOTA0 = (IOTA0 + 1) >>> 0; // Wrapping addition
      fRec1[1] = fRec1[0];
      fRec2[1] = fRec2[0];
      fRec5[1] = fRec5[0];
      fRec4[1] = fRec4[0];
      fRec7[1] = fRec7[0];
      fRec8[1] = fRec8[0];
      fRec9[1] = fRec9[0];
      fRec10[1] = fRec10[0];
      fRec11[1] = fRec11[0];
      fRec12[1] = fRec12[0];
    }
  }

  function update(
    delay: number,
    rate: number,
    depth: number,
    deviation: number
  ): void {
    fVslider0 = delay;
    fVslider1 = rate;
    fVslider2 = depth;
    fVslider3 = deviation;
  }

  return { update, compute };
}

const sig0Fn = (x: number) => Math.cos(9.58738e-5 * x);
const sig1Fn = (x: number) => Math.sin(9.58738e-5 * x);

function fillTable(table: Float32Array, fn: (phase: number) => void) {
  if (table.length !== 65536) {
    throw new Error("Table must be 65536 samples long");
  }
  let iVec2A = 0;
  let iVec2B = 0;
  let iRec3A = 0;
  let iRec3B = 0;
  for (let i1 = 0; i1 < 65536; i1++) {
    iVec2A = 1;
    iRec3A = (iVec2B + iRec3B) % 65536;
    table[i1] = Math.cos(9.58738e-5 * iRec3A);
    iVec2B = iVec2A;
    iRec3B = iRec3A;
  }
  return table;
}
