import { gatePulse } from "./_gate";

/**
 * The clock engine: one phase accumulator, rendered a sample at a time.
 *
 * Both outputs are read from the same variable at the same sample, so they
 * cannot describe different instants. Output 0 is the phase ramp - a rising
 * `[0, 1)` sawtooth, restarting each beat - because subdividing a clock means
 * multiplying its phase, which a square gate cannot support. Output 1 is the
 * gate, which is what an envelope wants: a phase is not a gate, and no
 * threshold makes it one (any threshold fires early; `> 0` latches on).
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

  return function generate(
    phaseOut: Float32Array,
    gateOut: Float32Array | undefined,
    nextBpm: number,
    pulseWidth: number,
  ) {
    if (nextBpm !== bpm) {
      bpm = nextBpm;
      increment = bpm / 60 / sampleRate;
    }

    // Hoisted: all three are fixed for the block, and the same hoist was worth
    // 34% in `benchmarks/lfo-rate`. `p` in particular is a closure read that
    // would otherwise happen twice per sample.
    const step = increment;
    const running = step > 0;
    const length = phaseOut.length;
    let p = phase;

    // Emit, then advance. `phase[i]` is the fraction of the beat elapsed *at*
    // sample `i`, so a beat boundary lands on the sample it is due on rather
    // than one early: at 16384 Hz and 120 BPM the wrap is at sample 8192, not
    // 8191. Advancing first would bias every edge a sample low, which is
    // within the one-sample bound this ticket promises but is a bias rather
    // than a rounding.
    if (gateOut) {
      for (let i = 0; i < length; i++) {
        phaseOut[i] = p;
        gateOut[i] = running ? gatePulse(p, pulseWidth) : 0;
        p += step;
        if (p >= 1) p -= 1;
      }
    } else {
      for (let i = 0; i < length; i++) {
        phaseOut[i] = p;
        p += step;
        if (p >= 1) p -= 1;
      }
    }

    phase = p;
  };
}
