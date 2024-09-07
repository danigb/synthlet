import {
  createRegistrar,
  createWorkletConstructor,
  ParamInput,
} from "./_worklet";
import { PROCESSOR } from "./processor";

export const registerAdWorklet = createRegistrar("AD", PROCESSOR);

export type AdWorkletNode = AudioWorkletNode & {
  trigger: AudioParam;
  attack: AudioParam;
  decay: AudioParam;
  offset: AudioParam;
  gain: AudioParam;
  dispose(): void;
};

export type AdInputs = {
  trigger?: ParamInput;
  attack?: ParamInput;
  decay?: ParamInput;
  offset?: ParamInput;
  gain?: ParamInput;
};

export const AdEnv = createWorkletConstructor<AdWorkletNode, AdInputs>({
  processorName: "AdProcessor",
  paramNames: ["trigger", "attack", "decay", "offset", "gain"],
  workletOptions: () => ({
    numberOfInputs: 0,
    numberOfOutputs: 1,
  }),
});
