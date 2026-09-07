import { Diode } from "./diode";
import { Korg35 } from "./korg35";
import { Moog } from "./moog";
import { MoogHalf } from "./moog-half";
import { Oberheim } from "./oberheim";
import { PARAMS } from "./params";

type Filter = {
  update: (frequency: number, resonance: number) => void;
  process: (
    input: Float32Array,
    output: Float32Array,
    from: number,
    to: number,
  ) => void;
};

/** What one channel's filter was last told, so it is not told twice. */
type Coefficients = { type: number; frequency: number; resonance: number };

export class VAF extends AudioWorkletProcessor {
  r: boolean; // running
  p: Filter[][]; // one bank of filters per channel
  s: Coefficients[]; // and one change-detection slot per channel

  constructor() {
    super();
    this.r = true;
    this.p = [];
    this.s = [];
    this.port.onmessage = (event) => {
      switch (event.data.type) {
        case "DISPOSE":
          this.r = false;
          break;
      }
    };
  }

  process(inputs: Float32Array[][], outputs: Float32Array[][], params: any) {
    const input = inputs[0];
    const output = outputs[0];
    if (input.length === 0) return this.r;

    // `[0]`, not the array. `Math.floor` coerces its argument, a
    // `Float32Array` stringifies through `join`, and a length-1 array
    // stringifies to its single value - so `Math.floor(params.type)` was
    // *correct by accident* for as long as `type` stayed k-rate. A length-3
    // array stringifies to "3,3,3", `Number("3,3,3")` is `NaN`, and
    // `bank[NaN] || bank[0]` below silently selects the Moog ladder for every
    // type, with no error and audio that still sounds like a filter.
    const type = Math.floor(params.type[0]);

    // The house a-rate check, once per block and once per parameter.
    const { frequency, detune, resonance } = params;
    const fR = frequency.length > 1;
    const dR = detune.length > 1;
    const rR = resonance.length > 1;
    const automated = fR || dR || rR;

    // `detune` is semitones, so folding it into the cutoff is a `Math.pow`.
    // Cached on the detune value, which is static in every realistic patch:
    // even at a-rate this is then one call per block rather than 128.
    let $detune = detune[0];
    let multiplier = $detune ? Math.pow(2, $detune / 12) : 1;

    const length = output[0]?.length ?? 0;

    for (let c = 0; c < input.length && c < output.length; c++) {
      // A ladder filter is all state, so every channel filters through its
      // own bank: one shared instance would smear the channels together.
      const bank = (this.p[c] ??= createFilters(sampleRate));
      const filter = bank[type] || bank[0];

      // And its own change-detection slot, for the same reason. One shared
      // pair of locals would report "unchanged" for every channel after the
      // first and leave their coefficients stale.
      const last = (this.s[c] ??= {
        type: NaN,
        frequency: NaN,
        resonance: NaN,
      });

      if (!automated) {
        // The fast path, and the common one. Every model computes its
        // coefficients at the top of `process()` - one `Math.tan`, and in
        // `korg35` a `Math.pow` as well - so an unautomated filter costs
        // exactly what it always did. Change detection then skips even that
        // when nothing has moved, which the benchmark measured at 24% of this
        // shape of work.
        const f = frequency[0] * multiplier;
        const r = resonance[0];
        if (
          f !== last.frequency ||
          r !== last.resonance ||
          type !== last.type
        ) {
          last.type = type;
          last.frequency = f;
          last.resonance = r;
          filter.update(f, r);
        }
        filter.process(input[c], output[c], 0, length);
        continue;
      }

      // Automated: render the block in runs of constant coefficients. A
      // genuine per-sample sweep makes that one run per sample - the
      // per-sample coefficient recompute the ticket asks for - and a modulator
      // that happens to hold still costs one run and nothing extra.
      //
      // Runs, and not a bare `if (f !== $f) filter.update(f, r)`, because
      // `update()` only *stores*: the tangent and the ladder constants are
      // computed inside `process()`. Updating per sample without splitting the
      // render would apply the last sample's coefficients to the whole block,
      // which is worse than today and just as quiet about it.
      let start = 0;
      let $frequency = frequency[0] * multiplier;
      let $resonance = resonance[0];

      for (let i = 1; i <= length; i++) {
        if (i < length) {
          if (dR && detune[i] !== $detune) {
            $detune = detune[i];
            multiplier = $detune ? Math.pow(2, $detune / 12) : 1;
          }
          const f = (fR ? frequency[i] : frequency[0]) * multiplier;
          const r = rR ? resonance[i] : resonance[0];
          if (f === $frequency && r === $resonance) continue;

          filter.update($frequency, $resonance);
          filter.process(input[c], output[c], start, i);
          start = i;
          $frequency = f;
          $resonance = r;
        } else {
          filter.update($frequency, $resonance);
          filter.process(input[c], output[c], start, i);
        }
      }

      last.type = type;
      last.frequency = $frequency;
      last.resonance = $resonance;
    }

    return this.r;
  }

  static get parameterDescriptors() {
    return PARAMS;
  }
}

registerProcessor("VAFProcessor", VAF);

// One instance of every filter type, built on the first block that has this
// many channels. Keeping all of them means switching `type` mid-note picks up
// that filter's own state, the way it did when there was a single bank.
function createFilters(sampleRate: number): Filter[] {
  return [
    Moog(sampleRate),
    MoogHalf(sampleRate),
    Korg35(sampleRate, 0),
    Korg35(sampleRate, 1),
    Diode(sampleRate),
    Oberheim(sampleRate, 0),
    Oberheim(sampleRate, 1),
    Oberheim(sampleRate, 2),
    Oberheim(sampleRate, 3),
  ];
}
