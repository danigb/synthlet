import { AdEnv, AdInputs } from "@synthlet/ad";
import { AdsrAmp, AdsrEnv, AdsrInputs } from "@synthlet/adsr";
import { ChorusT } from "@synthlet/chorus-t";
import { ClipAmp, ClipType } from "@synthlet/clip-amp";
import { Clock } from "@synthlet/clock";
import { Euclid } from "@synthlet/euclid";
import { Impulse } from "@synthlet/impulse";
import { Lfo, LfoInputs, LfoType } from "@synthlet/lfo";
import { Noise, NoiseType } from "@synthlet/noise";
import {
  Param,
  ParamInputs,
  ParamScaleType,
  ParamWorkletNode,
} from "@synthlet/param";
import { PolyblepOscillator } from "@synthlet/polyblep-oscillator";
import { Svf, SvfInputs, SvfType } from "@synthlet/state-variable-filter";
import { WavetableOscillator } from "@synthlet/wavetable-oscillator";
import { disposable, Disposable, ParamInput } from "./_worklet";
import {
  BiquadFilter,
  BiquadFilterInputs,
  Gain,
  GainInputs,
  Oscillator,
  OscillatorInputs,
} from "./waa";

export type Synthlet = ReturnType<typeof createSynthlet>;

export function getSynthlet(context: AudioContext): Synthlet {
  if (!(context as any).__synthlet) {
    (context as any).__synthlet = createSynthlet(context);
  }
  return (context as any).__synthlet;
}

function createSynthlet(context: AudioContext) {
  const operator = <I, N>(
    createNode: (context: AudioContext, inputs?: I) => N
  ) => {
    return (inputs?: I) => createNode(context, inputs);
  };

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
  const clip = operator(ClipAmp);

  const ops = {
    param: Object.assign(
      (value?: ParamInput, params?: ParamInputs) =>
        param({ input: value, ...params }),
      {
        db: (db: ParamInput, params?: ParamInputs) =>
          param({ scale: ParamScaleType.DbToGain, input: db, ...params }),
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
        add: (value: ParamInput, input: ParamInput, params?: ParamInputs) =>
          param({
            scale: ParamScaleType.Bypass,
            input: input,
            offset: value,
            ...params,
          }),
        mul: (value: ParamInput, input: ParamInput, params?: ParamInputs) =>
          param({
            scale: ParamScaleType.Bypass,
            input: input,
            gain: value,
            ...params,
          }),
      }
    ),
    conn: createConn(gainOp),

    amp: Object.assign((gain?: ParamInput) => gainOp({ gain }), {
      adsr: (gate: ParamInput, params?: AdsrInputs) =>
        adsrAmp({ gate, ...params }),
      perc: (
        trigger: ParamInput,
        attack?: ParamInput,
        decay?: ParamInput,
        params?: AdInputs
      ) => gainOp({ gain: ad({ trigger, attack, decay, ...params }) }),
    }),
    clock: Object.assign(clock, {}),
    clip: Object.assign(clip, {
      soft: (preGain?: ParamInput, postGain?: ParamInput) =>
        clip({ type: ClipType.Tanh, preGain, postGain }),
    }),
    chorusT: Object.assign(chorusT, {}),
    euclid: Object.assign(euclid, {}),
    impulse: Object.assign(impulse, {
      trigger: (trigger: ParamInput) => impulse({ trigger }),
    }),
    lfo: Object.assign(lfo, {
      sin: (frequency: ParamInput, params?: Partial<LfoInputs>) =>
        lfo({ type: LfoType.Sine, frequency, ...params }),
      tri: (frequency: ParamInput, params?: Partial<LfoInputs>) =>
        lfo({ type: LfoType.Triangle, frequency, ...params }),
      rampUp: (frequency: ParamInput, params?: Partial<LfoInputs>) =>
        lfo({ type: LfoType.RampUp, frequency, ...params }),
      rampDown: (frequency: ParamInput, params?: Partial<LfoInputs>) =>
        lfo({ type: LfoType.RampDown, frequency, ...params }),
      square: (frequency: ParamInput, params?: Partial<LfoInputs>) =>
        lfo({ type: LfoType.Square, frequency, ...params }),
      expRampUp: (frequency: ParamInput, params?: Partial<LfoInputs>) =>
        lfo({ type: LfoType.ExpRampUp, frequency, ...params }),
      expRampDown: (frequency: ParamInput, params?: Partial<LfoInputs>) =>
        lfo({ type: LfoType.ExpRampDown, frequency, ...params }),
      expTriangle: (frequency: ParamInput, params?: Partial<LfoInputs>) =>
        lfo({ type: LfoType.ExpTriangle, frequency, ...params }),
      sh: (frequency: ParamInput, params?: Partial<LfoInputs>) =>
        lfo({ type: LfoType.RandSampleHold, frequency, ...params }),
      impulse: (frequency: ParamInput, params?: Partial<LfoInputs>) =>
        lfo({ type: LfoType.Impulse, frequency, ...params }),
    }),

    noise: Object.assign(noise, {
      white: () => noise({ type: NoiseType.White }),
      pink: () => noise({ type: NoiseType.Pink }),
    }),
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
      hi: (frequency: ParamInput, params?: Partial<BiquadFilterInputs>) =>
        bqf({ type: "highpass", frequency, ...params }),
      bandpass: (frequency: ParamInput, params?: Partial<BiquadFilterInputs>) =>
        bqf({ type: "bandpass", frequency, ...params }),
      allpass: (frequency: ParamInput, params?: Partial<BiquadFilterInputs>) =>
        bqf({ type: "allpass", frequency, ...params }),
      highshelf: (
        frequency: ParamInput,
        params?: Partial<BiquadFilterInputs>
      ) => bqf({ type: "highshelf", frequency, ...params }),
      lowshelf: (frequency: ParamInput, params?: Partial<BiquadFilterInputs>) =>
        bqf({ type: "lowshelf", frequency, ...params }),
      peak: (frequency: ParamInput, params?: Partial<BiquadFilterInputs>) =>
        bqf({ type: "peaking", frequency, ...params }),
      notch: (frequency: ParamInput, params?: Partial<BiquadFilterInputs>) =>
        bqf({ type: "notch", frequency, ...params }),
    }),

    gain: (gain?: ParamInput) => gainOp({ gain }),
    osc: Object.assign(osc, {
      sin: (frequency: ParamInput, params?: OscillatorInputs) =>
        osc({ type: "sine", frequency, ...params }),
      saw: (frequency: ParamInput, params?: OscillatorInputs) =>
        osc({ type: "sawtooth", frequency, ...params }),
      square: (frequency: ParamInput, params?: OscillatorInputs) =>
        osc({ type: "square", frequency, ...params }),
      tri: (frequency: ParamInput, params?: OscillatorInputs) =>
        osc({ type: "triangle", frequency, ...params }),
    }),

    wt: Object.assign(wt, {}),

    withParams,

    synth: <N extends AudioNode, P extends ControlParams, M>(synth: {
      out: Disposable<N>;
      params: P;
      modules?: M;
    }) => Object.assign(withParams(synth.out, synth.params), synth.modules),
    op:
      <I>(fn: (context: AudioContext, params?: I) => AudioNode) =>
      (params?: I) =>
        fn(context, params),
  };
  return extensible(context, ops);
}

function withParams<N extends AudioNode, P extends ControlParams>(
  node: Disposable<N>,
  params: P
) {
  return Object.assign(
    disposable(node, Object.values(params)),
    paramToInputs(params)
  );
}

type TransformOperators<
  T extends Record<
    string,
    (context: AudioContext, params: any) => Disposable<AudioNode>
  >
> = {
  [K in keyof T]: T[K] extends (
    context: AudioContext,
    params: infer P
  ) => Disposable<AudioNode>
    ? (params: P) => Disposable<AudioNode>
    : never;
};

// Typescript wizardry to create a type-safe API for creating synthlet operators
function extensible<O extends Object>(context: AudioContext, ops: O) {
  return Object.assign(ops, {
    use: <
      T extends Record<
        string,
        (context: AudioContext, params: any) => Disposable<AudioNode>
      >
    >(
      operators: T
    ): O & TransformOperators<T> => {
      const result = {} as TransformOperators<T>;

      for (const key in operators) {
        result[key] = ((params: Parameters<T[typeof key]>[1]) =>
          operators[key](context, params)) as TransformOperators<T>[typeof key];
      }

      return Object.assign(ops, result);
    },
  });
}

function createConn(gain: (inputs?: GainInputs) => Disposable<GainNode>) {
  const pair = <N extends AudioNode>(
    s: AudioNode,
    d: Disposable<N>
  ): Disposable<N> => s.connect(d) as Disposable<N>;

  const chain = (nodes: Disposable<AudioNode>[]) =>
    withDependencies(
      nodes.reduce((prev, next) => {
        prev.connect(next);
        return next;
      }),
      nodes
    );

  const mixInto = (
    src: Disposable<AudioNode>[],
    dest: Disposable<AudioNode>
  ) => {
    src.forEach((node) => node.connect(dest));
    return withDependencies(dest, src);
  };

  const serial = (...nodes: Disposable<AudioNode>[]) => chain(nodes);
  const mix = (...nodes: Disposable<AudioNode>[]) => mixInto(nodes, gain());

  const conn = (
    src: Disposable<AudioNode> | Disposable<AudioNode>[],
    dest?: Disposable<AudioNode>,
    ...tail: Disposable<AudioNode>[]
  ) => {
    if (!dest) {
      if (Array.isArray(src)) {
        throw Error("Connect in parallel requires a destination");
      }
      return src;
    }
    const head = Array.isArray(src) ? mixInto(src, dest) : pair(src, dest);
    return tail.length > 0 ? chain([head, ...tail]) : head;
  };
  return Object.assign(conn, { pair, chain, mixInto, serial, mix });
}

type ControlParams = Record<string, ParamWorkletNode>;

type ParamWorkletNodeToInputs<T extends ControlParams> = {
  [K in keyof T]: T[K]["input"];
};

function paramToInputs<P extends ControlParams>(
  params?: P
): ParamWorkletNodeToInputs<P> {
  const inputs = {} as ParamWorkletNodeToInputs<P>;

  if (params) {
    for (const key in params) {
      inputs[key] = params[key].input;
    }
  }
  return inputs;
}

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
