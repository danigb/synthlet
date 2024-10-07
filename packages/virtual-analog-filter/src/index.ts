import {
  createRegistrar,
  createWorkletConstructor,
  ParamInput,
} from "./_worklet";
import { PROCESSOR } from "./processor";

const TYPES = {
  MOOG_LADDER: 0,
  MOOG_HALF_LADDER: 1,
  KORG35_LPF: 2,
  KORG35_HPF: 3,
  DIODE_LADDER: 4,
  OBERHEIM_LPF: 5,
  OBERHEIM_HPF: 6,
  OBERHEIM_BPF: 7,
  OBERHEIM_BSF: 8,
} as const;

export const registerVirtualAnalogFilterWorklet = createRegistrar(
  "VAF",
  PROCESSOR
);

export type VirtualAnalogFilterInputs = {
  type: ParamInput;
  frequency: ParamInput;
  detune: ParamInput;
  resonance: ParamInput;
};

export type VirtualAnalogFilterWorkletNode = AudioWorkletNode & {
  type: AudioParam;
  frequency: AudioParam;
  detune: AudioParam;
  resonance: AudioParam;
  dispose(): void;
};

export const VirtualAnalogFilter = Object.assign(
  createWorkletConstructor<
    VirtualAnalogFilterWorkletNode,
    VirtualAnalogFilterInputs
  >({
    processorName: "VAFProcessor",
    paramNames: ["type", "frequency", "detune", "resonance"],
    workletOptions: () => ({
      numberOfInputs: 1,
      numberOfOutputs: 1,
    }),
  }),
  TYPES
);
