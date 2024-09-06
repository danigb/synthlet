import {
  createRegistrar,
  createWorkletConstructor,
  ParamInput,
} from "./_worklet";
import { PROCESSOR } from "./processor";

export { Drum8Type } from "./instruments";

export type Drum8InputParams = {
  type: ParamInput;
  gate: ParamInput;
  attack: ParamInput;
  decay: ParamInput;
  level: ParamInput;
  tone: ParamInput;
  snap: ParamInput;
};

/**
 * An ADSR WorkletNode
 */
export type Drum8WorkletNode = AudioWorkletNode & {
  gate: AudioParam;
  attack: AudioParam;
  decay: AudioParam;
  level: AudioParam;
  tone: AudioParam;
  snap: AudioParam;
  setGate: (gate: boolean, time?: number) => void;
};

export const registerDrum8WorkletOnce = createRegistrar(PROCESSOR);

export const createDrum8Node = createWorkletConstructor<
  Drum8WorkletNode,
  Drum8InputParams
>({
  processorName: "Drum8WorkletProcessor",
  paramNames: ["type", "gate", "attack", "decay", "level", "snap", "tone"],
  workletOptions: () => ({
    numberOfInputs: 1,
    numberOfOutputs: 1,
  }),
  postCreate: (node) => {
    node.setGate = (gate, time = 0) => {
      node.gate.setValueAtTime(gate ? 1 : 0, time);
    };
  },
});
