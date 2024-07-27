import { PROCESSOR } from "./processor";

export type PolyblepWaveformType = "sine" | "sawtooth" | "square" | "triangle";

export type PolyblepOscillatorOptions = {
  type: PolyblepWaveformType;
  waveform: 0 | 1 | 2 | 3;
  frequency: number;
};

type PolyblepOscillatorParams = {
  waveform: number;
  frequency: number;
};

export function getPolyblepOscillatorProcessorName() {
  return "PolyBLEPWorkletProcessor"; // Can't import from worklet because globals
}

const PARAM_NAMES = ["waveform", "frequency"] as const;

/**
 * A PolyBLEP Oscillator AudioWorkletNode
 */
export type PolyblepOscillatorWorkletNode = AudioWorkletNode & {
  type: PolyblepWaveformType;
  waveform: AudioParam;
  frequency: AudioParam;
};

function getWorkletUrl() {
  const blob = new Blob([PROCESSOR], { type: "application/javascript" });
  return URL.createObjectURL(blob);
}

/**
 * Create a PolyblepOscillator worklet node
 * @param audioContext
 * @param options
 * @returns PolyblepOscillatorWorkletNode
 */
export function createPolyblepOscillator(
  audioContext: AudioContext,
  options: Partial<PolyblepOscillatorOptions> = {}
): PolyblepOscillatorWorkletNode {
  const params = optionsToParams(options);
  const node = new AudioWorkletNode(
    audioContext,
    getPolyblepOscillatorProcessorName(),
    {
      numberOfInputs: 1,
      numberOfOutputs: 1,
    }
  ) as PolyblepOscillatorWorkletNode;

  for (const paramName of PARAM_NAMES) {
    const param = node.parameters.get(paramName)!;
    node[paramName] = param;
    const value = params[paramName as keyof PolyblepOscillatorParams];
    param.setValueAtTime(value, 0);
  }

  Object.defineProperty(node, "type", {
    get() {
      return waveformToType(this.waveform.value);
    },
    set(value: string) {
      let waveform = typeToWaveform(value);
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
 * Register the PolyBLEP Oscillator AudioWorklet processor in the AudioContext.
 * No matter how many times is called, it will register only once.
 *
 * @param audioContext
 * @returns A promise that resolves when the processor is registered
 */
export function registerPolyblepOscillatorWorkletOnce(
  audioContext: AudioContext
): Promise<void> {
  if (!isSupported(audioContext)) throw Error("AudioWorklet not supported");
  return isRegistered(audioContext)
    ? Promise.resolve()
    : register(audioContext);
}

//// UTILITIES ////

function typeToWaveform(type?: string): number | undefined {
  return type === "sine"
    ? 0
    : type === "sawtooth"
    ? 1
    : type === "square"
    ? 2
    : type === "triangle"
    ? 3
    : undefined;
}

function waveformToType(waveform: number): string | undefined {
  return waveform === 0
    ? "sine"
    : waveform === 1
    ? "sawtooth"
    : waveform === 2
    ? "square"
    : waveform === 3
    ? "triangle"
    : undefined;
}

function optionsToParams(
  options: Partial<PolyblepOscillatorOptions>
): PolyblepOscillatorParams {
  if (options.type !== undefined && options.waveform !== undefined) {
    throw Error(
      "PolyblepOscillator error - only waveform or type can be defined in options"
    );
  }
  const frequency =
    typeof options.frequency === "number" ? options.frequency : 440;

  const waveform =
    typeof options.waveform === "number"
      ? options.waveform
      : typeToWaveform(options.type) ?? 1;

  return { frequency, waveform };
}

function isSupported(audioContext: AudioContext): boolean {
  return (
    audioContext.audioWorklet &&
    typeof audioContext.audioWorklet.addModule === "function"
  );
}

function isRegistered(audioContext: AudioContext): boolean {
  return (audioContext.audioWorklet as any).__SYNTHLET_POLYBLEP_REGISTERED__;
}

function register(audioContext: AudioContext): Promise<void> {
  (audioContext.audioWorklet as any).__SYNTHLET_POLYBLEP_REGISTERED__ = true;
  return audioContext.audioWorklet.addModule(getWorkletUrl());
}
