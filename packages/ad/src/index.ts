import {
  createRegistrar,
  createWorkletConstructor,
  ParamInput,
} from "./_worklet";
import { PROCESSOR } from "./processor";

export const registerAdWorkletOnce = createRegistrar("AD_ENV", PROCESSOR);

export type AdWorkletNode = AudioWorkletNode & {
  trigger: AudioParam;
  attack: AudioParam;
  decay: AudioParam;
  dispose(): void;
};

export type AdInputParams = {
  trigger: ParamInput;
  attack: ParamInput;
  decay: ParamInput;
};

export const createAdNode = createWorkletConstructor<
  AdWorkletNode,
  AdInputParams
>({
  processorName: "AdProcessor",
  paramNames: ["trigger"],
  workletOptions: () => ({
    numberOfInputs: 0,
    numberOfOutputs: 1,
  }),
});
