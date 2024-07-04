import { PROCESSOR } from "./processor";
import { Wavetable, WavetableLoader } from "./wavetable-loader";

export type ProcessorOptions = {};

export type WavetableParams = {
  baseFrequency: number;
  frequency: number;
  morphFrequency: number;
};

export type WavetableWorkletNode = AudioWorkletNode & {
  baseFrequency: AudioParam;
  frequency: AudioParam;
  morphFrequency: AudioParam;
  setWavetable: (wavetable: Float32Array, wavetableLength: number) => void;
};

const PARAM_NAMES = ["baseFrequency", "frequency", "morphFrequency"] as const;

export function getProcessorName() {
  return "WavetableWorkletProcessor"; // Can't import from worklet because globals
}

export function getWorkletUrl() {
  const blob = new Blob([PROCESSOR], { type: "application/javascript" });
  return URL.createObjectURL(blob);
}

/**
 * Load a wavetable
 * @param url
 * @param wavetableLength
 */
export function loadWavetable(
  nameOrUrl: string,
  wavetableLength = 256
): Promise<Wavetable> {
  const url = nameOrUrl.startsWith("http")
    ? nameOrUrl
    : `https://smpldsnds.github.io/wavedit-online/samples/${nameOrUrl.toUpperCase()}.WAV`;
  return new WavetableLoader(url, wavetableLength).onLoad();
}

function isSupported(audioContext: AudioContext): boolean {
  return (
    audioContext.audioWorklet &&
    typeof audioContext.audioWorklet.addModule === "function"
  );
}

function isRegistered(audioContext: AudioContext): boolean {
  return (audioContext.audioWorklet as any).__SYNTHLET_ADSR_REGISTERED__;
}

function register(audioContext: AudioContext): Promise<void> {
  (audioContext.audioWorklet as any).__SYNTHLET_ADSR_REGISTERED__ = true;
  return audioContext.audioWorklet.addModule(getWorkletUrl());
}

/**
 * Register the AudioWorklet processor in the AudioContext.
 * No matter how many times is called, it will register only once.
 *
 * @param audioContext
 * @returns A promise that resolves when the processor is registered
 */
export function registerWavetableOscillatorWorkletOnce(
  audioContext: AudioContext
): Promise<void> {
  if (!isSupported(audioContext)) throw Error("AudioWorklet not supported");
  return isRegistered(audioContext)
    ? Promise.resolve()
    : register(audioContext);
}

/**
 * Creates a Wavetable Oscillator node.
 */
export function createWavetableOscillatorNode() {}

function createWorkletNode(
  audioContext: AudioContext,
  processorOptions: ProcessorOptions,
  params: Partial<WavetableParams> = {}
): AudioWorkletNode {
  const node = new AudioWorkletNode(audioContext, getProcessorName(), {
    numberOfInputs: 1,
    numberOfOutputs: 1,
    processorOptions,
  }) as WavetableWorkletNode;

  for (const paramName of PARAM_NAMES) {
    const param = node.parameters.get(paramName)!;
    const value = params[paramName as keyof WavetableParams];
    if (typeof value === "number") param.value = value;
    node[paramName] = param;
  }

  node.setWavetable = (wavetable, wavetableLength) => {
    node.port.postMessage({
      type: "WAVETABLE",
      wavetable,
      wavetableLength,
    });
  };

  let _disconnect = node.disconnect.bind(node);
  node.disconnect = (param?, output?, input?) => {
    node.port.postMessage({ type: "DISCONNECT" });
    // @ts-ignore
    return _disconnect(param, output, input);
  };
  return node;
}
