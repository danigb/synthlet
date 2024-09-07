import {
  createRegistrar,
  createWorkletConstructor,
  ParamInput,
} from "./_worklet";
import { PROCESSOR } from "./processor";

export const registerDattorroReverbWorklet = createRegistrar(
  "DATTORRO_REVERB",
  PROCESSOR
);

export type DattorroReverbInputs = {
  trigger: ParamInput;
};

export type DattorroReverbWorkletNode = AudioWorkletNode & {
  trigger: AudioParam;
  dispose(): void;
};

export const DattorroReverb = createWorkletConstructor<
  DattorroReverbWorkletNode,
  DattorroReverbInputs
>({
  processorName: "DattorroReverbProcessor",
  paramNames: ["trigger"],
  workletOptions: () => ({
    numberOfInputs: 0,
    numberOfOutputs: 1,
  }),
});
