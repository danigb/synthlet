import {
  GenerateNodeOptions,
  GenerateNodeType,
  createProcessorLoader,
  createWorkletConstructor,
} from "../worklet-utils";
import { MikaParams } from "./mika";
import { PROCESSOR } from "./processor";

export const loadMikaNode = createProcessorLoader(PROCESSOR);
export type MikaOptions = GenerateNodeOptions<typeof MikaParams>;
export type MikaNode = GenerateNodeType<typeof MikaParams>;

export const Mika = createWorkletConstructor<MikaNode, MikaOptions>(
  "MikaWorklet",
  MikaParams
);
