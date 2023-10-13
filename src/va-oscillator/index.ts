import {
  GenerateNodeOptions,
  GenerateNodeType,
  createConstructor,
  createLoader,
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

export const loadVaOscillatorNode = createLoader(PROCESSOR);
export const VaOscillator = createConstructor<
  VaOscillatorNode,
  VaOscillatorOptions
>("VaOscillatorWorklet", PARAMS);
export const loadVaOscillator = loadWorklet(loadVaOscillatorNode, VaOscillator);
