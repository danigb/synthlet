import {
  GenerateNodeOptions,
  GenerateNodeType,
  createConstructor,
  createLoader,
  loadWorklet,
} from "../worklet-utils";
import { KarplusStrongOscillatorParams } from "./karplus-strong-oscillator";
import { PROCESSOR } from "./processor";

export const loadKarplusStrongOscillatorProcessor = createLoader(PROCESSOR);
export type KarplusStrongOscillatorOptions = GenerateNodeOptions<
  typeof KarplusStrongOscillatorParams
>;
export type KarplusStrongOscillatorNode = GenerateNodeType<
  typeof KarplusStrongOscillatorParams
>;

export const KarplusStrongOscillator = createConstructor<
  KarplusStrongOscillatorNode,
  KarplusStrongOscillatorOptions
>("KarplusStrongOscillatorWorklet", KarplusStrongOscillatorParams);

export const loadKarplusStrongOscillator = loadWorklet(
  loadKarplusStrongOscillatorProcessor,
  KarplusStrongOscillator
);
