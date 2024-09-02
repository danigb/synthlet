import { PROCESSOR } from "./processor";

export type ProcessorOptions = {
  type?: "white";
};

export type NoiseParams = {};

export type NoiseWorkletNode = AudioWorkletNode & {};

const PARAM_NAMES = [] as const;

export function getProcessorName() {
  return "NoiseWorkletProcessor"; // Can't import from worklet because globals
}

export function getWorkletUrl() {
  const blob = new Blob([PROCESSOR], { type: "application/javascript" });
  return URL.createObjectURL(blob);
}

/**
 * Register the AudioWorklet processor in the AudioContext.
 * No matter how many times is called, it will register only once.
 *
 * @param audioContext
 * @returns A promise that resolves when the processor is registered
 */
export function registerNoiseWorkletOnce(
  audioContext: AudioContext
): Promise<void> {
  if (!isSupported(audioContext)) throw Error("AudioWorklet not supported");
  return isRegistered(audioContext)
    ? Promise.resolve()
    : register(audioContext);
}

/**
 * Create a white noise AudioWorkletNode.
 *
 * @param audioContext - The AudioContext
 * @returns NoiseAudioWorkletNode
 */
export function createWhiteNoise(audioContext: AudioContext): AudioWorkletNode {
  return createWorkletNode(audioContext, { type: "white" });
}

function createWorkletNode(
  audioContext: AudioContext,
  processorOptions: ProcessorOptions,
  params: Partial<NoiseParams> = {}
): AudioWorkletNode {
  const node = new AudioWorkletNode(audioContext, getProcessorName(), {
    numberOfInputs: 1,
    numberOfOutputs: 1,
    processorOptions,
  }) as NoiseWorkletNode;

  let _disconnect = node.disconnect.bind(node);
  node.disconnect = (param?, output?, input?) => {
    node.port.postMessage({ type: "DISCONNECT" });
    // @ts-ignore
    return _disconnect(param, output, input);
  };

  return node;
}

function isSupported(audioContext: AudioContext): boolean {
  return (
    audioContext.audioWorklet &&
    typeof audioContext.audioWorklet.addModule === "function"
  );
}

function isRegistered(audioContext: AudioContext): boolean {
  return (audioContext.audioWorklet as any).__SYNTHLET_NOISE_REGISTERED__;
}

function register(audioContext: AudioContext): Promise<void> {
  (audioContext.audioWorklet as any).__SYNTHLET_NOISE_REGISTERED__ = true;
  return audioContext.audioWorklet.addModule(getWorkletUrl());
}
