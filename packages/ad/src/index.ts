import {
  createRegistrar,
  createWorkletConstructor,
  ParamInput,
} from "./_worklet";
import { PROCESSOR } from "./processor";

export const registerAdWorkletOnce = createRegistrar("AD_ENV", PROCESSOR);

export type AdInputParams = {
  gate: ParamInput;
  attack: ParamInput;
  decay: ParamInput;
};

export const createAdNode = createWorkletConstructor({
  processorName: "AdProcessor",
  paramNames: ["gate"],
  workletOptions: () => ({
    numberOfInputs: 0,
    numberOfOutputs: 1,
  }),
});
