import type { ParamDescriptor } from "./_worklet";

// The single list of this module's parameters: the processor registers it,
// the factory wires inputs by it, and it is exposed as `X.descriptors`.
//
// Seven parameters, three of them a-rate - and this module's *output* is the
// signal, which is a different question. `worklet.ts` builds the audio-rate
// generator, so the LFO emits one value per sample; what follows is about what
// it reads, and `dsp.ts` reads the four shaping parameters once per block in
// `read()`. `sync` is the exception, because it is an event: a reset read once
// per block would be a reset quantised to a block.
//
// `AudioParamDescriptor.automationRate` defaults to `"a-rate"` in the spec, so
// every `k-rate` below is an explicit opt-out and carries a reason for being
// one. `scripts/_worklet.ts`, next to `ParamDescriptor`, has the two grounds.
export const PARAMS: readonly ParamDescriptor[] = [
  {
    // Structural: an index into a bank of generator functions, matched to
    // `LfoType`. The generator is swapped when this changes, so a per-sample
    // value would mean changing waveform 128 times a block - which is not
    // waveform modulation, it is noise.
    name: "type",
    defaultValue: 1,
    minValue: 0,
    maxValue: 10,
    automationRate: "k-rate",
  },
  {
    // Hz. **A bet, and the most interesting one in this file**: an LFO whose
    // rate is itself modulated is an ordinary patch, and at k-rate the rate
    // steps once per render quantum. It reads as k-rate today because
    // `generateAudioRate` hoists the phase increment out of its sample loop,
    // which is worth 34% of the generator (`benchmarks/lfo-rate/`) - a
    // per-sample rate would give that back. The output is smooth either way;
    // what is quantised is how fast it moves. Revisit if a patch wants it.
    // **Bipolar**: a negative frequency runs the phase backwards, which is the
    // reverse saw and the reverse ramp, and `frequency: 0` freezes it - the
    // output holds the shape's value at the instance's `phase` until something
    // moves it. Elektron's bipolar `SPD` is the same idea in hardware.
    name: "frequency",
    defaultValue: 10,
    minValue: -200,
    maxValue: 200,
    automationRate: "a-rate",
  },
  {
    // Amplitude, applied per sample as `gen() * gain + offset`. **A bet**: a
    // signal here is an envelope on the LFO's depth, which is a real patch -
    // and the answer to it today is a `Gain` node between the LFO and its
    // destination, which is a-rate and native. Same hoisting argument as
    // `frequency`.
    //
    // **Bipolar, and that is the whole of it**: a negative gain inverts the
    // waveform, which is how a filter closes as the amp opens and how two LFOs
    // run in antiphase. `[-20000, 20000]` is not a bespoke number - `ad`,
    // `adsr` and `param` compute the same `x * gain + offset` and declare the
    // same range, and `descriptors.test.ts` pins the four together. An
    // `AudioParam` clamps its *computed* value to this range, so a `minValue`
    // of 0 forbade inversion even from a connected modulator.
    name: "gain",
    defaultValue: 1,
    minValue: -20000,
    maxValue: 20000,
    automationRate: "k-rate",
  },
  {
    // Where the waveform is centred. **A bet**, and the weakest of the three:
    // adding a signal here is exactly what the destination `AudioParam`'s own
    // summing does, so a caller who wants it has a better route already.
    //
    // Same `[-20000, 20000]` as the siblings, and for a reason of its own: the
    // canonical use is centring the LFO in its destination's units, and the
    // destinations reach much further than the 1000 this used to allow -
    // `Svf.frequency` goes to 20000 and every `detune` is in cents. A unipolar
    // 0…1 sweep of a filter cutoff is `gain: 10000, offset: 10000`.
    name: "offset",
    defaultValue: 0,
    minValue: -20000,
    maxValue: 20000,
    automationRate: "k-rate",
  },
  {
    // The reset, a-rate. A **rising edge** - non-positive to positive,
    // synthlet's one gate contract - restarts the phase at the instance's
    // `phase` option. Unconnected it is 0 and nothing happens, so every patch
    // written before it existed renders bit-identically.
    //
    // a-rate for **reach**, not for jitter. The other two `sync` params in the
    // library are a-rate because a band-limited oscillator needs the sub-sample
    // instant of the crossing; an LFO does not - 2.9 ms of quantisation is
    // nothing against a 5 Hz cycle - and **this package deliberately does not
    // interpolate it.** The reset lands on the sample the edge was detected on.
    // What a-rate buys is that any signal in the library can drive it:
    // `clock.gate` for tempo sync, an `AdEnv`, an `Impulse`, a `Param` from the
    // UI. It is also the shape `descriptors.test.ts` pins for every event
    // param, and an event's whole content is *when*.
    name: "sync",
    defaultValue: 0,
    minValue: 0,
    maxValue: 1,
    automationRate: "a-rate",
  },
  {
    // The depth envelope's note, a-rate. **This is not `sync`.** `sync` resets
    // the *phase*; `gate` restarts the *depth ramp*. They are separate
    // parameters because they are separate ideas, and a module that conflated
    // them could not do delayed vibrato on a free-running LFO - which is what a
    // Juno does, and rune06's `gate_on` pointedly does not touch `phase`.
    //
    // A rising edge restarts the fade at zero. While the gate is high the fade
    // advances; while it is low the fade **freezes** rather than resetting, so
    // releasing mid-fade holds the depth and the next note continues from
    // there. A gate held high across several legato notes is one edge and
    // therefore one ramp.
    //
    // a-rate for the same reason as `sync`: an event's whole content is *when*,
    // and this is the shape every trigger param in the library declares.
    name: "gate",
    defaultValue: 0,
    minValue: 0,
    maxValue: 1,
    automationRate: "a-rate",
  },
  // The depth envelope's shape: two durations, each consumed as one sample
  // count or one exponential coefficient per block. A duration that changed
  // every sample would not be a duration. k-rate is what they mean rather than
  // a saving - the same ground `ad/src/params.ts` gives for its own two.
  //
  // **`delay: 0, attack: 0` - the defaults - means no envelope at all.** The
  // depth is 1, `gate` is ignored, and the output is bit-identical to a build
  // without any of this. That matters more here than anywhere: nine packages
  // depend on this one, and none of them connects a gate.
  {
    // Seconds held at zero depth before the ramp begins. The Juno-6 has no
    // hold and is `delay: 0`; the Juno-106's firmware holds first, and this is
    // that behaviour without its fixed-point arithmetic.
    name: "delay",
    defaultValue: 0,
    minValue: 0,
    maxValue: 10,
    automationRate: "k-rate",
  },
  {
    // Seconds from zero to 99% of full depth, one-pole. **Seconds mean how
    // long the move takes**, which is this library's rule since the envelope
    // packages settled it - not a time constant. rune06 uses the other
    // convention, and the conversion is exact and constant: its `tau` is
    // `attack / ln(100)`, so a Juno-6 with its delay slider at maximum
    // (tau = 1.5 s) is `attack: 6.91`.
    name: "attack",
    defaultValue: 0,
    minValue: 0,
    maxValue: 10,
    automationRate: "k-rate",
  },
];
