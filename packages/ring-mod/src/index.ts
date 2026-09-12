import {
  createRegistrar,
  createWorkletConstructor,
  ParamInput,
} from "./_worklet";
import { PARAMS } from "./params";
import { PROCESSOR } from "./processor";

export { RingModType } from "./dsp";

export const registerRingModWorklet = createRegistrar("RING_MOD", PROCESSOR);

export type RingModInputs = {
  type: ParamInput;
  /**
   * The modulating signal. A number is a constant gain; an `AudioNode` or a
   * `Connector` is the second audio signal.
   *
   * It is an `AudioParam` rather than a second input because that is the only
   * thing `connectParams` can wire, and two costs come with that: an
   * `AudioParam` input is **down-mixed to mono**, and an a-rate one is
   * **clamped** to the descriptor's range (+/-10). Both are in the README.
   */
  modulator: ParamInput;
  offset: ParamInput;
  coupling: ParamInput;
};

export type RingModWorkletNode = AudioWorkletNode & {
  type: AudioParam;
  modulator: AudioParam;
  offset: AudioParam;
  coupling: AudioParam;
  dispose(): void;
};

export const RingMod = createWorkletConstructor<
  RingModWorkletNode,
  RingModInputs
>({
  processorName: "RingModProcessor",
  descriptors: PARAMS,
  workletOptions: () => ({
    numberOfInputs: 1,
    numberOfOutputs: 1,
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
