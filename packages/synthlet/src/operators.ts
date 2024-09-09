import { AdEnv, AdInputs } from "@synthlet/ad";
import { AdsrAmp, AdsrEnv, AdsrInputs } from "@synthlet/adsr";
import { WavetableOscillator } from "@synthlet/wavetable-oscillator";

import { ParamInput } from "./_worklet";
import {
  BiquadFilter,
  BiquadFilterInputs,
  Gain,
  Oscillator,
  OscillatorInputs,
} from "./waa";

import { ChorusT } from "@synthlet/chorus-t";
import { Clock } from "@synthlet/clock";
import { Euclid } from "@synthlet/euclid";
import { Impulse } from "@synthlet/impulse";
import { Lfo } from "@synthlet/lfo";
import { Noise } from "@synthlet/noise";
import { Param, ParamInputs, ParamScaleType } from "@synthlet/param";
import { PolyblepOscillator } from "@synthlet/polyblep-oscillator";
import { Svf, SvfInputs, SvfType } from "@synthlet/state-variable-filter";
import { Connector, Disposable } from "./_worklet";

export function operator<P, N extends AudioNode>(
  createNode: (context: AudioContext, inputs?: P) => Disposable<N>
) {
  return (inputs?: P): Connector<Disposable<N>> => {
    let node: Disposable<N>;
    return (context) => {
      return (node ??= createNode(context, inputs));
    };
  };
}

export type SynthletOperators = ReturnType<typeof createOperators>;

export function createOperators() {
  // Web Audio
  const gainOp = operator(Gain);
  const osc = operator(Oscillator);
  const bqf = operator(BiquadFilter);

  // Synthlet
  const ad = operator(AdEnv);
  const adsrAmp = operator(AdsrAmp);
  const adsrEnv = operator(AdsrEnv);
  const chorusT = operator(ChorusT);
  const clock = operator(Clock);
  const euclid = operator(Euclid);
  const impulse = operator(Impulse);
  const lfo = operator(Lfo);
  const noise = operator(Noise);
  const polyblep = operator(PolyblepOscillator);
  const svf = operator(Svf);
  const param = operator(Param);
  const wt = operator(WavetableOscillator);

  // Operators
  return {
    param: Object.assign(
      (params?: ParamInputs | number | undefined) =>
        param(typeof params === "number" ? { input: params } : params),
      {
        db: (db: ParamInput, params?: ParamInputs) =>
          param({ input: db, ...params }),
        lin: (
          min: ParamInput,
          max: ParamInput,
          value: ParamInput,
          params?: ParamInputs
        ) =>
          param({
            scale: ParamScaleType.Linear,
            input: value,
            min,
            max,
            ...params,
          }),
      }
    ),
    conn: createConn(gainOp),

    amp: Object.assign((gain: ParamInput) => gainOp({ gain }), {
      adsr: (gate: ParamInput, params?: AdsrInputs) =>
        adsrAmp({ gate, ...params }),
      perc: (trigger: ParamInput, params?: AdInputs) =>
        gainOp({ gain: ad({ trigger, ...params }) }),
    }),
    clock: Object.assign(clock, {}),
    chorusT: Object.assign(chorusT, {}),
    euclid: Object.assign(euclid, {}),
    impulse: Object.assign(impulse, {}),
    lfo: Object.assign(lfo, {}),
    noise: Object.assign(noise, {}),
    polyblep: Object.assign(polyblep, {}),
    svf: Object.assign(svf, {
      lp: (frequency: ParamInput, params?: Partial<SvfInputs>) =>
        svf({ type: SvfType.LowPass, frequency, ...params }),
      hp: (frequency: ParamInput, params?: Partial<SvfInputs>) =>
        svf({ type: SvfType.HighPass, frequency, ...params }),
      bp: (frequency: ParamInput, params?: Partial<SvfInputs>) =>
        svf({ type: SvfType.BandPass, frequency, ...params }),
    }),

    env: Object.assign(adsrEnv, {
      adsr: (gate: ParamInput, params?: AdsrInputs) =>
        adsrEnv({ gate, ...params }),
      ad: (trigger: ParamInput, params?: AdInputs) =>
        ad({ trigger, ...params }),
    }),

    bqf: Object.assign(bqf, {
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
    }),

    gain: Object.assign(gainOp, {}),
    osc: Object.assign(osc, {
      sin: (frequency: ParamInput, params?: OscillatorInputs) =>
        osc({ type: "sine", frequency, ...params }),
      saw: (frequency: ParamInput, params?: OscillatorInputs) =>
        osc({ type: "sawtooth", frequency, ...params }),
      sqr: (frequency: ParamInput, params?: OscillatorInputs) =>
        osc({ type: "square", frequency, ...params }),
      tri: (frequency: ParamInput, params?: OscillatorInputs) =>
        osc({ type: "triangle", frequency, ...params }),
    }),

    wt: Object.assign(wt, {}),
  };
}

function createConn(gain: () => Connector<Disposable<GainNode>>) {
  // Connect two audio nodes and add a dependency between them
  const pair =
    <S extends AudioNode, D extends AudioNode>(
      src: Connector<S>,
      dest: Connector<D>
    ): Connector<Disposable<D>> =>
    (context) => {
      const srcN = src(context);
      const destN = dest(context);
      srcN.connect(destN);
      return withDependencies(destN, [srcN]);
    };

  // Connect multiple audio nodes in series and return the last one
  // The last one will dispose of all the others
  const chain =
    (chain: Connector<AudioNode>[]): Connector<Disposable<AudioNode>> =>
    (context) => {
      const nodes = chain.map((node) => node(context));
      return withDependencies(
        nodes.reduce((prev, next) => {
          prev.connect(next);
          return next;
        }),
        nodes
      );
    };

  // Connect multiple audio nodes in parallel into a destination and return the destination
  // The destination will dispose of all the others
  const mixInto =
    <D extends AudioNode>(
      chain: Connector<AudioNode>[],
      dest: Connector<D>
    ): Connector<Disposable<D>> =>
    (context) => {
      const nodes = chain.map((node) => node(context));
      const destN = dest(context);
      nodes.forEach((node) => node.connect(destN));
      return withDependencies(destN, nodes);
    };

  // Connect multiple audio nodes in parallel into a chain
  const connectMixChain = (
    src: Connector<AudioNode> | Connector<AudioNode>[],
    dest?: Connector<AudioNode>,
    ...tail: Connector<AudioNode>[]
  ): Connector<Disposable<AudioNode>> => {
    if (!dest) {
      if (Array.isArray(src)) {
        throw Error("Connect in parallel requires a destination");
      }
      return src as Connector<Disposable<AudioNode>>;
    }
    const head = Array.isArray(src) ? mixInto(src, dest) : pair(src, dest);
    return tail.length > 0 ? chain([head, ...tail]) : head;
  };

  return Object.assign(connectMixChain, {
    pair,
    chain,
    mixInto,
    serial: (...serial: Connector<AudioNode>[]) => chain(serial),
    mix: (...parallel: Connector<AudioNode>[]) => mixInto(parallel, gain()),
  });
}

// Ensure that the dispose method of the destination node also disposes of the dependant nodes
function withDependencies<N extends AudioNode>(
  src: N | Disposable<N>,
  deps: (AudioNode | Disposable<N>)[]
): Disposable<N> {
  const out = src as Disposable<N>;
  let _dispose = out.dispose;
  let disposed = false;
  out.dispose = () => {
    if (disposed) return;
    disposed = true;
    _dispose();
    deps.forEach((dep) => {
      if ("dispose" in dep) dep.dispose();
    });
  };
  return out;
}
