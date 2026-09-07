import { createGateDetector, gatePulse } from "./_gate";

/** One render quantum. The spec's block size, and the unit a consumer that
 * reads its trigger once per block can actually resolve. */
const RENDER_QUANTUM = 128;

/**
 * The clock engine: one phase accumulator and one beat counter, rendered a
 * sample at a time.
 *
 * All four outputs are read from the same phase at the same sample, so they
 * cannot describe different instants.
 *
 * Output 0 is the beat phase - a rising `[0, 1)` sawtooth, restarting each
 * beat - because subdividing a clock means multiplying its phase, which a
 * square gate cannot support. Output 1 is the beat gate, which is what an
 * envelope wants: a phase is not a gate, and no threshold makes it one (any
 * threshold fires early; `> 0` latches on).
 *
 * Outputs 2 and 3 are the same pair one level up: a bar phase and a downbeat
 * gate. They are both here for the same reason, and a bar needs both for
 * identical reasons - a bar phase is what a consumer subdivides or reads a
 * position from, a downbeat gate is what a trigger wants.
 *
 * A bar cannot be recovered downstream. `Euclid` multiplies the beat phase to
 * subdivide it, which is a pure function of the instantaneous value; division
 * is not the mirror image, because the bar position is a *count* and the ramp
 * during beat 1 is bit-identical to the ramp during beat 3. A consumer that
 * wanted bars would have to count wraps, which means holding state and
 * choosing an origin - and choosing that origin privately is the defect. Two
 * counters built at different times disagree about where bar 1 is, silently
 * and forever, while each is individually correct. `Clock` owns the phase
 * origin, so it owns the bar.
 *
 * The wrap is `>= 1`, so nothing ever emits exactly 1.0. That is what
 * `gatePulse` and `Euclid`'s `currentClock < prevClock` both already assume,
 * and the old `> 1` is where the one-block plateau at 1.0 came from.
 *
 * A stopped clock (`bpm: 0`) emits no gate rather than holding it open at
 * phase 0 forever.
 *
 * Takes `sampleRate` as an argument rather than reading the worklet global, so
 * the module can be rendered in node at any rate. `worklet.ts` is the only
 * caller that passes the real one.
 */
export function createClock(sampleRate: number) {
  let bpm = 120;
  let increment = bpm / 60 / sampleRate;
  let phase = 0;
  const detectReset = createGateDetector();

  // Beats since the clock started, unbounded - not a counter that wraps at
  // `beatsPerBar`. The bar position is `beats % beatsPerBar`, so changing the
  // parameter re-phases the grid rather than emitting a spurious downbeat or
  // swallowing one.
  //
  // `barPos` and `barLength` are latched at the beat boundary rather than read
  // per sample. Reading `beatsPerBar` live for the divisor would jump the bar
  // phase mid-beat - downward, if the bar got longer - which a downstream
  // `Euclid` reads as a wrap and answers with a spurious step. Latching both
  // is what makes a mid-run change re-phase from the *next* beat onward.
  let beats = 0;
  let barPos = 0;
  let barLength = -1;

  /**
   * Renders one block.
   *
   * Takes the processor's `outputs` array rather than four positional buffers:
   * four outputs and four parameters is too many arguments to keep straight,
   * and `lfo`'s `dsp.ts` already takes the processor's `parameters` for the
   * same reason. It is a plain nested array, not anything from the worklet
   * global scope - `dsp.test.ts` builds one by hand.
   *
   * Outputs 1 to 3 may be absent; output 0 is not optional.
   */
  return function generate(
    outputs: Float32Array[][],
    nextBpm: number,
    pulseWidth: number,
    beatsPerBar: number,
    reset: Float32Array,
  ) {
    const phaseOut = outputs[0][0];
    const gateOut = outputs[1]?.[0];
    const barOut = outputs[2]?.[0];
    const downbeatOut = outputs[3]?.[0];

    if (nextBpm !== bpm) {
      bpm = nextBpm;
      increment = bpm / 60 / sampleRate;
    }

    // A gate that never falls can never trigger anything again - the library's
    // one gate contract, in `_gate.ts`, is that a trigger is the transition to
    // positive. `pulseWidth` declares a maximum of 1, and against a `[0, 1)`
    // phase a width of 1 is exactly a gate that never falls: one envelope
    // attack, then silence forever.
    //
    // So cap the width to leave one render quantum of every beat low. That is
    // what a consumer reading its trigger once per block needs in order to see
    // the falling edge and re-arm, and it is the same argument `_gate.ts`
    // already makes about the gate itself being at least a quantum wide.
    //
    // `+ 1` because the threshold is compared at discrete samples: asking for
    // exactly 128 rounds down to 127 often enough to be worth the one sample.
    //
    // Tempo-aware, because a static cap cannot be: this is 0.9941 at 120 BPM
    // and 0.9512 at 1000 BPM. Inert below 0.95 at every tempo in range, so it
    // is a guard rail rather than a behaviour change. Lowering `maxValue` to
    // 0.99 instead would move the cliff rather than remove it - 0.99 still
    // latches at 1000 BPM, where it leaves 600 us low.
    //
    // If a beat is shorter than a quantum there is no width that helps, and
    // the clamp stands aside rather than silencing the gate outright.
    const maxWidth = 1 - (RENDER_QUANTUM + 1) * increment;
    const width = maxWidth > 0 && pulseWidth > maxWidth ? maxWidth : pulseWidth;

    // Hoisted: all three are fixed for the block, and the same hoist was worth
    // 34% in `benchmarks/lfo-rate`. `p` in particular is a closure read that
    // would otherwise happen twice per sample.
    const step = increment;
    const running = step > 0;
    const length = phaseOut.length;
    // The house a-rate read, hoisted: an a-rate parameter arrives as either one
    // value or one per sample, and an unconnected one - the default here - is
    // the length-1 case. `> 1` rather than `=== length` because a sub-block
    // render would make those disagree.
    const rRate = reset.length > 1;
    let p = phase;

    // The bar grid on the very first block: every later change to
    // `beatsPerBar` lands at a beat boundary, but there has not been one yet.
    if (barLength < 0) barLength = beatsPerBar;

    const wantGate = gateOut !== undefined;
    const wantBar = barOut !== undefined;
    const wantDownbeat = downbeatOut !== undefined;

    // Emit, then advance. `phase[i]` is the fraction of the beat elapsed *at*
    // sample `i`, so a beat boundary lands on the sample it is due on rather
    // than one early: at 16384 Hz and 120 BPM the wrap is at sample 8192, not
    // 8191. Advancing first would bias every edge a sample low, which is
    // within the one-sample bound ticket 03 promises but is a bias rather
    // than a rounding.
    //
    // One loop with four hoisted flags rather than a body per combination of
    // present outputs: `benchmarks/clock-rate` prices the whole generator at a
    // fraction of a microsecond a block, and four perfectly predicted branches
    // are not where that goes.
    for (let i = 0; i < length; i++) {
      // Before the emit, so the phase *is* 0 on the reset's own sample and the
      // gate rises there rather than a block later. `running` still gates the
      // gate, so a reset re-aligns a stopped clock's phase without waking it.
      //
      // A reset zeroes the beat counter too: it puts you at the top of a bar,
      // not the top of an arbitrary beat. Anything else would make `reset`
      // mean two different things depending on which output you watched.
      if (detectReset(rRate ? reset[i] : reset[0]) === true) {
        p = 0;
        beats = 0;
        barLength = beatsPerBar;
        barPos = 0;
      }

      phaseOut[i] = p;
      // The downbeat takes its phase, its width and its sample from the beat
      // gate, so it rises and falls with it: `downbeat > 0` implies `gate > 0`
      // everywhere, and the two can be summed or compared with no phase
      // relationship to reason about.
      if (wantGate) gateOut![i] = running ? gatePulse(p, width) : 0;
      // A divide per sample, not a hoisted reciprocal. Measured on isolated
      // copies of the two loops: 0.9244 vs 0.9269 us/block, which is nothing.
      // `benchmarks/lfo-rate` kept its hoist because it was worth 34%; this
      // one is not worth the fourth piece of latched state.
      if (wantBar) barOut![i] = barLength > 0 ? (barPos + p) / barLength : 0;
      if (wantDownbeat) {
        downbeatOut![i] =
          running && barLength > 0 && barPos === 0 ? gatePulse(p, width) : 0;
      }

      p += step;
      if (p >= 1) {
        p -= 1;
        beats++;
        // Latched here and nowhere else, which is what confines a
        // `beatsPerBar` change to a beat boundary.
        barLength = beatsPerBar;
        barPos = barLength > 0 ? beats % barLength : 0;
      }
    }

    phase = p;
  };
}
