import {
  GenerateNodeOptions,
  GenerateNodeType,
  createProcessorLoader,
  createWorkletConstructor,
  loadWorklet,
} from "../worklet-utils";
import { ImpulseParams } from "./impulse";
import { PROCESSOR } from "./processor";

export const loadImpulseNode = createProcessorLoader(PROCESSOR);
export type ImpulseOptions = GenerateNodeOptions<typeof ImpulseParams>;
export type ImpulseNode = GenerateNodeType<typeof ImpulseParams>;

export const Impulse = createWorkletConstructor<ImpulseNode, ImpulseOptions>(
  "ImpulseWorklet",
  ImpulseParams
);

export const loadImpulse = loadWorklet(loadImpulseNode, Impulse);
