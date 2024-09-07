import { connectParams, Disposable, disposable, ParamInput } from "./_worklet";

export type GainInputs = {
  gain?: ParamInput;
};

export function Gain(context: AudioContext, options: Partial<GainInputs> = {}) {
  const node = new GainNode(context);
  const conns = connectParams(node, ["gain"], options);
  return disposable(node, conns);
}

export function ConstantSource(context: AudioContext, value: number) {
  const node = new ConstantSourceNode(context, { offset: value });
  node.start();
  return disposable(node);
}

export type OscillatorInputs = {
  type?: OscillatorType;
  frequency?: ParamInput;
  detune?: ParamInput;
};

export function Oscillator(
  context: AudioContext,
  inputs: OscillatorInputs = {}
): Disposable<OscillatorNode> {
  const osc = new OscillatorNode(context, { type: inputs.type });
  osc.start();
  const conn = connectParams(osc, ["frequency", "detune"], inputs);
  return disposable(osc, conn);
}

export type BiquadFilterInputs = {
  type?: BiquadFilterType;
  frequency?: ParamInput;
  detune?: ParamInput;
  Q?: ParamInput;
  gain?: ParamInput;
};

export function BiquadFilter(
  context: AudioContext,
  inputs: Partial<BiquadFilterInputs> = {}
) {
  const filter = new BiquadFilterNode(context, { type: inputs.type });
  const conn = connectParams(
    filter,
    ["frequency", "detune", "Q", "gain"],
    inputs
  );
  return disposable(filter, conn);
}
