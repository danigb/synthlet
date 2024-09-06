import { AdInputs, createAdNode } from "@synthlet/ad";
import { AdsrInputs, createAdsrNode, createAmpAdsrNode } from "@synthlet/adsr";
import { createWavetableOscillatorNode } from "@synthlet/wavetable-oscillator";

import { ParamInput } from "./_worklet";
import {
  BiquadFilterInputs,
  createBiquadFilter,
  createGain,
  createOscillator,
  OscillatorInputs,
} from "./waa";

import { createChorusTNode } from "@synthlet/chorus-t";
import { createClockNode } from "@synthlet/clock";
import { createEuclidNode } from "@synthlet/euclid";
import { createImpulseNode } from "@synthlet/impulse";
import { createLfoNode } from "@synthlet/lfo";
import { createNoiseNode } from "@synthlet/noise";
import { createParamNode, ParamInputs, ParamScaleType } from "@synthlet/param";
import { createPolyblepOscillatorNode } from "@synthlet/polyblep-oscillator";
import {
  createStateVariableFilterNode,
  StateVariableFilterInputs,
  StateVariableFilterType,
} from "@synthlet/state-variable-filter";
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
  const gainOp = operator(createGain);
  const osc = operator(createOscillator);
  const bqf = operator(createBiquadFilter);

  // Synthlet
  const ad = operator(createAdNode);
  const adsrAmp = operator(createAmpAdsrNode);
  const adsrEnv = operator(createAdsrNode);
  const chorusT = operator(createChorusTNode);
  const clock = operator(createClockNode);
  const euclid = operator(createEuclidNode);
  const impulse = operator(createImpulseNode);
  const lfo = operator(createLfoNode);
  const noise = operator(createNoiseNode);
  const polyblep = operator(createPolyblepOscillatorNode);
  const svf = operator(createStateVariableFilterNode);
  const param = operator(createParamNode);
  const wt = operator(createWavetableOscillatorNode);

  // Operators
  return {
    param: Object.assign(
      (params?: ParamInputs | number) =>
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
            type: ParamScaleType.LINEAR,
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
      lp: (
        frequency: ParamInput,
        params?: Partial<StateVariableFilterInputs>
      ) => svf({ type: StateVariableFilterType.LowPass, frequency, ...params }),
      hp: (
        frequency: ParamInput,
        params?: Partial<StateVariableFilterInputs>
      ) =>
        svf({ type: StateVariableFilterType.HighPass, frequency, ...params }),
      bp: (
        frequency: ParamInput,
        params?: Partial<StateVariableFilterInputs>
      ) =>
        svf({ type: StateVariableFilterType.BandPass, frequency, ...params }),
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
