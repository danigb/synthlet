import { PROCESSOR } from "../impulse/processor";
import {
  GenerateNodeOptions,
  GenerateNodeType,
  loadWorklet,
  workletNodeConstructor,
} from "../utils";
import { ImpulseParams } from "./impulse";

export const loadImpulse = loadWorklet(PROCESSOR);
export type ImpulseOptions = GenerateNodeOptions<typeof ImpulseParams>;
export type ImpulseNode = GenerateNodeType<typeof ImpulseParams>;

export const Impulse = workletNodeConstructor<ImpulseNode, ImpulseOptions>(
  "ImpulseWorklet",
  ImpulseParams
);
