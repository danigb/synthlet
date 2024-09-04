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

type FilterInputs = {
  type: BiquadFilterType;
  frequency: ParamInput;
  detune: ParamInput;
  Q: ParamInput;
  gain: ParamInput;
};

export function createFilter(
  context: AudioContext,
  inputs: Partial<FilterInputs> = {}
) {
  const filter = new BiquadFilterNode(context, { type: inputs.type });
  const conn = connectAll(filter, ["frequency", "detune", "Q", "gain"], inputs);
  return disposable(filter, conn);
}