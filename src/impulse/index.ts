import { PROCESSOR } from "../impulse/processor";
import { GenerateNodeType, addParams, loadWorklet } from "../utils";
import { ImpulseParams } from "./impulse";

export const loadImpulse = loadWorklet(PROCESSOR);

export const createImpulseNode = (context: AudioContext): ImpulseNode => {
  const node = new AudioWorkletNode(context, "ImpulseWorklet", {
    numberOfInputs: 0,
    numberOfOutputs: 1,
  });
  addParams(node, ImpulseParams);

  return node as ImpulseNode;
};

export type ImpulseNode = GenerateNodeType<typeof ImpulseParams>;
