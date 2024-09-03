import {
  createRegistrar,
  createWorkletConstructor,
  ParamInput,
} from "./_worklet";
import { PROCESSOR } from "./processor";

export type StateVariableFilterParams = {
  type: "bypass" | "lowpass" | "bandpass" | "hipass";
  filterType: ParamInput;
  frequency: ParamInput;
  resonance: ParamInput;
};

export type StateVariableFilterWorkletNode = AudioWorkletNode & {
  type: string;
  filterType: AudioParam;
  frequency: AudioParam;
  resonance: AudioParam;
};

export const registerStateVariableFilterWorkletOnce = createRegistrar(
  "SVF",
  PROCESSOR
);

export const createStateVariableFilterNode = createWorkletConstructor<
  StateVariableFilterWorkletNode,
  StateVariableFilterParams
>({
  processorName: "StateVariableFilterWorkletProcessor",
  paramNames: ["filterType", "frequency", "resonance"],
  validateParams(options) {
    if (options.type !== undefined && options.filterType !== undefined) {
      throw Error(
        "PolyblepOscillator error - only filterType or type can be defined in options"
      );
    }
    if (options.type) {
      options.filterType = typeToFilterType(options.type) || 1;
    }
    options.frequency ??= 4000;
    options.filterType ??= 1;
  },
  workletOptions() {
    return { numberOfInputs: 1, numberOfOutputs: 1 };
  },
  postCreate(node) {
    Object.defineProperty(node, "type", {
      get() {
        return filterTypeToType(this.filterType.value);
      },
      set(value: string) {
        const filterType = typeToFilterType(value);
        this.filterType.setValueAtTime(filterType, 0);
      },
    });
  },
});

function filterTypeToType(filterType: number) {
  return filterType === 1
    ? "lowpass"
    : filterType === 2
    ? "bandpass"
    : filterType === 3
    ? "highpass"
    : "bypass";
}

function typeToFilterType(type?: string): number {
  return type === "lowpass"
    ? 1
    : type === "bandpass"
    ? 2
    : type === "highpass"
    ? 3
    : 0;
}
