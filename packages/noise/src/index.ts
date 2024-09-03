import {
  createRegistrar,
  createWorkletConstructor,
  ParamInput,
} from "./_worklet";
import { NoiseType } from "./dsp";
import { PROCESSOR } from "./processor";

export { NoiseType };

export type NoiseWorkletNode = AudioWorkletNode & {
  type: AudioParam;
};

export type NoiseInputParams = {
  type: ParamInput;
};

export function getNoiseTypes() {
  return [
    { name: "WHITE_RND", value: NoiseType.WHITE_RND },
    { name: "WHITE_FAST", value: NoiseType.WHITE_FAST },
    { name: "PINK_COOPER", value: NoiseType.PINK_COOPER },
    { name: "PINK_LARRY_TRAMMEL", value: NoiseType.PINK_LARRY_TRAMMEL },
  ];
}

export const registerNoiseWorkletOnce = createRegistrar("NOISE", PROCESSOR);
export const createNoiseNode = createWorkletConstructor<
  NoiseWorkletNode,
  NoiseInputParams
>({
  processorName: "NoiseWorkletProcessor",
  paramNames: ["type"],
  workletOptions: () => ({
    numberOfInputs: 0,
    numberOfOutputs: 1,
  }),
});
