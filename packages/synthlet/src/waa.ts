import { connectParams, Disposable, disposable, ParamInput } from "./_worklet";

export type GainInputs = {
  gain?: ParamInput;
};

function createGain(context: AudioContext, options: Partial<GainInputs> = {}) {
  const node = new GainNode(context);
  const conns = connectParams(node, ["gain"], options);
  return disposable(node, conns);
}

export const Gain = Object.assign(createGain, {
  val: (context: AudioContext, value?: ParamInput) =>
    createGain(context, { gain: value }),
});

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

export function ConnSerial(nodes: Disposable<AudioNode>[]) {
  return disposable(
    nodes.reduce((prev, next) => {
      prev.connect(next);
      return next;
    }),
    nodes
  );
}

export function ConnMixInto(
  nodes: Disposable<AudioNode>[],
  target: Disposable<AudioNode>
) {
  nodes.forEach((node) => node.connect(target));
  return disposable(target, nodes);
}

export function Synthlet<N extends AudioNode>(output: Disposable<N>) {}
