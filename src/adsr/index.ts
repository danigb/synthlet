import { addParams, loadWorklet } from "../worklet-utils";
import { PROCESSOR as ADSR } from "./processor";

export const loadAdsr = loadWorklet(ADSR, (context) => {
  return context;
});

export const createAdsr = (context: AudioContext): AdsrNode => {
  const node = new AudioWorkletNode(context, "AdsrWorklet", {
    numberOfInputs: 1,
    numberOfOutputs: 1,
  });
  addParams(node, ["gate", "attack", "decay", "sustain", "release"]);

  return node as AdsrNode;
};

export type AdsrNode = AudioWorkletNode & {
  gate: AudioParam;
  attack: AudioParam;
  decay: AudioParam;
  sustain: AudioParam;
  release: AudioParam;
};
