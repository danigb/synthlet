import type { ParamDescriptor } from "./_worklet";

// The single list of this module's parameters: the processor registers it,
// the factory wires inputs by it, and it is exposed as
// `ModalResonator.descriptors`.
//
// Three parameters, none of them a-rate. The fourth control surface - the mode
// table - is not a parameter at all: a table is not a number, and sixty-four
// modes are not 192 `AudioParam`s. It is `setModes()`.
//
// `AudioParamDescriptor.automationRate` defaults to `"a-rate"` in the spec, so
// every `k-rate` below is an explicit opt-out and carries a reason for being
// one. `scripts/_worklet.ts`, next to `ParamDescriptor`, has the two grounds.
export const PARAMS: readonly ParamDescriptor[] = [
  {
    // Frequency of a mode whose ratio is 1, in hertz; every other mode is a
    // ratio of it. **Consumed per block, and interpolated across it.** Each
    // mode's coefficients are a `cos`, a `sin` and an `exp`, and sixty-four of
    // those per sample is the wrong trade when a straight-line ramp of the two
    // rotation coefficients across the block is indistinguishable from it: the
    // tests read the third difference of a 100 -> 200 Hz sweep and find it
    // smoother than a tone held at 200 Hz. So a pitch envelope on a drum does
    // not zipper, and it does not cost a recompute per sample.
    //
    // KarplusStrong's `frequency` is a-rate because a delay line's length can
    // move per sample for the price of an addition. Here it cannot.
    name: "frequency",
    defaultValue: 220,
    minValue: 20,
    maxValue: 5000,
    automationRate: "k-rate",
  },
  {
    // Seconds for a mode whose table decay is 1 to fall 60 dB - the sentence
    // `karplus-strong` uses for its own `decay`. Each mode multiplies it by its
    // table entry, so Part 32's "45 % : 73 % : 91 % : 84 %" goes into the table
    // verbatim and this one knob still says how long the drum rings.
    //
    // Not "seconds for mode 1": in the kettle drum's table mode 1 *is* the 45 %.
    //
    // k-rate on the same ground as `frequency` - an `exp` per mode - and it is
    // interpolated with it, because it lives in the same two coefficients.
    name: "decay",
    defaultValue: 1,
    minValue: 0.01,
    maxValue: 10,
    automationRate: "k-rate",
  },
  {
    // Tilt: mode n's level is scaled by `brightness^(n-1)`. 1 is the table as
    // written; 0 is mode 1 alone. Velocity into this is the strike-hardness
    // gesture of Parts 35 and 42 - a harder hit excites more of the upper modes.
    //
    // k-rate because it scales the *input* gain of every mode, a `pow` each.
    // Changing it while a mode rings changes the next strike, not the ring in
    // progress, so there is nothing within a block for a per-sample value to
    // do.
    name: "brightness",
    defaultValue: 1,
    minValue: 0,
    maxValue: 1,
    automationRate: "k-rate",
  },
];
