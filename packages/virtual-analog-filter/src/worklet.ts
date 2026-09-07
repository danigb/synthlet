import { Diode } from "./diode";
import { Korg35 } from "./korg35";
import { Moog } from "./moog";
import { MoogHalf } from "./moog-half";
import { Oberheim } from "./oberheim";
import { PARAMS } from "./params";

type Filter = {
  update: (frequency: number, resonance: number, drive: number) => void;
  reset: () => void;
  process: (
    input: Float32Array,
    output: Float32Array,
    from: number,
    to: number,
  ) => void;
};

/** What one channel's filter was last told, so it is not told twice. */
type Coefficients = {
  type: number;
  frequency: number;
  resonance: number;
  drive: number;
};

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
    const { frequency, detune, resonance, drive } = params;
    const fR = frequency.length > 1;
    const dR = detune.length > 1;
    const rR = resonance.length > 1;
    const gR = drive.length > 1;
    const automated = fR || dR || rR || gR;

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
        drive: NaN,
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
        const d = drive[0];
        if (
          f !== last.frequency ||
          r !== last.resonance ||
          d !== last.drive ||
          type !== last.type
        ) {
          last.type = type;
          last.frequency = f;
          last.resonance = r;
          last.drive = d;
          filter.update(f, r, d);
        }
        filter.process(input[c], output[c], 0, length);
        guard(filter, output[c], last);
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
      let $drive = drive[0];

      for (let i = 1; i <= length; i++) {
        if (i < length) {
          if (dR && detune[i] !== $detune) {
            $detune = detune[i];
            multiplier = $detune ? Math.pow(2, $detune / 12) : 1;
          }
          const f = (fR ? frequency[i] : frequency[0]) * multiplier;
          const r = rR ? resonance[i] : resonance[0];
          const d = gR ? drive[i] : drive[0];
          if (f === $frequency && r === $resonance && d === $drive) continue;

          filter.update($frequency, $resonance, $drive);
          filter.process(input[c], output[c], start, i);
          start = i;
          $frequency = f;
          $resonance = r;
          $drive = d;
        } else {
          filter.update($frequency, $resonance, $drive);
          filter.process(input[c], output[c], start, i);
        }
      }

      last.type = type;
      last.frequency = $frequency;
      last.resonance = $resonance;
      last.drive = $drive;

      guard(filter, output[c], last);
    }

    return this.r;
  }

  static get parameterDescriptors() {
    return PARAMS;
  }
}

registerProcessor("VAFProcessor", VAF);

// One non-finite sample and this model is dead for the life of the node: every
// `fRec*` update is `state + k * something`, `NaN + anything` is `NaN`, and the
// two saturating models do not help - `Math.max(-1, Math.min(1, NaN))` is `NaN`
// as well. Web Audio has no recovery path either; the graph emits `NaN` or
// silence until somebody rebuilds it. The result of this is a click, which is
// the honest answer to a signal that was already broken.
//
// Scanned on the *output*, not the input: the input is not the only route in,
// and before the cutoff was bounded the diode ladder produced `Infinity` from
// two in-range parameters. Once per block per channel, and deliberately not at
// the end of `process()` where the sibling `state-variable-filter` puts its
// check - that function takes `from`/`to` bounds and the segment renderer calls
// it up to 128 times a block, so a check there would be a per-sample check
// wearing a per-block disguise.
//
// Only the active filter is reset. Each channel keeps all nine models so that
// switching `type` mid-note resumes where that model left off, and only the one
// that rendered can have been poisoned.
function guard(filter: Filter, block: Float32Array, last: Coefficients) {
  for (let i = 0; i < block.length; i++) {
    if (Number.isFinite(block[i])) continue;

    filter.reset();
    block.fill(0);
    // `reset()` clears the sliders too, so the filter has no coefficients.
    // Without this the next block sees "unchanged", skips `update()`, and
    // renders at a cutoff of zero.
    last.type = NaN;
    last.frequency = NaN;
    last.resonance = NaN;
    last.drive = NaN;
    return;
  }
}

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
