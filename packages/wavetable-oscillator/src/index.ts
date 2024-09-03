import { createRegistrar, createWorkletConstructor } from "./_worklet";
import { PROCESSOR } from "./processor";
import { Wavetable, WavetableLoader } from "./wavetable-loader";

export { WavetableLoader } from "./wavetable-loader";

export type WavetableParams = {
  baseFrequency: number;
  frequency: number;
  morphFrequency: number;
};

export type WavetableOscillatorWorkletNode = AudioWorkletNode & {
  baseFrequency: AudioParam;
  frequency: AudioParam;
  morphFrequency: AudioParam;
  setWavetable: (wavetable: Float32Array, wavetableLength: number) => void;
};

export const registerWavetableOscillatorWorkletOnce = createRegistrar(
  "WT_OSC",
  PROCESSOR
);

export const creteWavetableOscillatorNode = createWorkletConstructor<
  WavetableOscillatorWorkletNode,
  WavetableParams
>({
  processorName: "WavetableOscillatorWorkletProcessor",
  paramNames: ["baseFrequency", "frequency", "morphFrequency"] as const,
  workletOptions: () => ({
    numberOfInputs: 0,
    numberOfOutputs: 1,
  }),
  postCreate(node) {
    node.setWavetable = (wavetable, wavetableLength) => {
      node.port.postMessage({
        type: "WAVETABLE",
        wavetable,
        wavetableLength,
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
