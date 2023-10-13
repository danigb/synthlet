import {
  GenerateNodeType,
  addParams,
  createProcessorLoader,
  loadWorklet,
} from "../worklet-utils";
import { PARAMS } from "./pcm-oscillator";
import { PROCESSOR } from "./processor";

export type PcmOscillatorOptions = {
  source: AudioBuffer;
  gate?: number;
  speed?: number;
};
export type PcmOscillatorNode = GenerateNodeType<typeof PARAMS>;

export const PcmOscillator = (
  context: AudioContext,
  options: PcmOscillatorOptions
) => {
  const node = new AudioWorkletNode(context, "PcmOscillatorWorklet", {
    numberOfInputs: 1,
    numberOfOutputs: 1,
  });
  addParams(node, PARAMS);

  const audioBuffer = options.source;
  const channelData = audioBuffer.getChannelData(0);
  node.port.postMessage({ type: "AUDIO", buffer: channelData });
  node.port.onmessage = (event) => {
    console.log("RECEIVED", event.data);
  };
  return node as PcmOscillatorNode;
};
export const loadPcmOscillatorNode = createProcessorLoader(PROCESSOR);
export const loadPcmOscillator = loadWorklet(
  loadPcmOscillatorNode,
  PcmOscillator
);
