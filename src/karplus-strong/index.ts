import {
  GenerateNodeOptions,
  GenerateNodeType,
  loadWorklet,
  workletNodeConstructor,
} from "../worklet-utils";
import { PROCESSOR } from "./processor";
import { KarplusStrongOscillatorParams } from "./worklet";

export const loadKarplusStrongOscillator = loadWorklet(PROCESSOR);
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
