import type { ParamDescriptor } from "./_worklet";

// The single list of this module's parameters: the processor registers it,
// the factory wires inputs by it, and it is exposed as `X.descriptors`.
export const PARAMS: readonly ParamDescriptor[] = [
  // `PolyblepOscillatorType`, in brightness order. The default stays the
  // sawtooth so the renumbering changes no existing patch's sound.
  {
    name: "type",
    defaultValue: 2,
    minValue: 0,
    maxValue: 3,
    automationRate: "k-rate",
  },
  // **Bipolar**, and that is the answer to the audit's Open Question 3 rather
  // than a widening for its own sake. A negative frequency runs the phase
  // backwards, so a modulator connected here is no longer half-wave rectified
  // at the bottom - and rectifying it does not merely limit the sound, it
  // produces a different, wrong spectrum, because a rectified modulator is not
  // the modulator that was patched. `AudioParam` sums its inputs with the
  // intrinsic value, so connecting a node here is *linear* FM by construction,
  // which is the FM that has a through-zero behaviour worth having.
  //
  // What may not happen is a *positive* minimum. `connectParams` writes
  // `param.value = 0` for every connected input (`_worklet.ts:73-76`), so one
  // makes Chrome clamp that write and log a "value outside nominal range"
  // warning for every oscillator wired to a node, `MonoSynth` included. Zero
  // frequency is still defined as hold: the phase freezes and the output holds
  // a finite constant.
  {
    name: "frequency",
    defaultValue: 440,
    minValue: -20000,
    maxValue: 20000,
    automationRate: "a-rate",
  },
  // In cents: +/- one octave.
  {
    name: "detune",
    defaultValue: 0,
    minValue: -1200,
    maxValue: 1200,
    automationRate: "a-rate",
  },
  // Pulse width on the square, peak position on the triangle; ignored by the
  // sine and the sawtooth. The DSP clamps it away from 0 and 1 per sample, by
  // `2 * |increment|`, so it cannot reach either end in the output even though
  // the declared range includes them. That is the right trade: the declared
  // range is the one a UI slider should offer, and the DSP is total across it.
  {
    name: "width",
    defaultValue: 0.5,
    minValue: 0,
    maxValue: 1,
    automationRate: "a-rate",
  },
  // Hard sync. A rising edge restarts the phase at the `phase` construction
  // option, band-limited through the same primitive as every other
  // discontinuity, so the reset is a step and - on the triangle and the sine -
  // a corner rather than a splice.
  //
  // The shape is the library's one gate contract, `scripts/_gate.ts`: a gate is
  // on while the signal is positive and a trigger is the transition from
  // non-positive to positive, so `{ 0, 0, 1 }` is the shape every trigger-like
  // param in synthlet declares and `packages/synthlet/src/descriptors.test.ts`
  // is what keeps them in step.
  //
  // **The rate is not part of that contract, and this one is a-rate.** Every
  // other trigger in the library only has to decide *which block* it fired in;
  // this one has to decide *where inside a sample*, because that is the whole
  // point - a value read once per 128-frame quantum quantises the reset to
  // 2.9 ms at 44.1 kHz, which is a sync an octave and a half flat of where it
  // was asked for. Callers follow the same rule the contract asks of every gate
  // line: `setValueAtTime` or `linearRampToValueAtTime`, never
  // `setTargetAtTime`, because a signal that asymptotes towards zero never
  // reaches it and the gate would never re-arm.
  {
    name: "sync",
    defaultValue: 0,
    minValue: 0,
    maxValue: 1,
    automationRate: "a-rate",
  },
];
