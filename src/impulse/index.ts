import {
  GenerateNodeOptions,
  GenerateNodeType,
  createConstructor,
  createLoader,
  loadWorklet,
} from "../worklet-utils";
import { ImpulseParams } from "./impulse";
import { PROCESSOR } from "./processor";

export type ImpulseOptions = GenerateNodeOptions<typeof ImpulseParams>;
export type ImpulseNode = GenerateNodeType<typeof ImpulseParams>;

export const Impulse = createConstructor<ImpulseNode, ImpulseOptions>(
  "ImpulseWorklet",
  ImpulseParams
);
export const loadImpulseProcessor = createLoader(PROCESSOR);
export const loadImpulse = loadWorklet(loadImpulseProcessor, Impulse);
