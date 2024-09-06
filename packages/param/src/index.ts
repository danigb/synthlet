import {
  Connector,
  createRegistrar,
  createWorkletConstructor,
  ParamInput,
} from "./_worklet";
import { ParamType } from "./dsp";
import { PROCESSOR } from "./processor";

export { ParamType } from "./dsp";

export const registerParamWorklet = createRegistrar("PARAM", PROCESSOR);

export type ParamInputs = {
  type?: ParamInput;
  input?: ParamInput;
  offset?: ParamInput;
  min?: ParamInput;
  max?: ParamInput;
};

export type ParamWorkletNode = AudioWorkletNode & {
  type: AudioParam;
  input: AudioParam;
  offset: AudioParam;
  min: AudioParam;
  max: AudioParam;
  dispose(): void;
};

export const createParamNode = createWorkletConstructor<
  ParamWorkletNode,
  ParamInputs
>({
  processorName: "ParamProcessor",
  paramNames: ["type", "input", "offset", "min", "max"],
  workletOptions: () => ({
    numberOfInputs: 1,
    numberOfOutputs: 1,
  }),
});

// TODO: optimize if the input is a Connector<ParamWorkletNode> (no need to create another)
const op = (params?: ParamInputs | number): Connector<ParamWorkletNode> => {
  let node: ParamWorkletNode;
  return (context: AudioContext) => {
    node ??= createParamNode(
      context,
      typeof params === "number" ? { input: params } : params
    );
    return node;
  };
};

// TODO, optimization: if the input is a parameter, should not create another one

export const Param = Object.assign(op, {
  all: (
    names: readonly string[],
    inputs: Record<string, ParamInput | undefined>
  ) => {
    const params: Record<string, Connector<ParamWorkletNode>> = {};
    for (let name of names) {
      params[name] = op({ input: inputs[name] });
    }
    return params;
  },
  val: (value: ParamInput, params?: ParamInputs) =>
    op({ input: value, ...params }),
  db: (value: ParamInput, params?: ParamInputs) =>
    op({ type: ParamType.DB_TO_GAIN, input: value, ...params }),
  in: (value?: ParamInput, params?: ParamInputs) =>
    op({ input: value, ...params }),
  lin: (
    min: ParamInput,
    max: ParamInput,
    value: ParamInput,
    params?: ParamInputs
  ) => op({ type: ParamType.LINEAR, input: value, min, max, ...params }),
});
