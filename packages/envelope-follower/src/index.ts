import {
  createRegistrar,
  createWorkletConstructor,
  ParamInput,
} from "./_worklet";
import { PARAMS } from "./params";
import { PROCESSOR } from "./processor";

export { EnvelopeFollowerType } from "./dsp";

export const registerEnvelopeFollowerWorklet = createRegistrar(
  "ENVELOPE_FOLLOWER",
  PROCESSOR,
);

export type EnvelopeFollowerInputs = {
  type: ParamInput;
  gain: ParamInput;
  attack: ParamInput;
  release: ParamInput;
};

export type EnvelopeFollowerWorkletNode = AudioWorkletNode & {
  type: AudioParam;
  gain: AudioParam;
  attack: AudioParam;
  release: AudioParam;
  dispose(): void;
};

export const EnvelopeFollower = createWorkletConstructor<
  EnvelopeFollowerWorkletNode,
  EnvelopeFollowerInputs
>({
  processorName: "EnvelopeFollowerProcessor",
  descriptors: PARAMS,
  workletOptions: () => ({
    numberOfInputs: 1,
    numberOfOutputs: 1,
    // **One channel, whatever comes in.** The output is a control signal, and
    // a stereo control signal would only mean two inconsistently timed copies
    // of the same decision - so the channels fold into the detector instead
    // (`Peak` by maximum, `Rms` by mean square) and one envelope comes out.
    // Without this line Web Audio would follow the input's channel count.
    outputChannelCount: [1],
  }),
});

export { Compound, disposable } from "./_worklet";
export type {
  CompoundNode,
  ConnectedUnit,
  Connector,
  Disposable,
  ParamDescriptor,
  ParamInput,
} from "./_worklet";
