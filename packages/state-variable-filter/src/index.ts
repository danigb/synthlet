import { PROCESSOR } from "./processor";

export type StateVariableFilterOptions = {
  type: "bypass" | "lowpass" | "bandpass" | "hipass";
  filterType: number;
  frequency: number;
  resonance: number;
};
export type StateVariableFilterParams = {
  filterType: number;
  frequency: number;
  resonance: number;
};

export type StateVariableFilterWorkletNode = AudioWorkletNode & {
  type: string;
  filterType: AudioParam;
  frequency: AudioParam;
  resonance: AudioParam;
};

const PARAM_NAMES = ["filterType", "frequency", "resonance"] as const;

export function getStateVariableFilterProcessorName() {
  return "StateVariableFilterWorkletProcessor"; // Can't import from worklet because globals
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
  audioContext: AudioContext,
  options: Partial<StateVariableFilterOptions> = {}
): StateVariableFilterWorkletNode {
  const params = optionsToParams(options);
  const node = new AudioWorkletNode(
    audioContext,
    getStateVariableFilterProcessorName(),
    {
      numberOfInputs: 1,
      numberOfOutputs: 1,
    }
  ) as StateVariableFilterWorkletNode;

  for (const paramName of PARAM_NAMES) {
    const param = node.parameters.get(paramName)!;
    node[paramName] = param;
    const value = params[paramName as keyof StateVariableFilterParams];
    param.setValueAtTime(value, 0);
  }

  Object.defineProperty(node, "type", {
    get() {
      return filterTypeToType(this.filterType.value);
    },
    set(value: string) {
      const filterType = typeToFilterType(value);
      this.filterType.setValueAtTime(filterType, 0);
    },
  });

  let _disconnect = node.disconnect.bind(node);
  node.disconnect = (param?, output?, input?) => {
    node.port.postMessage({ type: "DISCONNECT" });
    // @ts-ignore
    return _disconnect(param, output, input);
  };
  return node;
}

function optionsToParams(
  options: Partial<StateVariableFilterOptions>
): StateVariableFilterParams {
  if (options.type !== undefined && options.filterType !== undefined) {
    throw Error(
      "PolyblepOscillator error - only filterType or type can be defined in options"
    );
  }

  const frequency =
    typeof options.frequency === "number" ? options.frequency : 4000;
  const resonance =
    typeof options.resonance === "number" ? options.resonance : 0.5;
  const filterType =
    typeof options.filterType === "number"
      ? options.filterType
      : typeToFilterType(options.type) || 1;

  return { frequency, resonance, filterType };
}

function filterTypeToType(filterType: number) {
  return filterType === 1
    ? "lowpass"
    : filterType === 2
    ? "bandpass"
    : filterType === 3
    ? "highpass"
    : "bypass";
}

function typeToFilterType(type?: string): number {
  return type === "lowpass"
    ? 1
    : type === "bandpass"
    ? 2
    : type === "highpass"
    ? 3
    : 0;
}
