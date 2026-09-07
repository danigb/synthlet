import { gatePulse } from "./_gate";

/**
 * The clock engine: a phase accumulator, a wrap, and a gate derived from the
 * phase after the wrap.
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
    let nextPhase = phase + phaseOut.length * increment;
    if (nextPhase > 1) nextPhase -= 1;

    const fill = nextPhase < phase ? 1 : phase;

    // Output 0 is the phase ramp, unchanged: Euclid multiplies it to subdivide
    // the clock, which a square gate cannot support. Output 1 is the gate,
    // which is what an envelope wants - a phase is not a gate, and no
    // threshold makes it one (any threshold fires early; `> 0` latches on).
    phaseOut.fill(fill);

    // Taken from the phase *after* the wrap, so the gate's rising edge lands
    // on the same block as the phase output's 1.0 plateau - the block the AD
    // has always fired on. A stopped clock emits no gate rather than holding
    // it open at phase 0 forever.
    if (gateOut) {
      gateOut.fill(increment > 0 ? gatePulse(nextPhase, pulseWidth) : 0);
    }

    phase = nextPhase;
  };
}
