// Generated from the Faust function `ve.oberheim` (vaeffects.lib).
// Author: Eric Tarr. Licence: LicenseRef-STK-4.3.
// See THIRD-PARTY-LICENSES.md at the repository root.
import { createPrewarp } from "./prewarp";

export function Oberheim(sampleRate: number, type: number) {
  let fHslider0 = 0;
  let fHslider1 = 0;
  let fRec4 = [0, 0];
  let fRec5 = [0, 0];

  const prewarp = createPrewarp(sampleRate);

  // The four taps of `ve.oberheim` are four combinations of the same
  // per-sample temporaries - the Rust codegen emits them as four output
  // buffers (`dsp/oberheim.rs:36-39`) and this module exposes one:
  //
  //   0 low-pass   fRec0 = fRec4[1] + fTemp4
  //   1 high-pass  fRec1 = fTemp5
  //   2 band-pass  fRec2 = fTemp3
  //   3 band-stop  fRec3 = fRec0 + fRec1
  //
  // `type` is fixed for the life of the instance - `createFilters()` builds
  // one `Oberheim` per tap - so the mix is resolved here rather than by a
  // four-way ternary 48000 times a second.
  const kState = type === 0 || type === 3 ? 1 : 0;
  const kHigh = type === 1 || type === 3 ? 1 : 0;
  const kBand = type === 2 ? 1 : 0;

  return { update, process };

  function update(cutoff: number, resonance: number) {
    fHslider0 = cutoff;
    fHslider1 = resonance;
  }

  function process(
    input: Float32Array,
    output: Float32Array,
    from: number,
    to: number,
  ) {
    let fSlow0 = prewarp(fHslider0);
    let fSlow1 = 1.0 / (29.293 * fHslider1 + 0.707) + fSlow0;
    let fSlow2 = fSlow0 * fSlow1 + 1.0;
    let fSlow3 = fSlow0 / fSlow2;
    let fSlow4 = 1.0 / fSlow2;
    let fSlow5 = 2.0 * fSlow0;

    for (let i = from; i < to; i++) {
      let fTemp0 = input[i] - (fRec4[1] + fSlow1 * fRec5[1]);
      let fTemp1 = fSlow3 * fTemp0;
      let fTemp2 = Math.max(-1.0, Math.min(1.0, fRec5[1] + fTemp1));
      let fTemp3 = fTemp2 * (1.0 - 0.33333334 * (fTemp2 * fTemp2));
      let fTemp4 = fSlow0 * fTemp3;
      let fTemp5 = fSlow4 * fTemp0;
      fRec4[0] = fRec4[1] + fSlow5 * fTemp3;
      fRec5[0] = fTemp1 + fTemp3;
      output[i] =
        kState * (fRec4[1] + fTemp4) + kHigh * fTemp5 + kBand * fTemp3;
      fRec4[1] = fRec4[0];
      fRec5[1] = fRec5[0];
    }
  }
}
