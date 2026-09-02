import {
  Compound,
  CompoundNode,
  createRegistrar,
  createWorkletConstructor,
  ParamInput,
} from "./_worklet";
import { PARAMS } from "./params";
import { PROCESSOR } from "./processor";

export type ClockInputs = {
  bpm?: ParamInput;
  pulseWidth?: ParamInput;
};

export type ClockWorkletNode = AudioWorkletNode & {
  bpm: AudioParam;
  pulseWidth: AudioParam;
};

/**
 * A clock node: the phase ramp on its own output, the gate on `.gate`.
 *
 * The two are different kinds of signal and are not interchangeable. The phase
 * is a rising 0...1 ramp, restarting each beat - what `Euclid` needs, because
 * subdividing a clock means multiplying its phase. The gate is high for
 * `pulseWidth` of each beat - what an envelope needs. Feeding the phase to an
 * envelope's trigger used to work by accident and does not any more:
 *
 * ```ts
 * const clock = Clock(ac, { bpm: 120 });
 * Euclid(ac, { clock }); // the ramp
 * KickDrum(ac, { trigger: clock.gate }); // the gate
 * ```
 */
export type ClockNode = CompoundNode<ClockWorkletNode, { gate: GainNode }>;

const createClockNode = createWorkletConstructor<ClockWorkletNode, ClockInputs>(
  {
    processorName: "ClockWorkletProcessor",
    descriptors: PARAMS,
    workletOptions: () => ({
      numberOfInputs: 0,
      numberOfOutputs: 2,
      outputChannelCount: [1, 1],
    }),
  },
);

export const Clock = Object.assign(
  (context: AudioContext, inputs: ClockInputs = {}): ClockNode => {
    const node = createClockNode(context, inputs);
    // The gate needs to be a node a caller can connect *from*, so output 1
    // gets its own gain to hang off. One clock, one phase accumulator: a
    // second Clock node would drift unless built in the same render quantum,
    // which is why this is a second output rather than a `ClockGate` variant.
    const gate = new GainNode(context);
    node.connect(gate, 1);
    return Compound({ output: node, owns: [gate], exposes: { gate } });
  },
  { descriptors: PARAMS },
);

export const registerClockWorklet = createRegistrar("CLOCK", PROCESSOR);

export { Compound, disposable } from "./_worklet";
export type {
  CompoundNode,
  ConnectedUnit,
  Connector,
  Disposable,
  ParamDescriptor,
  ParamInput,
} from "./_worklet";
