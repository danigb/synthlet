import {
  createRegistrar,
  createWorkletConstructor,
  ParamInput,
} from "./_worklet";
import { PROCESSOR } from "./processor";

export const registerAdWorkletOnce = createRegistrar(PROCESSOR);

export type AdWorkletNode = AudioWorkletNode & {
  trigger: AudioParam;
  attack: AudioParam;
  decay: AudioParam;
  offset: AudioParam;
  gain: AudioParam;
  dispose(): void;
};

export type AdInputParams = {
  trigger: ParamInput;
  attack: ParamInput;
  decay: ParamInput;
  offset: ParamInput;
  gain: ParamInput;
};

export const createAdNode = createWorkletConstructor<
  AdWorkletNode,
  AdInputParams
>({
  processorName: "AdProcessor",
  paramNames: ["trigger", "attack", "decay", "offset", "gain"],
  workletOptions: () => ({
    numberOfInputs: 0,
    numberOfOutputs: 1,
  }),
});
