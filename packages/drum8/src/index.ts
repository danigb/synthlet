import {
  createRegistrar,
  createWorkletConstructor,
  ParamInput,
} from "./_worklet";
import { PROCESSOR } from "./processor";

export type Drum8ModuleType =
  | "clave"
  | "conga"
  | "cowbell"
  | "cymbal"
  | "handclap"
  | "hihat-closed"
  | "hihat-open"
  | "kick"
  | "maracas"
  | "rimshot"
  | "snare"
  | "tom";

export type Drum8InputParams = {
  type: string;
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

export const registerDrum8WorkletOnce = createRegistrar("DRUM8", PROCESSOR);

export const createDrum8Node = createWorkletConstructor<
  Drum8WorkletNode,
  Drum8InputParams
>({
  processorName: "Drum8WorkletProcessor",
  paramNames: ["gate", "attack", "decay", "level", "snap", "tone"],
  workletOptions: (params) => ({
    numberOfInputs: 1,
    numberOfOutputs: 1,
    processorOptions: {
      type: params.type,
    },
  }),
  postCreate: (node) => {
    node.setGate = (gate, time = 0) => {
      node.gate.setValueAtTime(gate ? 1 : 0, time);
    };
  },
});
