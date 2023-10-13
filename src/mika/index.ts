import {
  GenerateNodeOptions,
  GenerateNodeType,
  createConstructor,
  createLoader,
} from "../worklet-utils";
import { MikaParams } from "./mika";
import { PROCESSOR } from "./processor";

export const loadMikaNode = createLoader(PROCESSOR);
export type MikaOptions = GenerateNodeOptions<typeof MikaParams>;
export type MikaNode = GenerateNodeType<typeof MikaParams>;

export const Mika = createConstructor<MikaNode, MikaOptions>(
  "MikaWorklet",
  MikaParams
);
