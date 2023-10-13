import {
  GenerateNodeOptions,
  GenerateNodeType,
  loadWorklet,
  loadWorkletNode,
  workletNodeConstructor,
} from "../worklet-utils";
import { PROCESSOR } from "./processor";
import { PARAMS } from "./va-oscillator";

export {
  VA_OSCILLATOR_WAVEFORM_NAMES,
  VaOscillatorWaveform,
} from "./va-oscillator";

export const loadVaOscillator = loadWorklet<
  VaOscillatorNode,
  VaOscillatorOptions
>(PROCESSOR, "VaOscillatorWorklet", PARAMS);

export const loadVaOscillatorNode = loadWorkletNode(PROCESSOR);
export type VaOscillatorOptions = GenerateNodeOptions<typeof PARAMS>;
export type VaOscillatorNode = GenerateNodeType<typeof PARAMS>;

export const VaOscillator = workletNodeConstructor<
  VaOscillatorNode,
  VaOscillatorOptions
>("VaOscillatorWorklet", PARAMS);
