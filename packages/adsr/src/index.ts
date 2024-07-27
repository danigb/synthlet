import { PROCESSOR } from "./processor";

export type ProcessorOptions = {
  mode?: "generator" | "modulator";
};

export type AdsrParams = {
  gate: number;
  attack: number;
  decay: number;
  sustain: number;
  release: number;
  offset: number;
  gain: number;
};

export type AdsrWorkletNode = AudioWorkletNode & {
  gate: AudioParam;
  attack: AudioParam;
  decay: AudioParam;
  sustain: AudioParam;
  release: AudioParam;
  offset: AudioParam;
  gain: AudioParam;
  gateOn: (time?: number) => void;
  gateOff: (time?: number) => void;
};

const PARAM_NAMES = [
  "gate",
  "attack",
  "decay",
  "sustain",
  "release",
  "offset",
  "gain",
] as const;

export function getProcessorName() {
  return "AdsrWorkletProcessor"; // Can't import from worklet because globals
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
export function registerAdsrWorkletOnce(
  audioContext: AudioContext
): Promise<void> {
  if (!isSupported(audioContext)) throw Error("AudioWorklet not supported");
  return isRegistered(audioContext)
    ? Promise.resolve()
    : register(audioContext);
}

/**
 * Create a VCA (Voltage Controller Amplifier) AudioWorkletNode.
 * It can be used to modulate amplitude of another signal.
 *
 * @param audioContext - The AudioContext
 * @returns AudioWorkletNode
 * @example
 * ```
 * const osc = audioContext.createOscillator();
 * osc.start();
 * const vca = createVCA(audioContext);
 * osc.connect(vca).connect(audioContext.destination);
 * vca.gateOn();
 * vca.gateOff(audioContext.now + 1)
 *
 * ```
 */
export function createVca(
  audioContext: AudioContext,
  params?: Partial<AdsrParams>
): AudioWorkletNode {
  return createWorkletNode(audioContext, { mode: "modulator" });
}

/**
 * Create a ADSR AudioWorkletNode.
 * It can be used to modulate other parameters
 * @param audioContext
 * @returns
 */
export function createAdsr(
  audioContext: AudioContext,
  params?: Partial<AdsrParams>
): AudioWorkletNode {
  return createWorkletNode(audioContext, { mode: "generator" }, params);
}

function createWorkletNode(
  audioContext: AudioContext,
  processorOptions: ProcessorOptions,
  params: Partial<AdsrParams> = {}
): AudioWorkletNode {
  const node = new AudioWorkletNode(audioContext, getProcessorName(), {
    numberOfInputs: 1,
    numberOfOutputs: 1,
    processorOptions,
  }) as AdsrWorkletNode;

  for (const paramName of PARAM_NAMES) {
    const param = node.parameters.get(paramName)!;
    const value = params[paramName as keyof AdsrParams];
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
