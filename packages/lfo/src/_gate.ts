// DON'T EDIT THIS FILE unless inside scripts/_gate.ts
// use ./scripts/copy_files.sh to copy this file to the right place
// the goal is to avoid external dependencies on packages

// Synthlet's one gate/trigger contract:
//
//   A gate is on while the signal is positive. A trigger is the transition
//   from non-positive to positive.
//
// That is the rule SuperCollider (`gate > 0`), Faust (`t > 0`), Max/RNBO
// ("any non-zero") and sndkit (`trig != 0`) use. It needs no threshold to
// defend, and it is invariant under `Param`: `input * gain + offset` with a
// positive gain and a non-negative offset keeps a positive signal positive,
// so attenuating or scaling a gate line cannot silently stop it working.
//
// It is written `> 0` rather than "non-zero" deliberately: today every trigger
// param declares `minValue: 0`, so the two are indistinguishable, but `> 0`
// leaves the negative half free (negative means off) for a later range change.
//
// The one rule it asks of callers: a gate line is never smoothed. Use
// `setValueAtTime` or `linearRampToValueAtTime`, never `setTargetAtTime` -
// a signal that asymptotes towards zero never actually reaches it, so the
// gate would never close.

/**
 * Detects gate edges in a control signal.
 *
 * Returns `true` on the rising edge, `false` on the falling edge, and
 * `undefined` in between. Consumers that only fire (AD, Arp, Impulse,
 * Karplus-Strong) test for `true`; the ADSR, which has to release, uses both.
 *
 * Holding the signal positive fires once, not once per call: a re-fire needs
 * the signal to return to `<= 0` first, which is a genuine retrigger.
 */
export function createGateDetector() {
  let open = false;
  return (gate: number): boolean | undefined => {
    if (!open && gate > 0) return (open = true);
    if (open && gate <= 0) return (open = false);
    return undefined;
  };
}

/**
 * The producer side of the same contract: 1 for the first `width` of a phase
 * in [0, 1), 0 for the rest. `Clock` pulses a fraction of the beat with it and
 * `Euclid` a fraction of a step, so neither emits a gate shorter than a render
 * quantum (~2.9 ms at 44.1 kHz) - which a k-rate consumer could not see.
 */
export function gatePulse(phase: number, width: number) {
  return phase < width ? 1 : 0;
}
