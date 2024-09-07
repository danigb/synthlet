export type UpdateFn = ReturnType<typeof createDsp>["update"];
export type ComputeFn = ReturnType<typeof createDsp>["compute"];

// This is a dsp code generated from Faust to test if the Faust -> Rust -> Typescript conversion works
export function createDsp(sampleRate: number) {
  let fConst0 = 44.1 / sampleRate;
  let fConst1 = 1 - fConst0;
  let fVslider0 = -6.0;
  let fVslider1 = 0.0;
  let fVslider2 = 0.7;
  let fVslider3 = 0.625;
  let fVslider4 = 0.625;
  let fVslider5 = 0.7;
  let fVslider6 = 0.625;
  let fVslider7 = 0.625;
  let fVslider8 = 0.625;
  let IOTA0 = 0;
  let fRec0 = [0.0, 0.0];
  let fRec1 = [0.0, 0.0];
  let fRec13 = [0.0, 0.0];
  let fRec12 = [0.0, 0.0, 0.0];
  let fRec14 = [0.0, 0.0];
  let fVec0 = new Array(256).fill(0.0);
  let fRec10 = [0.0, 0.0];
  let fVec1 = new Array(128).fill(0.0);
  let fRec8 = [0.0, 0.0];
  let fRec15 = [0.0, 0.0];
  let fVec2 = new Array(512).fill(0.0);
  let fRec6 = [0.0, 0.0];
  let fVec3 = new Array(512).fill(0.0);
  let fRec4 = [0.0, 0.0];
  let fRec16 = [0.0, 0.0];
  let fRec20 = [0.0, 0.0];
  let fRec23 = [0.0, 0.0];
  let fVec4 = new Array(1024).fill(0.0);
  let fRec21 = [0.0, 0.0];
  let fVec5 = new Array(8192).fill(0.0);
  let fRec19 = [0.0, 0.0];
  let fRec24 = [0.0, 0.0];
  let fVec6 = new Array(4096).fill(0.0);
  let fRec17 = [0.0, 0.0];
  let fVec7 = new Array(4096).fill(0.0);
  let fRec2 = [0.0, 0.0];
  let fVec8 = new Array(1024).fill(0.0);
  let fRec28 = [0.0, 0.0];
  let fVec9 = new Array(8192).fill(0.0);
  let fRec27 = [0.0, 0.0];
  let fVec10 = new Array(2048).fill(0.0);
  let fRec25 = [0.0, 0.0];
  let fVec11 = new Array(2048).fill(0.0);
  let fRec3 = [0.0, 0.0];

  function update(
    lpFilter: number,
    diffussion1: number,
    diffussion2: number,
    feedback1: number,
    feedback2: number,
    decayRate: number,
    damping: number,
    dryWet: number,
    volume: number
  ) {
    fVslider0 = lpFilter;
    fVslider1 = diffussion1;
    fVslider2 = diffussion2;
    fVslider3 = feedback1;
    fVslider4 = feedback2;
    fVslider5 = decayRate;
    fVslider6 = damping;
    fVslider7 = dryWet;
    fVslider8 = volume;
  }

  function compute(
    inputs: Float32Array[],
    outputs: Float32Array[],
    count: number
  ) {
    let inputs0 = inputs[0];
    let inputs1 = inputs.length === 1 ? inputs[0] : inputs[1];
    let outputs0 = outputs[0];
    let outputs1 = outputs[1];

    let fSlow0 = fConst0 * Math.pow(10, 0.05 * fVslider0);
    let fSlow1 = fConst0 * fVslider1;
    let fSlow2 = fConst0 * fVslider2;
    let fSlow3 = fConst0 * fVslider3;
    let fSlow4 = fConst0 * fVslider4;
    let fSlow5 = fConst0 * fVslider5;
    let fSlow6 = fConst0 * fVslider6;
    let fSlow7 = fConst0 * fVslider7;
    let fSlow8 = fConst0 * fVslider8;

    for (let i = 0; i < count; i++) {
      let input0 = inputs0[i];
      let input1 = inputs1[i];

      fRec0[0] = fSlow0 + fConst1 * fRec0[1];
      let fTemp0 = input0;
      fRec1[0] = fSlow1 + fConst1 * fRec1[1];
      let fTemp1 = fRec1[0] + 1.0;
      let fTemp2 = 1.0 - 0.5 * fTemp1;
      fRec13[0] = fSlow2 + fConst1 * fRec13[1];
      let fTemp3 = input1;
      fRec12[0] =
        (1.0 - fRec13[0]) * fRec12[2] + 0.5 * (fTemp0 + fTemp3) * fRec13[0];
      fRec14[0] = fSlow3 + fConst1 * fRec14[1];
      let fTemp4 = fRec12[0] - fRec14[0] * fRec10[1];
      fVec0[IOTA0 & 255] = fTemp4;
      fRec10[0] = fVec0[(IOTA0 - 142) & 255];
      let fRec11 = fRec14[0] * fTemp4;
      let fTemp5 = fRec11 + fRec10[1] - fRec14[0] * fRec8[1];
      fVec1[IOTA0 & 127] = fTemp5;
      fRec8[0] = fVec1[(IOTA0 - 107) & 127];
      let fRec9 = fRec14[0] * fTemp5;
      fRec15[0] = fSlow4 + fConst1 * fRec15[1];
      let fTemp6 = fRec9 + fRec8[1] - fRec15[0] * fRec6[1];
      fVec2[IOTA0 & 511] = fTemp6;
      fRec6[0] = fVec2[(IOTA0 - 379) & 511];
      let fRec7 = fRec15[0] * fTemp6;
      let fTemp7 = fRec7 + fRec6[1] - fRec15[0] * fRec4[1];
      fVec3[IOTA0 & 511] = fTemp7;
      fRec4[0] = fVec3[(IOTA0 - 277) & 511];
      let fRec5 = fRec15[0] * fTemp7;

      fRec16[0] = fSlow5 + fConst1 * fRec16[1];
      fRec20[0] = fSlow6 + fConst1 * fRec20[1];
      let fTemp8 = 1.0 - fRec20[0];
      fRec23[0] = fSlow7 + fConst1 * fRec23[1];
      let fTemp9 = fRec23[0] * fRec21[1] + fRec3[1];
      fVec4[IOTA0 & 1023] = fTemp9;
      fRec21[0] = fVec4[(IOTA0 - 908) & 1023];
      let fRec22 = -(fRec23[0] * fTemp9);
      fVec5[IOTA0 & 8191] = fRec22 + fRec21[1];
      fRec19[0] = fRec20[0] * fRec19[1] + fTemp8 * fVec5[(IOTA0 - 4217) & 8191];
      fRec24[0] = fSlow8 + fConst1 * fRec24[1];
      let fTemp10 = fRec19[0] * fRec16[0] - fRec24[0] * fRec17[1];
      fVec6[IOTA0 & 4095] = fTemp10;
      fRec17[0] = fVec6[(IOTA0 - 2656) & 4095];
      let fRec18 = fRec24[0] * fTemp10;
      fVec7[IOTA0 & 4095] = fRec18 + fRec17[1];
      fRec2[0] = fRec5 + fRec16[0] * fVec7[(IOTA0 - 2656) & 4095] + fRec4[1];
      let fTemp11 = fRec23[0] * fRec28[1] + fRec2[1];
      fVec8[IOTA0 & 1023] = fTemp11;
      fRec28[0] = fVec8[(IOTA0 - 672) & 1023];
      let fRec29 = -(fRec23[0] * fTemp11);
      fVec9[IOTA0 & 8191] = fRec29 + fRec28[1];
      fRec27[0] = fRec20[0] * fRec27[1] + fTemp8 * fVec9[(IOTA0 - 4453) & 8191];
      let fTemp12 = fRec16[0] * fRec27[0] - fRec24[0] * fRec25[1];
      fVec10[IOTA0 & 2047] = fTemp12;
      fRec25[0] = fVec10[(IOTA0 - 1800) & 2047];
      let fRec26 = fRec24[0] * fTemp12;
      fVec11[IOTA0 & 2047] = fRec26 + fRec25[1];
      fRec3[0] = fRec5 + fRec4[1] + fRec16[0] * fVec11[(IOTA0 - 1800) & 2047];

      outputs0[i] = fRec0[0] * (fTemp0 * fTemp2 + 0.5 * fTemp1 * fRec2[0]);
      outputs1[i] = fRec0[0] * (fTemp3 * fTemp2 + 0.5 * fTemp1 * fRec3[0]);

      // Update history
      fRec0[1] = fRec0[0];
      fRec1[1] = fRec1[0];
      fRec13[1] = fRec13[0];
      fRec12[2] = fRec12[1];
      fRec12[1] = fRec12[0];
      fRec14[1] = fRec14[0];
      IOTA0++;
      fRec10[1] = fRec10[0];
      fRec8[1] = fRec8[0];
      fRec15[1] = fRec15[0];
      fRec6[1] = fRec6[0];
      fRec4[1] = fRec4[0];
      fRec16[1] = fRec16[0];
      fRec20[1] = fRec20[0];
      fRec23[1] = fRec23[0];
      fRec21[1] = fRec21[0];
      fRec19[1] = fRec19[0];
      fRec24[1] = fRec24[0];
      fRec17[1] = fRec17[0];
      fRec2[1] = fRec2[0];
      fRec28[1] = fRec28[0];
      fRec27[1] = fRec27[0];
      fRec25[1] = fRec25[0];
      fRec3[1] = fRec3[0];
    }
  }

  return { update, compute };
}
