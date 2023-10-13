import {
  GenerateNodeOptions,
  GenerateNodeType,
  createProcessorLoader,
  createWorkletConstructor,
  loadWorklet,
} from "../worklet-utils";
import { PROCESSOR } from "./processor";
import { PARAMS } from "./va-oscillator";

// Export constants and enums
export {
  VA_OSCILLATOR_WAVEFORM_NAMES,
  VaOscillatorWaveform,
} from "./va-oscillator";

export type VaOscillatorOptions = GenerateNodeOptions<typeof PARAMS>;
export type VaOscillatorNode = GenerateNodeType<typeof PARAMS>;

export const loadVaOscillatorNode = createProcessorLoader(PROCESSOR);
export const VaOscillator = createWorkletConstructor<
  VaOscillatorNode,
  VaOscillatorOptions
>("VaOscillatorWorklet", PARAMS);
export const loadVaOscillator = loadWorklet(loadVaOscillatorNode, VaOscillator);
