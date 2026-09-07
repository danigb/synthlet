import type { ParamDescriptor } from "./_worklet";

// The single list of this module's parameters: the processor registers it,
// the factory wires inputs by it, and it is exposed as `X.descriptors`.
//
// Four parameters, one of them a-rate. `Clock` is a *producer*: what it emits
// is a phase ramp and a gate, and both are written per sample already. What it
// *receives* is one event, and an event is the case a-rate exists for.
//
// `AudioParamDescriptor.automationRate` defaults to `"a-rate"` in the spec, so
// every `k-rate` below is an explicit opt-out and carries a reason for being
// one. `scripts/_worklet.ts`, next to `ParamDescriptor`, has the two grounds.
export const PARAMS: readonly ParamDescriptor[] = [
  {
    // Tempo. The phase increment is derived from it and cached on change, so
    // this is read once per block; and a tempo that changed every sample is
    // not a tempo, it is frequency modulation of the clock. A caller who wants
    // that has `Lfo` and `Param`.
    name: "bpm",
    defaultValue: 120,
    minValue: 0,
    maxValue: 1000,
    automationRate: "k-rate",
  },
  {
    // How much of each beat the gate output is high for. A fraction of the
    // beat rather than a duration: at 120 BPM the default is 250 ms, about 86
    // render quanta, so no consumer can miss it. A fixed short pulse could
    // land inside one 128-frame block and be invisible to a k-rate reader.
    name: "pulseWidth",
    defaultValue: 0.5,
    minValue: 0,
    maxValue: 1,
    automationRate: "k-rate",
  },
  {
    // Re-align the phase. On the trigger's rising edge the phase returns to 0
    // and the next beat starts there.
    //
    // a-rate for the reason every event parameter in this library is: the
    // reset lands on its own sample rather than at the top of the next render
    // quantum, and two resets inside one block are two resets. It is edge
    // triggered - holding it high does not pin the phase at 0.
    //
    // This is a mechanism and not a policy. A clock's phase origin is
    // otherwise "whenever the node was constructed", and two clocks built in
    // different render quanta hold that offset forever. Nothing here says what
    // two clocks should agree on, only that they can be made to; who wires it
    // to what is the part a caller can build.
    name: "reset",
    defaultValue: 0,
    minValue: 0,
    maxValue: 1,
    automationRate: "a-rate",
  },
  {
    // Beats per bar. `0` means no bar structure: the bar phase and the
    // downbeat gate stay silent, and nothing divides.
    //
    // k-rate like its siblings: a bar boundary only ever needs locating to
    // within a render quantum, and it is placed by the beat phase anyway,
    // which is written per sample.
    //
    // This is the first parameter here that is musical *structure* rather than
    // a signal property, and it is defensible for one reason: a bar cannot be
    // derived downstream. Subdividing a clock is multiplying its phase, a pure
    // function of the instantaneous value; a bar position is a count, and the
    // ramp during beat 1 is bit-identical to the ramp during beat 3. A
    // consumer that wanted bars would have to count wraps and choose an
    // origin, and two consumers choosing privately disagree about where bar 1
    // is, forever and silently. `Clock` owns the phase origin, so it owns
    // this. That test - "can it be derived downstream?" - is the one to apply
    // to the next proposal of this kind, rather than treating this as a
    // precedent for putting notation into modules.
    //
    // No time-signature denominator: `bpm` defines what a beat is. 6/8 at
    // dotted-quarter 60 is `bpm: 60, beatsPerBar: 2`, or `bpm: 180,
    // beatsPerBar: 6`, depending on what you want to count.
    name: "beatsPerBar",
    defaultValue: 4,
    minValue: 0,
    maxValue: 32,
    automationRate: "k-rate",
  },
];
