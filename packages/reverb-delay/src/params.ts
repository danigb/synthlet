import type { ParamDescriptor } from "./_worklet";

// The single list of this module's parameters: the processor registers it,
// the factory wires inputs by it, and it is exposed as `X.descriptors`.
//
// Seven parameters, none of them a-rate. Every one is handed to the engine's
// `update()` once per block, where it becomes a coefficient or a delay length
// for the whole network. A reverb is a *space*, and a space that changed
// between two samples is not a space - which is ground (b) for most of what
// follows.
//
// `AudioParamDescriptor.automationRate` defaults to `"a-rate"` in the spec, so
// every `k-rate` below is an explicit opt-out and carries a reason for being
// one. `scripts/_worklet.ts`, next to `ParamDescriptor`, has the two grounds.
export const PARAMS: readonly ParamDescriptor[] = [
  {
    // Seconds of pre-delay before the network. A delay length, and changing a
    // delay length per sample is pitch-shifting the tail rather than moving
    // the room: `analog-delay` is the module that does that on purpose.
    name: "delay",
    defaultValue: 0.2,
    minValue: 0.001,
    maxValue: 1.45,
    automationRate: "k-rate",
  },
  {
    // High-frequency loss per round trip - the one-pole in the loop. A
    // coefficient recomputed on change; a per-sample value would be an audio
    // signal inside a feedback filter, which is a different module.
    name: "damping",
    defaultValue: 0.3,
    minValue: 0,
    maxValue: 0.99,
    automationRate: "k-rate",
  },
  {
    // How large the room is: a multiplier on every delay length in the
    // network. Structural - it decides the shape of the network, and the
    // lengths are only meaningful between them.
    name: "size",
    defaultValue: 1,
    minValue: 0.1,
    maxValue: 3,
    automationRate: "k-rate",
  },
  {
    // Allpass coefficient: how smeared each reflection is. A coefficient in
    // the loop, under the same argument as `damping`.
    name: "diffusion",
    defaultValue: 0.5,
    minValue: 0,
    maxValue: 0.99,
    automationRate: "k-rate",
  },
  {
    // Loop gain, and therefore the decay time. **A bet**: ducking the tail
    // with an envelope is a real production move, and it is a plain multiply.
    // The reason it is not a-rate is that this multiply lives inside the
    // feedback path, where a per-sample gain change is a modulated resonator
    // rather than a level control. A `Gain` on the wet return is the safe
    // version of that patch.
    name: "feedback",
    defaultValue: 0.9,
    minValue: 0,
    maxValue: 1,
    automationRate: "k-rate",
  },
  {
    // How far the internal modulation moves the delay taps. The engine's own
    // LFOs are what move per sample; this is how far they reach.
    name: "modDepth",
    defaultValue: 0.1,
    minValue: 0,
    maxValue: 1,
    automationRate: "k-rate",
  },
  {
    // How fast those LFOs run, in Hz. Modulating a modulator's rate at audio
    // rate is not a reverb control.
    name: "modFreq",
    defaultValue: 2,
    minValue: 0,
    maxValue: 10,
    automationRate: "k-rate",
  },
];
