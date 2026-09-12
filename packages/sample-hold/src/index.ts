import {
  createRegistrar,
  createWorkletConstructor,
  ParamInput,
} from "./_worklet";
import { PARAMS } from "./params";
import { PROCESSOR } from "./processor";

export { SampleHoldType } from "./dsp";

export const registerSampleHoldWorklet = createRegistrar(
  "SAMPLE_HOLD",
  PROCESSOR,
);

export type SampleHoldInputs = {
  type: ParamInput;
  /**
   * The clock. A rising edge samples the input.
   *
   * Use `clock.gate`, not the `Clock` node itself: the node is a phase ramp,
   * which is positive from the first beat onward and never falls back, so it
   * would sample once and latch forever.
   */
  trigger: ParamInput;
};

export type SampleHoldWorkletNode = AudioWorkletNode & {
  type: AudioParam;
  trigger: AudioParam;
  dispose(): void;
};

export const SampleHold = createWorkletConstructor<
  SampleHoldWorkletNode,
  SampleHoldInputs
>({
  processorName: "SampleHoldProcessor",
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
