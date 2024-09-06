import {
  Connector,
  createRegistrar,
  createWorkletConstructor,
  ParamInput,
} from "./_worklet";
import { PROCESSOR } from "./processor";

export const registerImpulseWorklet = createRegistrar("IMPULSE", PROCESSOR);

export type ImpulseInputs = {
  trigger: ParamInput;
};

export type ImpulseWorkletNode = AudioWorkletNode & {
  trigger: AudioParam;
  dispose(): void;
};

export const createImpulseNode = createWorkletConstructor<
  ImpulseWorkletNode,
  ImpulseInputs
>({
  processorName: "ImpulseProcessor",
  paramNames: ["trigger"],
  workletOptions: () => ({
    numberOfInputs: 0,
    numberOfOutputs: 1,
  }),
});

const op = (params?: ImpulseInputs): Connector<ImpulseWorkletNode> => {
  let node: ImpulseWorkletNode;
  return (context: AudioContext) => {
    node ??= createImpulseNode(context, params);
    return node;
  };
};

export const Impulse = Object.assign(op, {
  trigger: (trigger: ParamInput) => op({ trigger }),
});
