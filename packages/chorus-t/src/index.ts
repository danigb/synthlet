import {
  createRegistrar,
  createWorkletConstructor,
  ParamInput,
} from "./_worklet";
import { PROCESSOR } from "./processor";

export type ChorusTInputParams = {
  enable1: ParamInput;
  enable2: ParamInput;
  lfoRate1: ParamInput;
  lfoRate2: ParamInput;
};

export type ChorusTWorkletNode = AudioWorkletNode & {
  bypass: AudioParam;
  enable1: AudioParam;
  enable2: AudioParam;
  lfoRate1: AudioParam;
  lfoRate2: AudioParam;
  setBypass(value: boolean): void;
};

export const registerChorusTWorklet = createRegistrar("CHORUS", PROCESSOR);

export const createChorusTNode = createWorkletConstructor<
  ChorusTWorkletNode,
  ChorusTInputParams
>({
  processorName: "ChorusTWorkletProcessor",
  paramNames: ["bypass", "enable1", "enable2", "lfoRate1", "lfoRate2"],
  workletOptions: () => ({
    numberOfInputs: 1,
    numberOfOutputs: 1,
  }),
  postCreate(node) {
    node.setBypass = (value: boolean) => {
      node.bypass.value = value ? 1 : 0;
    };
  },
});
