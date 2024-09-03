import { PROCESSOR } from "./processor";

type ParamInput = number | ((param: AudioParam) => void);

export type ClockInputParams = {
  bpm: ParamInput;
};

export type ClockWorkletNode = AudioWorkletNode & {
  bpm: AudioParam;
};

const PARAM_NAMES = ["bpm"] as const;

export function getProcessorName() {
  return "ClockWorkletProcessor"; // Can't import from worklet because globals
}

export function getWorkletUrl() {
  const blob = new Blob([PROCESSOR], { type: "application/javascript" });
  return URL.createObjectURL(blob);
}

export function createClock(
  audioContext: AudioContext,
  params: Partial<ClockInputParams> = {}
): ClockWorkletNode {
  const node = new AudioWorkletNode(audioContext, getProcessorName(), {
    numberOfInputs: 0,
    numberOfOutputs: 1,
    processorOptions: {},
  }) as ClockWorkletNode;

  for (const paramName of PARAM_NAMES) {
    const param = node.parameters.get(paramName)!;
    const value = params[paramName as keyof ClockInputParams];
    if (typeof value === "number") param.value = value;
    if (typeof value === "function") value(param);
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

/**
 * Register the AudioWorklet processor in the AudioContext.
 * No matter how many times is called, it will register only once.
 *
 * @param audioContext
 * @returns A promise that resolves when the processor is registered
 */
export function registerClockWorkletOnce(
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
  return (audioContext.audioWorklet as any).__SYNTHLET_CLOCK_REGISTERED__;
}

function register(audioContext: AudioContext): Promise<void> {
  (audioContext.audioWorklet as any).__SYNTHLET_CLOCK_REGISTERED__ = true;
  return audioContext.audioWorklet.addModule(getWorkletUrl());
}
