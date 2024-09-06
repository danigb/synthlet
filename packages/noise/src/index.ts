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

export type NoiseInputs = {
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
  NoiseInputs
>({
  processorName: "NoiseWorkletProcessor",
  paramNames: ["type"],
  workletOptions: () => ({
    numberOfInputs: 0,
    numberOfOutputs: 1,
  }),
});

const op = (params: NoiseInputs) => {
  let node: NoiseWorkletNode;
  return (context: AudioContext) => {
    node ??= createNoiseNode(context, params);
    return node;
  };
};

export const Noise = Object.assign(op, {
  white: () => op({ type: NoiseType.WHITE }),
  pink: () => op({ type: NoiseType.PINK_TRAMMEL }),
});
