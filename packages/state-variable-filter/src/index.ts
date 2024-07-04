import { PROCESSOR } from "./processor";

export type ProcessorOptions = {
  mode?: "generator" | "modulator";
};

export type StateVariableFilterParams = {
  frequency: number;
  resonance: number;
};

export type StateVariableFilterWorkletNode = AudioWorkletNode & {
  frequency: AudioParam;
  resonance: AudioParam;
};

const PARAM_NAMES = ["frequency", "resonance"] as const;

export function getProcessorName() {
  return "StateVariableFilterWorkletProcessor"; // Can't import from worklet because globals
}

export function getWorkletUrl() {
  const blob = new Blob([PROCESSOR], { type: "application/javascript" });
  return URL.createObjectURL(blob);
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
export function registerStateVariableFilterWorkletOnce(
  audioContext: AudioContext
): Promise<void> {
  if (!isSupported(audioContext)) throw Error("AudioWorklet not supported");
  return isRegistered(audioContext)
    ? Promise.resolve()
    : register(audioContext);
}

/**
 * Create a State Variable Filter worklet
 *
 * @param audioContext - The AudioContext
 * @returns StateVariableFilterAudioWorkletNode
 */
export function createStateVariableFilter(
  audioContext: AudioContext
): StateVariableFilterWorkletNode {
  return createWorkletNode(audioContext, {});
}

function createWorkletNode(
  audioContext: AudioContext,
  processorOptions: ProcessorOptions,
  params: Partial<StateVariableFilterParams> = {}
): StateVariableFilterWorkletNode {
  const node = new AudioWorkletNode(audioContext, getProcessorName(), {
    numberOfInputs: 1,
    numberOfOutputs: 1,
    processorOptions,
  }) as StateVariableFilterWorkletNode;

  for (const paramName of PARAM_NAMES) {
    const param = node.parameters.get(paramName)!;
    const value = params[paramName as keyof StateVariableFilterParams];
    if (typeof value === "number") param.value = value;
    node[paramName] = param;
  }
  let _disconnect = node.disconnect.bind(node);
  node.disconnect = (param?, output?, input?) => {
    node.port.postMessage({ type: "DISCONNECT" });
    // @ts-ignore
    return _disconnect(param, output, input);
  };
  return node;
}
