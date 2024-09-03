import { PROCESSOR } from "./processor";

export type ProcessorOptions = {
  type?: "white";
};

type ParamInput = number | ((param: AudioParam) => void);

export type ChorusInputParams = {
  enable1: ParamInput;
  enable2: ParamInput;
  lfoRate1: ParamInput;
  lfoRate2: ParamInput;
};

export type ChorusWorkletNode = AudioWorkletNode & {
  bypass: AudioParam;
  enable1: AudioParam;
  enable2: AudioParam;
  lfoRate1: AudioParam;
  lfoRate2: AudioParam;
  setBypass(value: boolean): void;
};

const PARAM_NAMES = [
  "bypass",
  "enable1",
  "enable2",
  "lfoRate1",
  "lfoRate2",
] as const;

function getProcessorName() {
  return "ChorusWorkletProcessor"; // Can't import from worklet because globals
}

function getWorkletUrl() {
  const blob = new Blob([PROCESSOR], { type: "application/javascript" });
  return URL.createObjectURL(blob);
}

export function createChorusT(
  audioContext: AudioContext,
  params: Partial<ChorusInputParams> = {}
): ChorusWorkletNode {
  const node = new AudioWorkletNode(audioContext, getProcessorName(), {
    numberOfInputs: 1,
    numberOfOutputs: 1,
    outputChannelCount: [2],
    processorOptions: {},
  }) as ChorusWorkletNode;

  for (const paramName of PARAM_NAMES) {
    const param = node.parameters.get(paramName)!;
    const value = params[paramName as keyof ChorusInputParams];
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

  node.setBypass = (value: boolean) => {
    node.bypass.value = value ? 1 : 0;
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
export function registerChorusTWorkletOnce(
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
