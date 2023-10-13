import {
  GenerateNodeType,
  addDisconnect,
  addParams,
  createLoader,
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
  options?: PcmOscillatorOptions
) => {
  const node = new AudioWorkletNode(context, "PcmOscillatorWorklet", {
    numberOfInputs: 1,
    numberOfOutputs: 1,
  });
  addParams(node, PARAMS);
  addDisconnect(node);

  if (options) {
    const audioBuffer = options.source;
    const channelData = audioBuffer.getChannelData(0);
    node.port.postMessage({ type: "AUDIO", buffer: channelData });
  }

  return node as PcmOscillatorNode;
};
export const loadPcmOscillatorProcessor = createLoader(PROCESSOR);
export const loadPcmOscillator = loadWorklet(
  loadPcmOscillatorProcessor,
  PcmOscillator
);
