import {
  GenerateNodeOptions,
  GenerateNodeType,
  loadWorklet,
  loadWorkletProcessor,
  workletNodeConstructor,
} from "../worklet-utils";
import { PROCESSOR } from "./processor";
import { PARAMS } from "./va-oscillator";

export {
  VA_OSCILLATOR_WAVEFORM_NAMES,
  VaOscillatorWaveform,
} from "./va-oscillator";

export const loadVaOscillatorNode = loadWorkletProcessor(PROCESSOR);
export const loadVaOscillator = loadWorklet<
  VaOscillatorNode,
  VaOscillatorOptions
>(loadVaOscillatorNode, "VaOscillatorWorklet", PARAMS);

export type VaOscillatorOptions = GenerateNodeOptions<typeof PARAMS>;
export type VaOscillatorNode = GenerateNodeType<typeof PARAMS>;

export const VaOscillator = workletNodeConstructor<
  VaOscillatorNode,
  VaOscillatorOptions
>("VaOscillatorWorklet", PARAMS);
