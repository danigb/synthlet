import { LfoWaveform } from "./lfo";
import {
  getLfoWaveformTypes,
  lfoWaveformFromType,
  lfoWaveformToType,
  LfoWaveformType,
} from "./lfo_waveform_type";
import { PROCESSOR } from "./processor";

export const PROCESSOR_NAME = "LfoProcessor";

export { getLfoWaveformTypes, LfoWaveform, PROCESSOR };
export type { LfoWaveformType };

export type LfoWorklet = AudioWorkletNode & {
  waveform: AudioParam;
  frequency: AudioParam;
  gain: AudioParam;
  offset: AudioParam;
  type: LfoWaveformType;
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

  Object.defineProperty(node, "type", {
    get() {
      return lfoWaveformToType(this.waveform.value);
    },
    set(value: string) {
      const waveform = lfoWaveformFromType(value);
      if (waveform !== undefined) this.waveform.setValueAtTime(waveform, 0);
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
