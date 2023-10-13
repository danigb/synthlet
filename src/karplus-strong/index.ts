import {
  GenerateNodeOptions,
  GenerateNodeType,
  loadWorkletProcessor,
  workletNodeConstructor,
} from "../worklet-utils";
import { KarplusStrongOscillatorParams } from "./karplus-strong-oscillator";
import { PROCESSOR } from "./processor";

export const loadKarplusStrongOscillatorNode = loadWorkletProcessor(PROCESSOR);
export type KarplusStrongOscillatorOptions = GenerateNodeOptions<
  typeof KarplusStrongOscillatorParams
>;
export type KarplusStrongOscillatorNode = GenerateNodeType<
  typeof KarplusStrongOscillatorParams
>;

export const KarplusStrongOscillator = workletNodeConstructor<
  KarplusStrongOscillatorNode,
  KarplusStrongOscillatorOptions
>("KarplusStrongOscillatorWorklet", KarplusStrongOscillatorParams);
