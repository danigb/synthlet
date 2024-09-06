import {
  Connector,
  createRegistrar,
  createWorkletConstructor,
  ParamInput,
} from "./_worklet";
import { PROCESSOR } from "./processor";

export const registerEuclidWorklet = createRegistrar("EUCLID", PROCESSOR);

export type EuclidInputParams = {
  clock?: ParamInput;
  steps?: ParamInput;
  beats?: ParamInput;
  subdivison?: ParamInput;
  rotation?: ParamInput;
};

export type EuclidWorkletNode = AudioWorkletNode & {
  clock: AudioParam;
  steps: AudioParam;
  beats: AudioParam;
  subdivison: AudioParam;
  rotation: AudioParam;
  dispose(): void;
};

export const createEuclidNode = createWorkletConstructor<
  EuclidWorkletNode,
  EuclidInputParams
>({
  processorName: "EuclidProcessor",
  paramNames: ["clock", "steps", "beats", "subdivision", "rotation"],
  workletOptions: () => ({
    numberOfInputs: 0,
    numberOfOutputs: 1,
  }),
});

export const Euclid = (
  params?: EuclidInputParams
): Connector<EuclidWorkletNode> => {
  let node: EuclidWorkletNode;
  return (context: AudioContext) => {
    node ??= createEuclidNode(context, params);
    return node;
  };
};
