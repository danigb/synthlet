import {
  GenerateNodeOptions,
  GenerateNodeType,
  addDisconnect,
  addParams,
  createProcessorLoader,
  setWorkletOptions,
} from "../worklet-utils";
import { PROCESSOR } from "./processor";
import { PARAMS } from "./wt-oscillator";

export * from "./load-wavetable";

export const loadWtOscillatorNode = createProcessorLoader(PROCESSOR);

export type WtOscillatorOptions = GenerateNodeOptions<typeof PARAMS>;

export type WtOscillatorNode = GenerateNodeType<typeof PARAMS> & {
  setWavetable: (wavetable: Float32Array, length: number) => void;
};

export const WtOscillator = (
  context: AudioContext,
  options: WtOscillatorOptions
) => {
  const node = new AudioWorkletNode(context, "WtOscillatorWorklet", {
    numberOfInputs: 0,
    numberOfOutputs: 1,
  });
  addParams(node, PARAMS);
  if (options) setWorkletOptions(options, node, PARAMS);
  addDisconnect(node);

  (node as any).setWavetable = (wavetable: Float32Array, length: number) => {
    node.port.postMessage({
      type: "WAVE_TABLE",
      data: wavetable,
      wavetableLength: length,
    });
  };

  return node as WtOscillatorNode;
};
