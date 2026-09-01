import {
  connectParams,
  Disposable,
  disposable,
  ParamDescriptor,
  ParamInput,
} from "./_worklet";

// Nominal ranges from the Web Audio spec, so a compound author sees the same
// `descriptors` shape on a native node as on a worklet one. Frequency maxima
// are Nyquist at 44.1 kHz; the real AudioParam clamps to the context's own.
const FLOAT_MAX = 3.4028235e38;
const names = (descriptors: readonly ParamDescriptor[]) =>
  descriptors.map((d) => d.name);

const GAIN_PARAMS: readonly ParamDescriptor[] = [
  {
    name: "gain",
    defaultValue: 1,
    minValue: -FLOAT_MAX,
    maxValue: FLOAT_MAX,
    automationRate: "a-rate",
  },
];

const OSCILLATOR_PARAMS: readonly ParamDescriptor[] = [
  {
    name: "frequency",
    defaultValue: 440,
    minValue: -22050,
    maxValue: 22050,
    automationRate: "a-rate",
  },
  {
    name: "detune",
    defaultValue: 0,
    minValue: -153600,
    maxValue: 153600,
    automationRate: "a-rate",
  },
];

const BIQUAD_FILTER_PARAMS: readonly ParamDescriptor[] = [
  {
    name: "frequency",
    defaultValue: 350,
    minValue: 0,
    maxValue: 22050,
    automationRate: "a-rate",
  },
  {
    name: "detune",
    defaultValue: 0,
    minValue: -153600,
    maxValue: 153600,
    automationRate: "a-rate",
  },
  {
    name: "Q",
    defaultValue: 1,
    minValue: -FLOAT_MAX,
    maxValue: FLOAT_MAX,
    automationRate: "a-rate",
  },
  {
    name: "gain",
    defaultValue: 0,
    minValue: -FLOAT_MAX,
    maxValue: 1541,
    automationRate: "a-rate",
  },
];

export type GainInputs = {
  gain?: ParamInput;
};

function createGain(context: AudioContext, options: Partial<GainInputs> = {}) {
  const node = new GainNode(context);
  const conns = connectParams(node, names(GAIN_PARAMS), options);
  return disposable(node, conns);
}

export const Gain = Object.assign(createGain, {
  val: (context: AudioContext, value?: ParamInput) =>
    createGain(context, { gain: value }),
  descriptors: GAIN_PARAMS,
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

export const Oscillator = Object.assign(
  function oscillator(
    context: AudioContext,
    inputs: OscillatorInputs = {}
  ): Disposable<OscillatorNode> {
    const osc = new OscillatorNode(context, { type: inputs.type });
    osc.start();
    const conn = connectParams(osc, names(OSCILLATOR_PARAMS), inputs);
    return disposable(osc, conn);
  },
  { descriptors: OSCILLATOR_PARAMS }
);

export type BiquadFilterInputs = {
  type?: BiquadFilterType;
  frequency?: ParamInput;
  detune?: ParamInput;
  Q?: ParamInput;
  gain?: ParamInput;
};

export const BiquadFilter = Object.assign(
  function biquadFilter(
    context: AudioContext,
    inputs: Partial<BiquadFilterInputs> = {}
  ) {
    const filter = new BiquadFilterNode(context, { type: inputs.type });
    const conn = connectParams(filter, names(BIQUAD_FILTER_PARAMS), inputs);
    return disposable(filter, conn);
  },
  { descriptors: BIQUAD_FILTER_PARAMS }
);
