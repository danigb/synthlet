import {
  GenerateNodeOptions,
  GenerateNodeType,
  loadWorklet,
  workletNodeConstructor,
} from "../worklet-utils";
import { PROCESSOR } from "./processor";
import { VaOscillatorParams } from "./va-oscillator";

export {
  VA_OSCILLATOR_WAVEFORM_NAMES,
  VaOscillatorWaveform,
} from "./va-oscillator";

export const loadVaOscillator = loadWorklet(PROCESSOR);
export type VaOscillatorOptions = GenerateNodeOptions<
  typeof VaOscillatorParams
>;
export type VaOscillatorNode = GenerateNodeType<typeof VaOscillatorParams>;

export const VaOscillator = workletNodeConstructor<
  VaOscillatorNode,
  VaOscillatorOptions
>("VaOscillatorWorklet", VaOscillatorParams);
