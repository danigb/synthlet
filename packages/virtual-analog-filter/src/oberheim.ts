// Generated from the Faust function `ve.oberheim` (vaeffects.lib).
// Author: Eric Tarr. Licence: LicenseRef-STK-4.3.
// See THIRD-PARTY-LICENSES.md at the repository root.
import { createPrewarp } from "./prewarp";

export function Oberheim(sampleRate: number, type: number) {
  let fHslider0 = 0;
  let fHslider1 = 0;
  let fDrive = 1;
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

  return { update, process, reset };

  function update(cutoff: number, resonance: number, drive: number) {
    fHslider0 = cutoff;
    fHslider1 = resonance;
    fDrive = drive;
  }

  /**
   * Back to a newly constructed filter. `NaN` reaches every one of these
   * recurrences through `state = state + k * something` and never leaves - and
   * the saturating models do not help, because `Math.max(-1, Math.min(1, NaN))`
   * is `NaN` too. Writing zeroes over them is the only way out. `worklet.ts`
   * is what calls this, once a block and only when the output says so.
   *
   * The sliders go too, so a reset filter is indistinguishable from a new one.
   * That is why the caller has to invalidate its change-detection slot.
   */
  function reset() {
    fHslider0 = 0;
    fHslider1 = 0;
    fDrive = 1;
    fRec4 = [0, 0];
    fRec5 = [0, 0];
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
    // The band-pass tap's peak gain *is* Q: measured 0.707 at resonance 0 and
    // 28.6 at 1, so opening the resonance was a 32 dB volume increase there.
    // The other three taps measure flat to 3e-4 across the whole range and
    // need nothing - which is a measurement, not a citation: `ve.oberheim`
    // derives from Pirkle section 7.2, which is not on disk here. Normalising
    // the band-pass to unity is the decision `state-variable-filter` made for
    // the same reason.
    let fMakeup = kBand ? 1.0 / (29.293 * fHslider1 + 0.707) : 1.0;

    for (let i = from; i < to; i++) {
      let fTemp0 = fDrive * input[i] - (fRec4[1] + fSlow1 * fRec5[1]);
      let fTemp1 = fSlow3 * fTemp0;
      let fTemp2 = Math.max(-1.0, Math.min(1.0, fRec5[1] + fTemp1));
      let fTemp3 = fTemp2 * (1.0 - 0.33333334 * (fTemp2 * fTemp2));
      let fTemp4 = fSlow0 * fTemp3;
      let fTemp5 = fSlow4 * fTemp0;
      fRec4[0] = fRec4[1] + fSlow5 * fTemp3;
      fRec5[0] = fTemp1 + fTemp3;
      output[i] =
        fMakeup *
        (kState * (fRec4[1] + fTemp4) + kHigh * fTemp5 + kBand * fTemp3);
      fRec4[1] = fRec4[0];
      fRec5[1] = fRec5[0];
    }
  }
}
