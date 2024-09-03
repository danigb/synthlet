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

export function getNoiseTypes(): { name: string; value: number }[] {
  return [
    { name: "White Random", value: NoiseType.WHITE_RND },
    { name: "White Fast", value: NoiseType.WHITE_FAST },
    { name: "Pink Cooper", value: NoiseType.PINK_COOPER },
    { name: "Pink Larry Trammel", value: NoiseType.PINK_LARRY_TRAMMEL },
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
