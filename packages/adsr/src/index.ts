import {
  createRegistrar,
  createWorkletConstructor,
  ParamInput,
} from "./_worklet";
import { PROCESSOR } from "./processor";

export type AdsrParams = {
  mode: "generator" | "modulator";
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
  setGate: (gate: boolean, time?: number) => void;
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

export function createVcaNode(
  audioContext: AudioContext,
  params: Partial<AdsrParams> = {}
): AdsrWorkletNode {
  params.mode = "modulator";
  return createAdsrNode(audioContext, params);
}

export function createAdsrGenNode(
  audioContext: AudioContext,
  params: Partial<AdsrParams> = {}
): AdsrWorkletNode {
  params.mode = "generator";
  return createAdsrNode(audioContext, params);
}

export const registerAdsrWorkletOnce = createRegistrar("ADSR", PROCESSOR);
export const createAdsrNode = createWorkletConstructor<
  AdsrWorkletNode,
  AdsrParams
>({
  processorName: "AdsrWorkletProcessor",
  paramNames: PARAM_NAMES,
  workletOptions(params) {
    return {
      numberOfInputs: params.mode === "modulator" ? 1 : 0,
      numberOfOutputs: 1,
    };
  },
  postCreate(node) {
    node.setGate = (gate, time = 0) => {
      node.gate.setValueAtTime(gate ? 1 : 0, time);
    };
  },
});
