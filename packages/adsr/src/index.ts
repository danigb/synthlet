import {
  createRegistrar,
  createWorkletConstructor,
  ParamInput,
} from "./_worklet";
import { PROCESSOR } from "./processor";

export type AdsrInputParams = {
  gate: ParamInput;
  attack: ParamInput;
  decay: ParamInput;
  sustain: ParamInput;
  release: ParamInput;
  offset: ParamInput;
  gain: ParamInput;
};

/**
 * An ADSR WorkletNode
 */
export type AdsrWorkletNode = AudioWorkletNode & {
  gate: AudioParam;
  attack: AudioParam;
  decay: AudioParam;
  sustain: AudioParam;
  release: AudioParam;
  offset: AudioParam;
  gain: AudioParam;
  dispose(): void;
};

const PARAM_NAMES = [
  "gate",
  "attack",
  "decay",
  "sustain",
  "release",
  "offset",
  "gain",
] as const;

export const registerAdsrWorkletOnce = createRegistrar("ADSR", PROCESSOR);

export const createVcaNode = createWorkletConstructor<
  AdsrWorkletNode,
  AdsrInputParams
>({
  processorName: "AdsrWorkletProcessor",
  paramNames: PARAM_NAMES,
  workletOptions() {
    return {
      numberOfInputs: 1,
      numberOfOutputs: 1,
      processorOptions: {
        mode: "modulator",
      },
    };
  },
});
export const createAdsrNode = createWorkletConstructor<
  AdsrWorkletNode,
  AdsrInputParams
>({
  processorName: "AdsrWorkletProcessor",
  paramNames: PARAM_NAMES,
  workletOptions() {
    return {
      numberOfInputs: 0,
      numberOfOutputs: 1,
      processorOptions: {
        mode: "generator",
      },
    };
  },
});
