import {
  createRegistrar,
  createWorkletConstructor,
  ParamInput,
} from "./_worklet";
import { PROCESSOR } from "./processor";
import { Wavetable, WavetableLoader } from "./wavetable-loader";

export { Wavetable } from "./wavetable-loader";

export type WavetableInputParams = {
  baseFrequency: ParamInput;
  frequency: ParamInput;
  morphFrequency: ParamInput;
};

export type WavetableOscillatorWorkletNode = AudioWorkletNode & {
  baseFrequency: AudioParam;
  frequency: AudioParam;
  morphFrequency: AudioParam;
  setWavetable(wavetable: { data: Float32Array; length: number }): void;
  dispose(): void;
};

export const registerWavetableOscillatorWorkletOnce =
  createRegistrar(PROCESSOR);

export const createWavetableOscillatorNode = createWorkletConstructor<
  WavetableOscillatorWorkletNode,
  WavetableInputParams
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
