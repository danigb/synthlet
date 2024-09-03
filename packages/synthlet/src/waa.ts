import { connectAll, disposable, ParamInput } from "./_worklet";

type GainInputs = {
  gain: ParamInput;
};

export function createGain(
  context: AudioContext,
  options: Partial<GainInputs> = {}
) {
  const node = new GainNode(context);
  const conns = connectAll(node, ["gain"], options);
  return disposable(node, conns);
}

export type ParamNode = ConstantSourceNode & {
  value: AudioParam;
};

export function createConstantSource(
  context: AudioContext,
  options: ConstantSourceOptions = {}
): ParamNode {
  const node = new ConstantSourceNode(context, options) as ParamNode;
  node.start();
  node.value = node.offset;
  return disposable(node);
}

type OscillatorInputs = {
  type: OscillatorType;
  frequency: ParamInput;
  detune: ParamInput;
};

export function createOscillator(
  context: AudioContext,
  inputs: Partial<OscillatorInputs> = {}
) {
  const osc = new OscillatorNode(context, { type: inputs.type });
  osc.start();
  const conn = connectAll(osc, ["frequency", "detune"], inputs);
  return disposable(osc, conn);
}
