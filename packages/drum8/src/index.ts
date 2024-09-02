import { PROCESSOR } from "./processor";

export type Drum8Params = {
  gate: number;
  attack: number;
  decay: number;
  hold: number;
};

/**
 * An ADSR WorkletNode
 */
export type Drum8WorkletNode = AudioWorkletNode & {
  gate: AudioParam;
  attack: AudioParam;
  decay: AudioParam;
  hold: AudioParam;
  gateOn: (time?: number) => void;
  gateOff: (time?: number) => void;
};

const PARAM_NAMES = ["gate", "attack", "decay", "hold"] as const;

export function getDrum8ProcessorName() {
  return "Drum8WorkletProcessor"; // Can't import from worklet because globals
}

function getWorkletUrl() {
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
  return (audioContext.audioWorklet as any).__SYNTHLET_DRUM8_REGISTERED__;
}

function register(audioContext: AudioContext): Promise<void> {
  (audioContext.audioWorklet as any).__SYNTHLET_DRUM8_REGISTERED__ = true;
  return audioContext.audioWorklet.addModule(getWorkletUrl());
}

/**
 * Register the AudioWorklet processor in the AudioContext.
 * No matter how many times is called, it will register only once.
 *
 * @param audioContext
 * @returns A promise that resolves when the processor is registered
 */
export function registerDrum8WorkletOnce(
  audioContext: AudioContext
): Promise<void> {
  if (!isSupported(audioContext)) throw Error("AudioWorklet not supported");
  return isRegistered(audioContext)
    ? Promise.resolve()
    : register(audioContext);
}

/**
 * Create a ADSR AudioWorkletNode.
 * It can be used to modulate other parameters
 * @param audioContext
 * @returns Drum8WorkletNode
 */

export function createDrum8(
  audioContext: AudioContext,
  params: Partial<Drum8Params> = {}
): Drum8WorkletNode {
  const node = new AudioWorkletNode(audioContext, getDrum8ProcessorName(), {
    numberOfInputs: 1,
    numberOfOutputs: 1,
    processorOptions: {},
  }) as Drum8WorkletNode;

  for (const paramName of PARAM_NAMES) {
    const param = node.parameters.get(paramName)!;
    const value = params[paramName as keyof Drum8Params];
    if (typeof value === "number") param.value = value;
    node[paramName] = param;
  }
  node.gateOn = (time = audioContext.currentTime) => {
    node.gate.setValueAtTime(1, time);
  };
  node.gateOff = (time = audioContext.currentTime) => {
    node.gate.setValueAtTime(0, time);
  };
  let _disconnect = node.disconnect.bind(node);
  node.disconnect = (param?, output?, input?) => {
    node.port.postMessage({ type: "DISCONNECT" });
    // @ts-ignore
    return _disconnect(param, output, input);
  };
  return node;
}
