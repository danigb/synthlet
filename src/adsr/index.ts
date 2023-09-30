import { addParams, loadWorklet } from "../utils";
import { AdsrParams } from "./adsr";
import { PROCESSOR as ADSR } from "./processor";

export const loadAdsr = loadWorklet(ADSR);

export const createAdsrNode = (context: AudioContext): AdsrNode => {
  const node = new AudioWorkletNode(context, "AdsrWorklet", {
    numberOfInputs: 1,
    numberOfOutputs: 1,
  });
  addParams(node, AdsrParams);

  return node as AdsrNode;
};

export type AdsrNode = AudioWorkletNode & {
  gate: AudioParam;
  attack: AudioParam;
  decay: AudioParam;
  sustain: AudioParam;
  release: AudioParam;
};
