import type { ParamDescriptor } from "./_worklet";

// The single list of this module's parameters: the processor registers it,
// the factory wires inputs by it, and it is exposed as `X.descriptors`.
//
// Four parameters, none of them a-rate. All four are normalized 0..1 knob
// positions rather than physical quantities, and all four are handed to the
// engine's `update()` once per block, which is the shape that makes them
// k-rate: the engine's own LFOs are what move per sample.
//
// `AudioParamDescriptor.automationRate` defaults to `"a-rate"` in the spec, so
// every `k-rate` below is an explicit opt-out and carries a reason for being
// one. `scripts/_worklet.ts`, next to `ParamDescriptor`, has the two grounds.
export const PARAMS: readonly ParamDescriptor[] = [
  {
    // Base delay time, as a knob position. The delay line reads at an
    // interpolated position that the internal LFOs move continuously, so what
    // this sets is where that movement is centred - a setting, not a signal.
    // **A bet all the same**: sweeping the centre by hand is a real effect,
    // and it would need the delay read to take a per-sample offset.
    name: "delay",
    defaultValue: 0.5,
    minValue: 0,
    maxValue: 1,
    automationRate: "k-rate",
  },
  {
    // How fast the internal LFOs run. Modulating an LFO's rate at audio rate
    // is not chorus, and the engine derives phase increments from this once
    // per block.
    name: "rate",
    defaultValue: 0.5,
    minValue: 0,
    maxValue: 1,
    automationRate: "k-rate",
  },
  {
    // How far those LFOs swing. **A bet**: an envelope on depth is an ordinary
    // pedal control. Same shape as `delay` - the value reaches the read
    // position through the engine's own per-block update.
    name: "depth",
    defaultValue: 0.5,
    minValue: 0,
    maxValue: 1,
    automationRate: "k-rate",
  },
  {
    // How far the voices' LFOs are spread apart in phase and rate. Structural:
    // it decides the *relationship* between voices, which is set once for a
    // sound rather than played.
    name: "deviation",
    defaultValue: 0.5,
    minValue: 0,
    maxValue: 1,
    automationRate: "k-rate",
  },
];
