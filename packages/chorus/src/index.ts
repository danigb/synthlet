import { PROCESSOR } from "./processor";

export type ProcessorOptions = {
  type?: "white";
};

export type ChorusParams = {};

export type ChorusWorkletNode = AudioWorkletNode & {};

const PARAM_NAMES = [] as const;

export function getProcessorName() {
  return "ChorusWorkletProcessor"; // Can't import from worklet because globals
}

export function getWorkletUrl() {
  const blob = new Blob([PROCESSOR], { type: "application/javascript" });
  return URL.createObjectURL(blob);
}

export function createChorus(
  audioContext: AudioContext,
  params: Partial<ChorusParams> = {}
): AudioWorkletNode {
  const node = new AudioWorkletNode(audioContext, getProcessorName(), {
    numberOfInputs: 1,
    numberOfOutputs: 1,
    processorOptions: {},
  }) as ChorusWorkletNode;

  let _disconnect = node.disconnect.bind(node);
  node.disconnect = (param?, output?, input?) => {
    node.port.postMessage({ type: "DISCONNECT" });
    // @ts-ignore
    return _disconnect(param, output, input);
  };

  return node;
}

/**
 * Register the AudioWorklet processor in the AudioContext.
 * No matter how many times is called, it will register only once.
 *
 * @param audioContext
 * @returns A promise that resolves when the processor is registered
 */
export function registerChorusWorkletOnce(
  audioContext: AudioContext
): Promise<void> {
  if (!isSupported(audioContext)) throw Error("AudioWorklet not supported");
  return isRegistered(audioContext)
    ? Promise.resolve()
    : register(audioContext);
}

function isSupported(audioContext: AudioContext): boolean {
  return (
    audioContext.audioWorklet &&
    typeof audioContext.audioWorklet.addModule === "function"
  );
}

function isRegistered(audioContext: AudioContext): boolean {
  return (audioContext.audioWorklet as any).__SYNTHLET_CHORUS_REGISTERED__;
}

function register(audioContext: AudioContext): Promise<void> {
  (audioContext.audioWorklet as any).__SYNTHLET_CHORUS_REGISTERED__ = true;
  return audioContext.audioWorklet.addModule(getWorkletUrl());
}
