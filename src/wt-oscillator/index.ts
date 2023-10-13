import { GenerateNodeType, addParams, loadWorklet } from "../worklet-utils";
import { PROCESSOR } from "./processor";
import { WtOscillatorParamsDef } from "./wt-oscillator";

export { decodeWavetable } from "./decode-wavetable";

export const loadWtOscillator = loadWorklet(PROCESSOR);

// FIXME: This is not working. Don't know why
// export type WtOscillatorOptions = GenerateNodeOptions<
//   typeof WtOscillatorParamsDef
// > & {
//   source: AudioBuffer;
// };

export type WtOscillatorOptions = {
  source: AudioBuffer;
  frequency?: number;
  morphFrequency?: number;
};
export type WtOscillatorNode = GenerateNodeType<typeof WtOscillatorParamsDef>;

export const WtOscillator = (
  context: AudioContext,
  options: WtOscillatorOptions
) => {
  const node = new AudioWorkletNode(context, "WtOscillatorWorklet", {
    numberOfInputs: 0,
    numberOfOutputs: 1,
  });
  addParams(node, WtOscillatorParamsDef);

  const _disconnect = node.disconnect.bind(node);
  (node as any).disconnect = (output: any) => {
    _disconnect(output);
    if (!output) {
      node.port.postMessage({ type: "STOP" });
    }
  };

  const audioBuffer = options.source;
  const channelData = audioBuffer.getChannelData(0);
  node.port.postMessage({ type: "WAVE_TABLE", buffer: channelData });
  return node as WtOscillatorNode;
};
