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
  dispose(): void;
};

export type NoiseInputParams = {
  type: ParamInput;
};

export function getNoiseTypes(): { name: string; value: number }[] {
  return [
    { name: "White", value: NoiseType.WHITE },
    { name: "Pink Trammel", value: NoiseType.PINK_TRAMMEL },
  ];
}

export const registerNoiseWorklet = createRegistrar("NOISE", PROCESSOR);
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
