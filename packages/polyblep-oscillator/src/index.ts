import {
  createRegistrar,
  createWorkletConstructor,
  ParamInput,
} from "./_worklet";
import {
  polyblepWaveformToWaveformType,
  polyblepWaveformTypeToWaveform,
} from "./polyblep_waveform_type";
import { PROCESSOR } from "./processor";

export type PolyblepWaveformType = "sine" | "sawtooth" | "square" | "triangle";

export type PolyblepOscillatorInputParams = {
  type: PolyblepWaveformType;
  waveform: ParamInput;
  frequency: ParamInput;
};

export function getPolyblepOscillatorProcessorName() {
  return "PolyBLEPWorkletProcessor"; // Can't import from worklet because globals
}

const PARAM_NAMES = ["waveform", "frequency"] as const;

/**
 * A PolyBLEP Oscillator AudioWorkletNode
 */
export type PolyblepOscillatorWorkletNode = AudioWorkletNode & {
  type: PolyblepWaveformType;
  waveform: AudioParam;
  frequency: AudioParam;
};

export const registerPolyblepOscillatorWorkletOnce = createRegistrar(
  "POLYBLEP",
  PROCESSOR
);

export const createPolyblepOscillatorNode = createWorkletConstructor<
  PolyblepOscillatorWorkletNode,
  PolyblepOscillatorInputParams
>({
  processorName: "PolyBLEPWorkletProcessor",
  paramNames: PARAM_NAMES,
  validateParams(params) {
    if (params.waveform !== undefined && params.type !== undefined) {
      throw Error(
        "PolyblepOscillator error - only waveform or type can be defined in options"
      );
    }
    if (params.type !== undefined) {
      params.waveform = polyblepWaveformTypeToWaveform(params.type);
    }
    params.frequency = params.frequency ?? 440;
    params.waveform = params.waveform ?? 1;
  },
  workletOptions: () => ({
    numberOfInputs: 0,
    numberOfOutputs: 1,
  }),
  postCreate(node) {
    Object.defineProperty(node, "type", {
      get() {
        return polyblepWaveformToWaveformType(this.waveform.value);
      },
      set(value: string) {
        let waveform = polyblepWaveformTypeToWaveform(value);
        if (waveform !== undefined) this.waveform.setValueAtTime(waveform, 0);
      },
    });
  },
});
