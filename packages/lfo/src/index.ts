import {
  createRegistrar,
  createWorkletConstructor,
  ParamInput,
} from "./_worklet";
import {
  lfoWaveformFromType,
  lfoWaveformToType,
  LfoWaveformType,
} from "./lfo_waveform_type";
import { PROCESSOR } from "./processor";

export { getLfoWaveformTypes } from "./lfo_waveform_type";
export type { LfoWaveformType };

export type LfoWorklet = AudioWorkletNode & {
  waveform: AudioParam;
  frequency: AudioParam;
  gain: AudioParam;
  offset: AudioParam;
  type: LfoWaveformType;
};

export type LfoInputParams = {
  type?: string;
  waveform?: ParamInput;
  frequency?: ParamInput;
  gain?: ParamInput;
  offset?: ParamInput;
};

export const registerLfoWorkletOnce = createRegistrar("LFO", PROCESSOR);
export const createLfoNode = createWorkletConstructor<
  LfoWorklet,
  LfoInputParams
>({
  processorName: "LfoProcessor",
  paramNames: ["waveform", "frequency", "gain", "offset"] as const,
  workletOptions: () => ({
    numberOfInputs: 0,
    numberOfOutputs: 1,
  }),
  postCreate(node) {
    Object.defineProperty(node, "type", {
      get() {
        return lfoWaveformToType(this.waveform.value);
      },
      set(value: string) {
        const waveform = lfoWaveformFromType(value);
        if (waveform !== undefined) this.waveform.setValueAtTime(waveform, 0);
      },
    });
  },
});
