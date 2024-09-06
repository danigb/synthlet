import { Ad, AdInputs } from "@synthlet/ad";
import { Adsr } from "@synthlet/adsr";
import { ClipAmp } from "@synthlet/clip-amp";
import { Clock } from "@synthlet/clock";
import { Impulse } from "@synthlet/impulse";
import { Noise } from "@synthlet/noise";
import { Param } from "@synthlet/param";
import { PolyblepOscillator } from "@synthlet/polyblep-oscillator";
import { Connector, Disposable, ParamInput } from "./_worklet";
import { AssignParams, Conn, Gain, ParamConnectors } from "./connectors";
import {
  BiquadFilterInputs,
  createBiquadFilter,
  createOscillator,
  OscillatorInputs,
} from "./waa";

const osc =
  (inputs: OscillatorInputs): Connector<OscillatorNode> =>
  (context: AudioContext) =>
    createOscillator(context, inputs);

export const Osc = Object.assign(osc, {
  sin: (frequency: ParamInput, params?: OscillatorInputs) =>
    osc({ type: "sine", frequency, ...params }),
  saw: (frequency: ParamInput, params?: OscillatorInputs) =>
    osc({ type: "sawtooth", frequency, ...params }),
  sqr: (frequency: ParamInput, params?: OscillatorInputs) =>
    osc({ type: "square", frequency, ...params }),
  tri: (frequency: ParamInput, params?: OscillatorInputs) =>
    osc({ type: "triangle", frequency, ...params }),
});

export const Amp = Object.assign(Gain, {
  vol: (gain: ParamInput) => Gain({ gain }),
  db: (db: ParamInput) => Gain({ gain: Param.db(db) }),
  perc: (
    trigger: ParamInput,
    attack?: ParamInput,
    decay?: ParamInput,
    params?: AdInputs
  ) => Gain({ gain: Ad({ trigger, attack, decay, ...params }) }),
  adsr: (
    gate: ParamInput,
    attack?: ParamInput,
    decay?: ParamInput,
    sustain?: ParamInput,
    release?: ParamInput,
    params?: AdInputs
  ) =>
    Gain({
      gain: Adsr({ gate, attack, decay, sustain, release, ...params }),
    }),
});

export const Env = Object.assign(Adsr, {
  ad: (
    trigger: ParamInput,
    attack?: ParamInput,
    decay?: ParamInput,
    params?: AdInputs
  ) => Ad({ trigger, attack, decay, ...params }),
  adsr: (
    trigger: ParamInput,
    attack?: ParamInput,
    decay?: ParamInput,
    sustain?: ParamInput,
    release?: ParamInput,
    params?: AdInputs
  ) => Adsr({ trigger, attack, decay, sustain, release, ...params }),
});

function createBiquadFilterOperator() {
  const bqf = (inputs?: BiquadFilterInputs): Connector<BiquadFilterNode> => {
    let node: BiquadFilterNode;
    return (context: AudioContext) => {
      node ??= createBiquadFilter(context, inputs);
      return node;
    };
  };

  return Object.assign(bqf, {
    lp: (frequency: ParamInput, params?: Partial<BiquadFilterInputs>) =>
      bqf({ type: "lowpass", frequency, ...params }),
    hp: (frequency: ParamInput, params?: Partial<BiquadFilterInputs>) =>
      bqf({ type: "highpass", frequency, ...params }),
    bp: (frequency: ParamInput, params?: Partial<BiquadFilterInputs>) =>
      bqf({ type: "bandpass", frequency, ...params }),
    allp: (frequency: ParamInput, params?: Partial<BiquadFilterInputs>) =>
      bqf({ type: "allpass", frequency, ...params }),
    hs: (frequency: ParamInput, params?: Partial<BiquadFilterInputs>) =>
      bqf({ type: "highshelf", frequency, ...params }),
    ls: (frequency: ParamInput, params?: Partial<BiquadFilterInputs>) =>
      bqf({ type: "lowshelf", frequency, ...params }),
    peak: (frequency: ParamInput, params?: Partial<BiquadFilterInputs>) =>
      bqf({ type: "peaking", frequency, ...params }),
    notch: (frequency: ParamInput, params?: Partial<BiquadFilterInputs>) =>
      bqf({ type: "notch", frequency, ...params }),
  });
}

export const Bqf = createBiquadFilterOperator();

export const Operators = {
  AssignParams,
  Osc,
  Conn,
  PolyblepOscillator,
  Polyb: PolyblepOscillator,
  Amp,
  Bqf,
  Env,
  Param,
  Impulse,
  ClipAmp,
  Noise,
  Ad,
  Adsr,
  Clock,
} as const;

export function WithParams<N extends AudioNode, P extends ParamConnectors>(
  params: P | ((p: typeof Param, op: typeof Operators) => P),
  create: (params: P, op: typeof Operators) => Connector<Disposable<N>>
) {
  const p = typeof params === "function" ? params(Param, Operators) : params;
  return AssignParams(create(p, Operators), p);
}
