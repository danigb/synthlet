import { PROCESSOR } from "./_processor";
import { createRegistrar, createWorkletConstructor } from "./_worklet";

export const registerLookaheadLimiterWorklet = createRegistrar(
  "LOOKAHEAD_LIMITER",
  PROCESSOR,
);

export type LookaheadLimiterInputs = {};

export type LookaheadLimiterWorkletNode = AudioWorkletNode & {
  dispose(): void;
};

export const LookaheadLimiter = createWorkletConstructor<
  LookaheadLimiterWorkletNode,
  LookaheadLimiterInputs
>({
  processorName: "LookaheadLimiterProcessor",
  descriptors: [],
  workletOptions: () => ({
    numberOfInputs: 1,
    numberOfOutputs: 1,
    outputChannelCount: [2],
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
