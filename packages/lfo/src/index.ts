import { LfoWaveform } from "./lfo";
import { PROCESSOR } from "./processor";

export const PROCESSOR_NAME = "LfoProcessor";
export { LfoWaveform, PROCESSOR };

export const LFO_TYPES = [
  "Impulse",
  "Sine",
  "Triangle",
  "RampUp",
  "RampDown",
  "Square",
  "ExpRampUp",
  "ExpRampDown",
  "ExpTriangle",
  "RandSampleHold",
] as const;

export type LfoWaveformType = (typeof LFO_TYPES)[number];

export type LfoWorklet = AudioWorkletNode & {
  waveform: AudioParam;
  frequency: AudioParam;
  gain: AudioParam;
  offset: AudioParam;
};

const PARAM_NAMES = ["waveform", "frequency", "gain", "offset"] as const;

export type LfoParams = {
  type?: String;
  waveform?: LfoWaveformType;
  frequency?: number;
  gain?: number;
  offset?: number;
};

let LC_TYPES: string[] | undefined;
/**
 * Get LfoWaveform number from a string or number
 * @param type
 * @returns
 */
export function getLfoWaveform(
  type: string | number | undefined
): number | undefined {
  LC_TYPES ??= LFO_TYPES.map((type) => type.toLowerCase());
  if (typeof type === "number") {
    return type >= 0 && type < LC_TYPES.length ? type : undefined;
  } else if (typeof type === "string") {
    const index = LC_TYPES.indexOf(type.toLowerCase() as LfoWaveformType);
    return index === -1 ? undefined : index;
  } else {
    return undefined;
  }
}

/**
 * Create a LFO AudioWorkletNode.
 * It can be used to modulate other parameters
 *
 * @param audioContext
 * @returns LfoWorkletNode
 */
export function createLfo(
  context: AudioContext,
  params: Partial<LfoParams> = {}
): LfoWorklet {
  const node = new AudioWorkletNode(context, PROCESSOR_NAME, {
    numberOfInputs: 1,
    numberOfOutputs: 1,
    processorOptions: {
      ...params,
    },
  }) as LfoWorklet;
  for (const paramName of PARAM_NAMES) {
    const param = node.parameters.get(paramName)!;
    const value = params[paramName as keyof LfoParams];
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

/**
 * Register the LFO AudioWorklet processor in the AudioContext.
 * No matter how many times is called, it will register only once.
 *
 * @param audioContext
 * @returns A promise that resolves when the processor is registered
 */
export function registerLfoWorkletOnce(
  audioContext: AudioContext
): Promise<void> {
  if (!isSupported(audioContext)) throw Error("AudioWorklet not supported");
  return isRegistered(audioContext)
    ? Promise.resolve()
    : register(audioContext);
}

function createWorkletUrl() {
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
  return (audioContext.audioWorklet as any).__SYNTHLET_LFO_REGISTERED__;
}

function register(audioContext: AudioContext): Promise<void> {
  (audioContext.audioWorklet as any).__SYNTHLET_LFO_REGISTERED__ = true;
  return audioContext.audioWorklet.addModule(createWorkletUrl());
}
