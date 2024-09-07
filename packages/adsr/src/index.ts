import {
  createRegistrar,
  createWorkletConstructor,
  ParamInput,
} from "./_worklet";
import { PROCESSOR } from "./processor";

export type AdsrInputs = {
  gate?: ParamInput;
  attack?: ParamInput;
  decay?: ParamInput;
  sustain?: ParamInput;
  release?: ParamInput;
  offset?: ParamInput;
  gain?: ParamInput;
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

export const registerAdsrWorklet = createRegistrar("ADSR", PROCESSOR);

export const AdsrEnv = createWorkletConstructor<AdsrWorkletNode, AdsrInputs>({
  processorName: "AdsrProcessor",
  paramNames: PARAM_NAMES,
  workletOptions() {
    return {
      numberOfInputs: 0,
      numberOfOutputs: 1,
      processorOptions: { mode: "generator" },
    };
  },
});

export const AdsrAmp = createWorkletConstructor<AdsrWorkletNode, AdsrInputs>({
  processorName: "AdsrProcessor",
  paramNames: PARAM_NAMES,
  workletOptions() {
    return {
      numberOfInputs: 1,
      numberOfOutputs: 1,
      processorOptions: { mode: "modulator" },
    };
  },
});
