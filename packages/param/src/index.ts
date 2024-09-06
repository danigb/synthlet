import {
  Connector,
  createRegistrar,
  createWorkletConstructor,
  ParamInput,
} from "./_worklet";
import { ParamType } from "./dsp";
import { PROCESSOR } from "./processor";

export { ParamType } from "./dsp";

export const registerParamWorkletOnce = createRegistrar(PROCESSOR);

export type ParamInputParams = {
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
  ParamInputParams
>({
  processorName: "ParamProcessor",
  paramNames: ["type", "input", "offset", "min", "max"],
  workletOptions: () => ({
    numberOfInputs: 1,
    numberOfOutputs: 1,
  }),
});

const op = (params?: ParamInputParams): Connector<ParamWorkletNode> => {
  let node: ParamWorkletNode;
  return (context: AudioContext) => {
    node ??= createParamNode(context, params);
    return node;
  };
};

const val = (value: number, params?: ParamInputParams) =>
  op({ input: value, ...params });
const db = (value: number, params?: ParamInputParams) =>
  op({ type: ParamType.DB_TO_GAIN, input: value, ...params });

export const Param = Object.assign(val, { val, db });
