import {
  GenerateNodeOptions,
  GenerateNodeType,
  addDisconnect,
  addParams,
  loadWorklet,
  setWorkletOptions,
} from "../worklet-utils";
import { PROCESSOR } from "./processor";
import { WtOscillatorParamsDef } from "./wt-oscillator";

export * from "./load-wavetable";

export const loadWtOscillator = loadWorklet(PROCESSOR);

export type WtOscillatorOptions = GenerateNodeOptions<
  typeof WtOscillatorParamsDef
>;

export type WtOscillatorNode = GenerateNodeType<
  typeof WtOscillatorParamsDef
> & {
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
  addParams(node, WtOscillatorParamsDef);
  if (options) setWorkletOptions(options, node, WtOscillatorParamsDef);
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
