import type { ParamDescriptor } from "./_worklet";

// The single list of this module's parameters: the processor registers it,
// the factory wires inputs by it, and it is exposed as `X.descriptors`.
//
// Four parameters, none of them a-rate - and this module's *output* is the
// signal, which is a different question. `worklet.ts` builds the audio-rate
// generator, so the LFO emits one value per sample; what follows is about what
// it reads, and `dsp.ts` reads all four once per block in `read()`.
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
    name: "frequency",
    defaultValue: 10,
    minValue: 0,
    maxValue: 200,
    automationRate: "k-rate",
  },
  {
    // Amplitude, applied per sample as `gen() * gain + offset`. **A bet**: a
    // signal here is an envelope on the LFO's depth, which is a real patch -
    // and the answer to it today is a `Gain` node between the LFO and its
    // destination, which is a-rate and native. Same hoisting argument as
    // `frequency`.
    name: "gain",
    defaultValue: 1,
    minValue: 0,
    maxValue: 10000,
    automationRate: "k-rate",
  },
  {
    // Where the waveform is centred. **A bet**, and the weakest of the three:
    // adding a signal here is exactly what the destination `AudioParam`'s own
    // summing does, so a caller who wants it has a better route already.
    name: "offset",
    defaultValue: 0,
    minValue: -1000,
    maxValue: 1000,
    automationRate: "k-rate",
  },
];
