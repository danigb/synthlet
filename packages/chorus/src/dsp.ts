export function createChorus(sampleRate: number) {
  const ftbl0ChorusSIG0 = new Float32Array(65536);
  const ftbl1ChorusSIG1 = new Float32Array(65536);

  let $iVec0 = new Int32Array(2);
  let $fVslider0 = 0.0;
  const $fSampleRate = sampleRate;
  let $fConst0 = 0.0;
  let $fConst1 = 0.0;
  let $fConst2 = 0.0;
  let $fVslider1 = 0.0;
  let $fRec0 = new Float32Array(2);
  let $IOTA0 = 0;
  let $fVec1 = new Float32Array(8192);
  let $fVslider2 = 0.0;
  let $fRec1 = new Float32Array(2);
  let $fVslider3 = 0.0;
  let $fRec2 = new Float32Array(2);
  let $fConst3 = 0.0;
  let $fVslider4 = 0.0;
  let $fRec5 = new Float32Array(2);
  let $fRec4 = new Float32Array(2);
  let $fConst4 = 0.0;
  let $fRec7 = new Float32Array(2);
  let $fConst5 = 0.0;
  let $fRec8 = new Float32Array(2);
  let $fConst6 = 0.0;
  let $fRec9 = new Float32Array(2);
  let $fConst7 = 0.0;
  let $fRec10 = new Float32Array(2);
  let $fConst8 = 0.0;
  let $fRec11 = new Float32Array(2);
  let $fConst9 = 0.0;
  let $fRec12 = new Float32Array(2);

  $fConst0 = Math.min(1.92e5, Math.max(1.0, $fSampleRate));
  $fConst1 = Math.exp(-(44.12234 / $fConst0));
  $fConst2 = 1.0 - $fConst1;
  $fConst3 = 0.33333334 / $fConst0;
  $fConst4 = 1.0 / $fConst0;
  $fConst5 = 0.14285715 / $fConst0;
  $fConst6 = 0.5 / $fConst0;
  $fConst7 = 0.25 / $fConst0;
  $fConst8 = 0.16666667 / $fConst0;
  $fConst9 = 0.125 / $fConst0;
  $fVslider0 = 0.5;
  $fVslider1 = 1.0;
  $fVslider2 = 0.5;
  $fVslider3 = 0.5;
  $fVslider4 = 0.5;
  fillTable(ftbl0ChorusSIG0, sig0Fn);
  fillTable(ftbl1ChorusSIG1, sig1Fn);

  function update(
    delay: number,
    rate: number,
    depth: number,
    deviation: number
  ): void {
    $fVslider0 = delay;
    $fVslider1 = 1; // enable
    $fVslider2 = rate;
    $fVslider3 = depth;
    $fVslider4 = deviation;
  }

  function compute(
    inputMono: Float32Array,
    outLeft: Float32Array,
    outRight: Float32Array
  ): void {
    let iSlow0: number = 1 - Math.floor($fVslider0);
    let fSlow1: number = $fConst2 * $fVslider1;
    let fSlow2: number = 4.096 * $fVslider2;
    let fSlow3: number = 6.25e-5 * $fVslider3;
    let fSlow4: number = $fConst2 * $fVslider4;

    for (let i = 0; i < inputMono.length; i++) {
      let input0 = inputMono[i];

      $iVec0[0] = 1;
      $fRec0[0] = fSlow1 + $fConst1 * $fRec0[1];
      let fTemp0: number = input0;
      let fTemp1: number = iSlow0 !== 0 ? 0.0 : fTemp0;
      let fTemp2: number = $fRec0[0] * fTemp1;
      $fVec1[$IOTA0 & 8191] = fTemp2;
      $fRec1[0] = fSlow2 + 0.999 * $fRec1[1];
      $fRec2[0] = fSlow3 * $fRec1[0] + 0.999 * $fRec2[1];

      let iTemp3: number = 1 - $iVec0[1];
      $fRec5[0] = fSlow4 + $fConst1 * $fRec5[1];
      let fTemp4: number =
        iTemp3 !== 0 ? 0.0 : $fRec4[1] + $fConst3 * $fRec5[0];
      $fRec4[0] = fTemp4 - Math.floor(fTemp4);

      let fTemp5: number = Math.min(
        4096.0,
        0.375 * $fRec1[0] +
          $fRec2[0] *
            ftbl0ChorusSIG0[
              Math.max(0, Math.min(Math.floor(65536.0 * $fRec4[0]), 65535))
            ]
      );
      let iTemp6: number = Math.floor(fTemp5);
      let fTemp7: number = Math.floor(fTemp5);

      let fTemp8: number =
        iTemp3 !== 0 ? 0.0 : $fRec7[1] + $fConst4 * $fRec5[0];
      $fRec7[0] = fTemp8 - Math.floor(fTemp8);

      let fTemp9: number = Math.min(
        4096.0,
        0.125 * $fRec1[0] +
          $fRec2[0] *
            ftbl1ChorusSIG1[
              Math.max(0, Math.min(Math.floor(65536.0 * $fRec7[0]), 65535))
            ]
      );
      let fTemp10: number = Math.floor(fTemp9);
      let iTemp11: number = Math.floor(fTemp9);

      let fTemp12: number = fTemp1 * (1.0 - $fRec0[0]);

      let fTemp13: number =
        iTemp3 !== 0 ? 0.0 : $fRec8[1] + $fConst5 * $fRec5[0];
      $fRec8[0] = fTemp13 - Math.floor(fTemp13);

      let fTemp14: number = Math.min(
        4096.0,
        0.875 * $fRec1[0] -
          $fRec2[0] *
            ftbl0ChorusSIG0[
              Math.max(0, Math.min(Math.floor(65536.0 * $fRec8[0]), 65535))
            ]
      );
      let iTemp15: number = Math.floor(fTemp14);
      let fTemp16: number = Math.floor(fTemp14);

      outLeft[i] =
        iSlow0 !== 0
          ? fTemp0
          : 0.70710677 *
              ($fVec1[($IOTA0 - Math.min(4097, Math.max(0, iTemp6))) & 8191] *
                (fTemp7 + (1.0 - fTemp5)) +
                (fTemp5 - fTemp7) *
                  $fVec1[
                    ($IOTA0 - Math.min(4097, Math.max(0, iTemp6 + 1))) & 8191
                  ]) +
            (fTemp9 - fTemp10) *
              $fVec1[
                ($IOTA0 - Math.min(4097, Math.max(0, iTemp11 + 1))) & 8191
              ] +
            fTemp12 +
            $fVec1[($IOTA0 - Math.min(4097, Math.max(0, iTemp11))) & 8191] *
              (fTemp10 + (1.0 - fTemp9)) -
            0.70710677 *
              ($fVec1[($IOTA0 - Math.min(4097, Math.max(0, iTemp15))) & 8191] *
                (fTemp16 + (1.0 - fTemp14)) +
                (fTemp14 - fTemp16) *
                  $fVec1[
                    ($IOTA0 - Math.min(4097, Math.max(0, iTemp15 + 1))) & 8191
                  ]);

      let fTemp17: number =
        iTemp3 !== 0 ? 0.0 : $fRec9[1] + $fConst6 * $fRec5[0];
      $fRec9[0] = fTemp17 - Math.floor(fTemp17);

      let iTemp18: number = Math.max(
        0,
        Math.min(Math.floor(65536.0 * $fRec9[0]), 65535)
      );

      let fTemp19: number = Math.min(
        4096.0,
        0.25 * $fRec1[0] +
          $fRec2[0] *
            (0.70710677 * ftbl1ChorusSIG1[iTemp18] +
              0.70710677 * ftbl0ChorusSIG0[iTemp18])
      );
      let iTemp20: number = Math.floor(fTemp19);
      let fTemp21: number = Math.floor(fTemp19);

      let fTemp22: number =
        iTemp3 !== 0 ? 0.0 : $fRec10[1] + $fConst7 * $fRec5[0];
      $fRec10[0] = fTemp22 - Math.floor(fTemp22);

      let iTemp23: number = Math.max(
        0,
        Math.min(Math.floor(65536.0 * $fRec10[0]), 65535)
      );

      let fTemp24: number = Math.min(
        4096.0,
        0.5 * $fRec1[0] +
          $fRec2[0] *
            (0.70710677 * ftbl0ChorusSIG0[iTemp23] -
              0.70710677 * ftbl1ChorusSIG1[iTemp23])
      );
      let iTemp25: number = Math.floor(fTemp24);
      let fTemp26: number = Math.floor(fTemp24);

      let fTemp27: number =
        iTemp3 !== 0 ? 0.0 : $fRec11[1] + $fConst8 * $fRec5[0];
      $fRec11[0] = fTemp27 - Math.floor(fTemp27);

      let iTemp28: number = Math.max(
        0,
        Math.min(Math.floor(65536.0 * $fRec11[0]), 65535)
      );

      let fTemp29: number = Math.min(
        4096.0,
        0.75 * $fRec1[0] -
          $fRec2[0] *
            (0.70710677 * ftbl1ChorusSIG1[iTemp28] +
              0.70710677 * ftbl0ChorusSIG0[iTemp28])
      );
      let iTemp30: number = Math.floor(fTemp29);
      let fTemp31: number = Math.floor(fTemp29);

      let fTemp32: number =
        iTemp3 !== 0 ? 0.0 : $fRec12[1] + $fConst9 * $fRec5[0];
      $fRec12[0] = fTemp32 - Math.floor(fTemp32);

      let iTemp33: number = Math.max(
        0,
        Math.min(Math.floor(65536.0 * $fRec12[0]), 65535)
      );

      let fTemp34: number = Math.min(
        4096.0,
        $fRec1[0] +
          $fRec2[0] *
            (0.70710677 * ftbl1ChorusSIG1[iTemp33] -
              0.70710677 * ftbl0ChorusSIG0[iTemp33])
      );
      let iTemp35: number = Math.floor(fTemp34);
      let fTemp36: number = Math.floor(fTemp34);

      outRight[i] =
        iSlow0 !== 0
          ? fTemp0
          : fTemp12 -
            (0.38268343 *
              ($fVec1[($IOTA0 - Math.min(4097, Math.max(0, iTemp20))) & 8191] *
                (fTemp21 + (1.0 - fTemp19)) +
                (fTemp19 - fTemp21) *
                  $fVec1[
                    ($IOTA0 - Math.min(4097, Math.max(0, iTemp20 + 1))) & 8191
                  ]) +
              0.9238795 *
                ($fVec1[
                  ($IOTA0 - Math.min(4097, Math.max(0, iTemp25))) & 8191
                ] *
                  (fTemp26 + (1.0 - fTemp24)) +
                  (fTemp24 - fTemp26) *
                    $fVec1[
                      ($IOTA0 - Math.min(4097, Math.max(0, iTemp25 + 1))) & 8191
                    ]) +
              0.9238795 *
                ($fVec1[
                  ($IOTA0 - Math.min(4097, Math.max(0, iTemp30))) & 8191
                ] *
                  (fTemp31 + (1.0 - fTemp29)) +
                  (fTemp29 - fTemp31) *
                    $fVec1[
                      ($IOTA0 - Math.min(4097, Math.max(0, iTemp30 + 1))) & 8191
                    ]) +
              0.38268343 *
                ($fVec1[
                  ($IOTA0 - Math.min(4097, Math.max(0, iTemp35))) & 8191
                ] *
                  (fTemp36 + (1.0 - fTemp34)) +
                  (fTemp34 - fTemp36) *
                    $fVec1[
                      ($IOTA0 - Math.min(4097, Math.max(0, iTemp35 + 1))) & 8191
                    ]));

      $iVec0[1] = $iVec0[0];
      $fRec0[1] = $fRec0[0];
      $IOTA0 = ($IOTA0 + 1) & 8191;
      $fRec1[1] = $fRec1[0];
      $fRec2[1] = $fRec2[0];
      $fRec5[1] = $fRec5[0];
      $fRec4[1] = $fRec4[0];
      $fRec7[1] = $fRec7[0];
      $fRec8[1] = $fRec8[0];
      $fRec9[1] = $fRec9[0];
      $fRec10[1] = $fRec10[0];
      $fRec11[1] = $fRec11[0];
      $fRec12[1] = $fRec12[0];
    }
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
