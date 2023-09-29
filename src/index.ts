import { PROCESSOR as ADSR } from "./adsr/processor";
import { loadWorklet } from "./createWorklet";

export const loadAdsr = loadWorklet(ADSR, (context) => {
  return context;
});
export const createAdsr = (context: AudioContext): AdsrNode => {
  console.log("JODER");
  const node = new AudioWorkletNode(context, "AdsrWorklet", {
    numberOfInputs: 1,
    numberOfOutputs: 1,
  });

  Object.defineProperty(node, "gate", {
    get() {
      return node.parameters.get("gate");
    },
  });
  return node as AdsrNode;
};

export type AdsrNode = AudioWorkletNode & { gate: AudioParam };
