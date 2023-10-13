import {
  GenerateNodeOptions,
  GenerateNodeType,
  loadWorkletNode,
  workletNodeConstructor,
} from "../worklet-utils";
import { PROCESSOR } from "./processor";
import { PARAMS } from "./sequencer";

export const loadSequencerNode = loadWorkletNode(PROCESSOR);

export type SequencerOptions = GenerateNodeOptions<typeof PARAMS>;

export type SequencerNode = GenerateNodeType<typeof PARAMS>;

export const Sequencer = workletNodeConstructor<
  SequencerNode,
  SequencerOptions
>("SequencerWorklet", PARAMS);
