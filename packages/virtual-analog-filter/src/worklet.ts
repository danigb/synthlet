import { Diode } from "./diode";
import { Korg35 } from "./korg35";
import { Moog } from "./moog";
import { MoogHalf } from "./moog-half";
import { Oberheim } from "./oberheim";
import { createOversampler, Oversampler } from "./oversample";
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

// Seven of the nine models saturate, and a saturating nonlinearity folds its
// own harmonics back down as inharmonic aliasing. Measured `aliasSnr` at 48 kHz
// with a 3.7 kHz probe, an 8 kHz cutoff, `drive: 100` and `resonance: 0.9`:
// OBERHEIM_LPF -9.3 dB, DIODE_LADDER 12.5 dB. Two times oversampling takes
// those to 23.6 and 23.4 dB, and four times to 34.0 and 29.6.
//
// Two rather than four because of what the second doubling costs rather than
// what it buys: MOOG_LADDER measures 0.78% of realtime for one voice at 1x,
// 1.96% at 2x and 3.91% at 4x, and the ladder is expensive because its
// delay-free loop is solved per sample. Four times would buy another 10-13 dB
// for another 2% - which is the trade antiderivative antialiasing exists to
// avoid, and is the follow-up rather than this ticket.
export const OVERSAMPLE = 2;

// Taps either side of the centre in each polyphase branch. Eight holds the
// round trip within 0.1 dB to 15 kHz at 48 kHz; four costs 20 dB of that.
const TAPS_PER_PHASE = 8;

/**
 * Round-trip latency in samples, at the *base* rate. Two symmetric FIRs, one
 * up and one down, each delaying by half its length.
 *
 * **This module used to have none.** 16 samples is 0.33 ms at 48 kHz, and it
 * applies to every model - including the two Korg 35 filters, which do not
 * resample and are delayed to match, because a `type` change that also shifted
 * the output by 16 samples would be a click. Anything doing parallel
 * processing around this node has to compensate.
 */
export const LATENCY_SAMPLES = 2 * TAPS_PER_PHASE;

// Which models run at the oversampled rate. Only the Korg 35 pair is linear -
// `korg35.ts` has no clipper and no `tanh` by the library's design - and there
// is nothing for a resampler to band-limit there.
const OVERSAMPLED = [true, true, false, false, true, true, true, true, true];

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
  o: Channel[]; // and one resampler, its buffers, and the bypass delay

  constructor() {
    super();
    this.r = true;
    this.p = [];
    this.s = [];
    this.o = [];
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
      const oversampled = OVERSAMPLED[type] ?? OVERSAMPLED[0];

      // The resampler and its scratch, per channel for the same reason the
      // bank is per channel: both directions carry history.
      const channel = (this.o[c] ??= createChannel(length));

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
        const src = begin(channel, oversampled, input[c], length);
        const dst = oversampled ? channel.down : output[c];
        const step = oversampled ? OVERSAMPLE : 1;
        filter.process(src, dst, 0, length * step);
        finish(channel, filter, oversampled, dst, output[c], length, last);
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
      //
      // Oversampling brackets the *block*, not the run: the whole input is
      // upsampled once, the runs are rendered in the oversampled domain as
      // `[from * OVERSAMPLE, to * OVERSAMPLE)`, and the whole output is
      // downsampled once. Coefficient updates therefore still happen at the
      // base rate, which is what keeps this a filter with a moving cutoff
      // rather than a filter at a different sample rate.
      const src = begin(channel, oversampled, input[c], length);
      const dst = oversampled ? channel.down : output[c];
      const step = oversampled ? OVERSAMPLE : 1;

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
          filter.process(src, dst, start * step, i * step);
          start = i;
          $frequency = f;
          $resonance = r;
          $drive = d;
        } else {
          filter.update($frequency, $resonance, $drive);
          filter.process(src, dst, start * step, i * step);
        }
      }

      last.type = type;
      last.frequency = $frequency;
      last.resonance = $resonance;
      last.drive = $drive;

      finish(channel, filter, oversampled, dst, output[c], length, last);
    }

    return this.r;
  }

  static get parameterDescriptors() {
    return PARAMS;
  }
}

registerProcessor("VAFProcessor", VAF);

/**
 * Downsample, or delay to match, and check what came out of the filter first.
 *
 * One non-finite sample and this model is dead for the life of the node: every
 * `fRec*` update is `state + k * something`, `NaN + anything` is `NaN`, and the
 * two saturating models do not help - `Math.max(-1, Math.min(1, NaN))` is `NaN`
 * as well. Web Audio has no recovery path either; the graph emits `NaN` or
 * silence until somebody rebuilds it. The result of this is a click, which is
 * the honest answer to a signal that was already broken.
 *
 * Checked on the filter's *own* output rather than on the block that leaves
 * this node, and before the resampling rather than after it. Both matter. The
 * input is not the only route in - before the cutoff was bounded, the diode
 * ladder produced `Infinity` from two in-range parameters - and checking after
 * the downsampler would let the `NaN` into its history, and after the bypass
 * delay would hide it for a whole block and cost a block of recovery.
 *
 * Once per block per channel, and deliberately not at the end of `process()`
 * where the sibling `state-variable-filter` puts its check: that function takes
 * `from`/`to` bounds and the segment renderer calls it up to 128 times a block.
 *
 * Only the active filter is reset. Each channel keeps all nine models so that
 * switching `type` mid-note resumes where that model left off, and only the one
 * that rendered can have been poisoned.
 */
function finish(
  channel: Channel,
  filter: Filter,
  oversampled: boolean,
  rendered: Float32Array,
  output: Float32Array,
  length: number,
  last: Coefficients,
) {
  const step = oversampled ? OVERSAMPLE : 1;
  for (let i = 0; i < length * step; i++) {
    if (Number.isFinite(rendered[i])) continue;

    filter.reset();
    // The resampler carries history in both directions, and the bypass delay
    // holds a block of output; neither may keep a `NaN`.
    channel.os.reset();
    channel.delay.fill(0);
    channel.write = 0;
    output.fill(0);
    // `reset()` clears the sliders too, so the filter has no coefficients.
    // Without this the next block sees "unchanged", skips `update()`, and
    // renders at a cutoff of zero.
    last.type = NaN;
    last.frequency = NaN;
    last.resonance = NaN;
    last.drive = NaN;
    return;
  }

  if (oversampled) {
    channel.os.down(channel.down, 0, length, output);
    return;
  }

  // The Korg 35 pair renders at the base rate, so without this a `type` change
  // would move the output by 16 samples - a click, and a phase jump for
  // anything summing this node with a dry path.
  const { delay } = channel;
  for (let i = 0; i < length; i++) {
    const held = delay[channel.write];
    delay[channel.write] = output[i];
    channel.write = (channel.write + 1) % LATENCY_SAMPLES;
    output[i] = held;
  }
}

/**
 * The per-channel resampling state: the two FIR histories, the scratch the
 * oversampled domain is rendered in, and the delay that keeps the two
 * un-oversampled models in time with the other seven.
 */
type Channel = {
  os: Oversampler;
  up: Float32Array;
  down: Float32Array;
  delay: Float64Array;
  write: number;
};

function createChannel(length: number): Channel {
  return {
    os: createOversampler(OVERSAMPLE, TAPS_PER_PHASE),
    up: new Float32Array(length * OVERSAMPLE),
    down: new Float32Array(length * OVERSAMPLE),
    delay: new Float64Array(LATENCY_SAMPLES),
    write: 0,
  };
}

/** The buffer the filter reads, and the upsampling that fills it. */
function begin(
  channel: Channel,
  oversampled: boolean,
  input: Float32Array,
  length: number,
) {
  if (!oversampled) return input;
  channel.os.up(input, 0, length, channel.up);
  return channel.up;
}

// One instance of every filter type, built on the first block that has this
// many channels. Keeping all of them means switching `type` mid-note picks up
// that filter's own state, the way it did when there was a single bank.
function createFilters(sampleRate: number): Filter[] {
  // The seven that saturate are built at the oversampled rate and the two
  // linear ones are not, which is how the Korg 35 pair avoids paying for a
  // resampler it has nothing to give to. `OVERSAMPLED` above is the same list
  // read from the render path.
  const over = sampleRate * OVERSAMPLE;
  return [
    Moog(over),
    MoogHalf(over),
    Korg35(sampleRate, 0),
    Korg35(sampleRate, 1),
    Diode(over),
    Oberheim(over, 0),
    Oberheim(over, 1),
    Oberheim(over, 2),
    Oberheim(over, 3),
  ];
}
