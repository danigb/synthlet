import { GenerateNodeType, addParams, loadWorkletNode } from "../worklet-utils";
import { PcmOscillatorParams } from "./pcm-oscillator";
import { PROCESSOR } from "./processor";

export const loadPcmOscillatorNode = loadWorkletNode(PROCESSOR);
export type PcmOscillatorOptions = {
  source: AudioBuffer;
  gate?: number;
  speed?: number;
};
export type PcmOscillatorNode = GenerateNodeType<typeof PcmOscillatorParams>;

export const PcmOscillator = (
  context: AudioContext,
  options: PcmOscillatorOptions
) => {
  const node = new AudioWorkletNode(context, "PcmOscillatorWorklet", {
    numberOfInputs: 1,
    numberOfOutputs: 1,
  });
  addParams(node, PcmOscillatorParams);

  const audioBuffer = options.source;
  const channelData = audioBuffer.getChannelData(0);
  node.port.postMessage({ type: "AUDIO", buffer: channelData });
  node.port.onmessage = (event) => {
    console.log("RECEIVED", event.data);
  };
  return node as PcmOscillatorNode;
};
