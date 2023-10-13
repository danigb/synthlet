import {
  GenerateNodeOptions,
  GenerateNodeType,
  loadWorkletProcessor,
  workletNodeConstructor,
} from "../worklet-utils";
import { ImpulseParams } from "./impulse";
import { PROCESSOR } from "./processor";

export const loadImpulseNode = loadWorkletProcessor(PROCESSOR);
export type ImpulseOptions = GenerateNodeOptions<typeof ImpulseParams>;
export type ImpulseNode = GenerateNodeType<typeof ImpulseParams>;

export const Impulse = workletNodeConstructor<ImpulseNode, ImpulseOptions>(
  "ImpulseWorklet",
  ImpulseParams
);
