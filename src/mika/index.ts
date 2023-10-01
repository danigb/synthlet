import {
  GenerateNodeOptions,
  GenerateNodeType,
  loadWorklet,
  workletNodeConstructor,
} from "../worklet-utils";
import { MikaParams } from "./mika";
import { PROCESSOR } from "./processor";

export const loadMika = loadWorklet(PROCESSOR);
export type MikaOptions = GenerateNodeOptions<typeof MikaParams>;
export type MikaNode = GenerateNodeType<typeof MikaParams>;

export const Mika = workletNodeConstructor<MikaNode, MikaOptions>(
  "MikaWorklet",
  MikaParams
);
