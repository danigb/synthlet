import {
  createRegistrar,
  createWorkletConstructor,
  ParamInput,
} from "./_worklet";
import { PROCESSOR } from "./processor";
import { Wavetable, WavetableLoader } from "./wavetable-loader";

export { Wavetable } from "./wavetable-loader";

export type WavetableInputs = {
  baseFrequency?: ParamInput;
  frequency?: ParamInput;
  morphFrequency?: ParamInput;
};

export type WavetableOscillatorWorkletNode = AudioWorkletNode & {
  baseFrequency: AudioParam;
  frequency: AudioParam;
  morphFrequency: AudioParam;
  loadWavetable(urlOrName: string): Promise<void>;
  fetchWavetableNames(): Promise<string[]>;
  setWavetable(wavetable: { data: Float32Array; length: number }): void;
  dispose(): void;
};

export const registerWavetableOscillatorWorklet = createRegistrar(
  "WT",
  PROCESSOR
);

export const createWavetableOscillatorNode = createWorkletConstructor<
  WavetableOscillatorWorkletNode,
  WavetableInputs
>({
  processorName: "WavetableOscillatorWorkletProcessor",
  paramNames: ["baseFrequency", "frequency", "morphFrequency"] as const,
  workletOptions: () => ({
    numberOfInputs: 0,
    numberOfOutputs: 1,
  }),
  postCreate(node) {
    node.setWavetable = (wavetable) => {
      node.port.postMessage({
        type: "WAVETABLE",
        wavetable: wavetable.data,
        length: wavetable.length,
      });
    };
    node.fetchWavetableNames = fetchWavetableNames;
    node.loadWavetable = (urlOrName) =>
      loadWavetable(urlOrName).then((wavetable) => {
        node.setWavetable(wavetable);
      });
  },
});

export function loadWavetable(
  nameOrUrl: string,
  wavetableLength = 256
): Promise<Wavetable> {
  const url = nameOrUrl.startsWith("http")
    ? nameOrUrl
    : `https://smpldsnds.github.io/wavedit-online/samples/${nameOrUrl.toUpperCase()}.WAV`;
  return new WavetableLoader(url, wavetableLength).onLoad();
}

export function fetchWavetableNames(): Promise<string[]> {
  return WavetableLoader.fetchAvailableNames();
}

const op = (inputs: WavetableInputs) => {
  let node: WavetableOscillatorWorkletNode;
  return (context: AudioContext) => {
    node ??= createWavetableOscillatorNode(context, inputs);
    return node;
  };
};

export const WavetableOscillator = Object.assign(op, {});
