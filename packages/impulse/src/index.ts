import {
  createRegistrar,
  createWorkletConstructor,
  ParamInput,
} from "./_worklet";
import { PROCESSOR } from "./processor";

export const registerImpulseWorkletOnce = createRegistrar("IMPULSE", PROCESSOR);

export type ImpulseInputParams = {
  gate: ParamInput;
};

export const createImpulseNode = createWorkletConstructor({
  processorName: "ImpulseProcessor",
  paramNames: ["gate"],
  workletOptions: () => ({
    numberOfInputs: 0,
    numberOfOutputs: 1,
  }),
});
