import { GenerateNodeType, addParams, loadWorklet } from "../worklet-utils";
import { PROCESSOR } from "./processor";
import { WtOscillatorParamsDef } from "./wt-oscillator";

export const loadWtOscillator = loadWorklet(PROCESSOR);
export type WtOscillatorOptions = {
  source: AudioBuffer;
  gate?: number;
  speed?: number;
};
export type WtOscillatorNode = GenerateNodeType<typeof WtOscillatorParamsDef>;

export const WtOscillator = (
  context: AudioContext,
  options: WtOscillatorOptions
) => {
  const node = new AudioWorkletNode(context, "WtOscillatorWorklet", {
    numberOfInputs: 1,
    numberOfOutputs: 1,
  });
  addParams(node, WtOscillatorParamsDef);

  const audioBuffer = options.source;
  const channelData = audioBuffer.getChannelData(0);
  console.log("Channel", channelData.length);
  node.port.postMessage({ type: "WAVE_TABLE", buffer: channelData });
  node.port.onmessage = (event) => {
    console.log("RECEIVED", event.data);
  };
  console.log("Created");
  return node as WtOscillatorNode;
};
