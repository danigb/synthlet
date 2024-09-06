import { AdInputParams, createAdNode } from "@synthlet/ad";
import { AdsrInputParams, createAdsrNode, createVcaNode } from "@synthlet/adsr";
import {
  ClipAmpInputParams,
  ClipType,
  createClipAmpNode,
} from "@synthlet/clip-amp";
import { createImpulseNode } from "@synthlet/impulse";
import { createNoiseNode } from "@synthlet/noise";
import {
  createParamNode,
  ParamInputParams,
  ParamType,
  ParamWorkletNode,
} from "@synthlet/param";
import {
  createPolyblepOscillatorNode,
  PolyblepOscillatorInputParams,
  PolyblepWaveformType,
} from "@synthlet/polyblep-oscillator";
import {
  createWavetableOscillatorNode,
  loadWavetable,
  Wavetable,
  WavetableInputParams,
  WavetableOscillatorWorkletNode,
} from "@synthlet/wavetable-oscillator";
import { DisposableAudioNode, ParamInput } from "./_worklet";
import {
  BiquadFilterInputs,
  createBiquadFilter,
  createConstantNode,
  createGain,
  createOscillator,
  OscillatorInputs,
} from "./waa";

export type Operators = ReturnType<typeof createOperators>;

class WavetableLoadOperator {
  node?: WavetableOscillatorWorkletNode;
  promise?: Promise<Wavetable>;

  constructor(private urlOrName?: string) {}

  register(node: WavetableOscillatorWorkletNode) {
    this.node = node;
    if (this.urlOrName) {
      this.load(this.urlOrName);
    }
    return node;
  }

  load(urlOrName: string) {
    this.urlOrName = urlOrName;
    if (!this.node) throw new Error("Node not registered");
    this.promise = loadWavetable(urlOrName);
    this.promise
      .then((wavetable) => {
        this.node?.setWavetable(wavetable);
      })
      .catch((e) => {
        console.warn("Failed to load wavetable", urlOrName, e);
      });
  }
}

class OperatorContext {
  set: Set<DisposableAudioNode>;
  constructor() {
    this.set = new Set<DisposableAudioNode>();
  }

  add<T extends DisposableAudioNode>(node: T): T {
    this.set.add(node);
    return node;
  }
  disposer(node: AudioNode) {
    const _dispose = (node as any).dispose;
    const disposables = Array.from(this.set).filter((d) => d !== node);
    this.set.clear();
    return () => {
      _dispose?.();
      disposables.forEach((d) => d.dispose());
    };
  }
}

export function createOperators(ac: AudioContext) {
  const oc = new OperatorContext();
  const param = createParamOperators(ac, oc);
  const wt = createWavetableOperators(ac, oc);
  const pb = createPolyblepOperators(ac, oc);
  const osc = createOscillatorOperators(ac, oc);
  const amp = createAmpOperators(ac, oc);
  const bq = createBiquadFilterOperators(ac, oc);
  const noise = createNoiseOperators(ac, oc);
  const clip = createClipAmpOperators(ac, oc);
  const env = createEnvelopeGeneratorOperators(ac, oc);
  const conn = createConnectionOperators(ac, oc);

  return {
    audioContext: ac,
    param,
    wt,
    pb,
    osc,
    amp,
    bq,
    noise,
    clip,
    env,
    conn,

    impulse: (trigger: ParamInput) =>
      oc.add(createImpulseNode(ac, { trigger })),

    // Math
    add: (...inputs: ParamInput[]) => {
      const g = createGain(ac, { gain: 1 });
      inputs.forEach((input) => {
        if (typeof input === "number") {
          oc.add(createConstantNode(ac, input)).connect(g);
        } else if (input instanceof AudioNode) {
          input.connect(g);
        }
      });
      return oc.add(g);
    },

    // Dispose
    synth<N extends AudioNode, P extends ControlParams>(
      node: N,
      params?: P
    ): N & DisposableAudioNode & ParamWorkletNodeToInputs<P> {
      const synth = assignParams(ac, node, params);
      (synth as any).dispose = oc.disposer(synth);
      return synth as N & DisposableAudioNode & ParamWorkletNodeToInputs<P>;
    },
  };
}

export function assignParams<N extends Object, P extends ControlParams>(
  context: AudioContext,
  node: N,
  params?: P
) {
  return Object.assign(node, convertParamsToInputs(context, params));
}

function createConnectionOperators(context: AudioContext, oc: OperatorContext) {
  const chain = (nodes: AudioNode[]) =>
    nodes.reduce((prev, current) => {
      prev.connect(current);
      return current;
    });
  const mixInto = <N extends AudioNode>(
    nodes: AudioNode[],
    destination: N
  ): N => {
    nodes.forEach((node) => node.connect(destination));
    return destination;
  };

  function conn(
    src: AudioNode | AudioNode[],
    dest?: AudioNode,
    ...nodes: AudioNode[]
  ): AudioNode {
    // Connect src with dest
    if (Array.isArray(src)) {
      if (!dest) throw new Error("Destination is required to mix connect");
      return mixInto(src, dest);
    } else {
      if (dest) {
        src.connect(dest);
      }
    }
    // Connect dest with first node
    if (dest && nodes && nodes.length) {
      dest.connect(nodes[0]);
    }
    return nodes && nodes.length ? chain(nodes) : dest ? dest : src;
  }
  return Object.assign(conn, {
    chain,
    mixInto,
  });
}

function createEnvelopeGeneratorOperators(
  context: AudioContext,
  oc: OperatorContext
) {
  const env = (trigger: ParamInput, params?: Partial<AdInputParams>) =>
    oc.add(createAdsrNode(context, { trigger, ...params }));

  return Object.assign(env, {
    // Envelope generators
    ad: (
      trigger: ParamInput,
      attack?: ParamInput,
      decay?: ParamInput,
      params?: Partial<AdInputParams>
    ) => oc.add(createAdNode(context, { trigger, attack, decay, ...params })),
    adsr: (
      trigger: ParamInput,
      attack?: ParamInput,
      decay?: ParamInput,
      sustain?: ParamInput,
      release?: ParamInput,
      params?: Partial<AdsrInputParams>
    ) => env(trigger, { attack, decay, sustain, release, ...params }),
  });
}

function createClipAmpOperators(context: AudioContext, oc: OperatorContext) {
  // Amplifiers
  const clip = (
    clipType?: ParamInput,
    preGain?: ParamInput,
    params?: Partial<ClipAmpInputParams>
  ) =>
    oc.add(createClipAmpNode(context, { type: clipType, preGain, ...params }));

  return Object.assign(clip, {
    soft: (
      pre: number,
      postGain: number,
      params?: Partial<ClipAmpInputParams>
    ) => clip(ClipType.TANH, pre, { postGain, ...params }),
  });
}

function createBiquadFilterOperators(
  context: AudioContext,
  oc: OperatorContext
) {
  const bq = (
    type: BiquadFilterType,
    frequency?: ParamInput,
    options?: Partial<BiquadFilterInputs>
  ) => oc.add(createBiquadFilter(context, { type, frequency, ...options }));

  return Object.assign(bq, {
    lp: (freq?: ParamInput, options?: Partial<BiquadFilterInputs>) =>
      bq("lowpass", freq, options),
  });
}

function createOscillatorOperators(context: AudioContext, oc: OperatorContext) {
  const osc = (
    type: OscillatorType,
    frequency?: ParamInput,
    options?: Partial<OscillatorInputs>
  ) => oc.add(createOscillator(context, { type, frequency, ...options }));

  return Object.assign(osc, {
    sin: (frequency?: ParamInput, options?: Partial<OscillatorInputs>) =>
      osc("sine", frequency, options),
    tri: (frequency?: ParamInput, options?: Partial<OscillatorInputs>) =>
      osc("triangle", frequency, options),
    saw: (frequency?: ParamInput, options?: Partial<OscillatorInputs>) =>
      osc("sawtooth", frequency, options),
    square: (frequency?: ParamInput, options?: Partial<OscillatorInputs>) =>
      osc("square", frequency, options),
  });
}

function createNoiseOperators(context: AudioContext, oc: OperatorContext) {
  const noise = (type: ParamInput) =>
    oc.add(createNoiseNode(context, { type }));

  return Object.assign(noise, {
    white: () => noise(0),
    pink: () => noise(1),
  });
}

function createAmpOperators(context: AudioContext, oc: OperatorContext) {
  const amp = (value?: ParamInput) =>
    oc.add(createGain(context, { gain: value }));

  return Object.assign(amp, {
    // Attack-Decay (percussive) envelope
    perc: (
      trigger: ParamInput,
      attack?: ParamInput,
      decay?: ParamInput,
      params?: Partial<AdInputParams>
    ) => amp(createAdNode(context, { trigger, attack, decay, ...params })),
    adsr: (gate: ParamInput, params?: Partial<AdsrInputParams>) =>
      oc.add(createVcaNode(context, { gate, ...params })),
  });
}

function createParamOperators(context: AudioContext, oc: OperatorContext) {
  const param = (value?: ParamInput, params?: Partial<ParamInputParams>) =>
    oc.add(createParamNode(context, { input: value, ...params }));

  return Object.assign(param, {
    db: (db?: ParamInput) => param(db, { type: ParamType.DB_TO_GAIN }),
    lin: (min: ParamInput, max: ParamInput, value?: ParamInput) =>
      param(value, { type: ParamType.LINEAR, min, max }),
    adsr: (
      attack?: ParamInput,
      decay?: ParamInput,
      sustain?: ParamInput,
      release?: ParamInput
    ) => ({
      trigger: param(),
      attack: param(attack),
      decay: param(decay),
      sustain: param(sustain),
      release: param(release),
    }),
  });
}

function createWavetableOperators(context: AudioContext, oc: OperatorContext) {
  const wt = (
    loader: WavetableLoadOperator,
    frequency?: ParamInput,
    params?: Partial<WavetableInputParams>
  ) =>
    oc.add(
      loader.register(
        createWavetableOscillatorNode(context, { frequency, ...params })
      )
    );

  return Object.assign(wt, {
    table: (urlOrName: string) => new WavetableLoadOperator(urlOrName),
  });
}

function createPolyblepOperators(context: AudioContext, oc: OperatorContext) {
  const polyblep = (
    type?: ParamInput,
    frequency?: ParamInput,
    params?: Partial<PolyblepOscillatorInputParams>
  ) =>
    oc.add(
      createPolyblepOscillatorNode(context, { type, frequency, ...params })
    );

  return Object.assign(polyblep, {
    tri: (frequency?: ParamInput) =>
      polyblep(PolyblepWaveformType.TRIANGLE, frequency),
    saw: (frequency?: ParamInput) =>
      polyblep(PolyblepWaveformType.SAWTOOTH, frequency),
  });
}

// This is difficult to understand code
// It will try to convert the input Params object to an object of AudioParams
// It will accept both ParamWorkletNodes (with an input property)
// and a function that creates ParamWorkletNodes from AudioContext
type ParamWorkletConnector = (context: AudioContext) => ParamWorkletNode;
type ControlParamInput = ParamWorkletNode | ParamWorkletConnector;

type ControlParams = Record<string, ControlParamInput>;

type ParamWorkletNodeToInputs<T extends ControlParams> = {
  [K in keyof T]: T[K] extends ParamWorkletNode
    ? T[K]["input"]
    : T[K] extends ParamWorkletConnector
    ? ReturnType<T[K]>["input"]
    : never;
};

function isParamWorkletNode(
  param: ControlParamInput
): param is ParamWorkletNode {
  return "input" in param;
}

function isParamWorkletConnector(
  param: ControlParamInput
): param is ParamWorkletConnector {
  return typeof param === "function";
}

function convertParamsToInputs<P extends ControlParams>(
  context: AudioContext,
  params?: P
): ParamWorkletNodeToInputs<P> {
  const inputs = {} as ParamWorkletNodeToInputs<P>;
  if (!params) return inputs;

  for (const key in params) {
    const param = params[key];

    if (isParamWorkletNode(param)) {
      // Explicit casting to the expected type
      inputs[key] = param.input as ParamWorkletNodeToInputs<P>[typeof key];
    } else if (isParamWorkletConnector(param)) {
      // Explicit casting to the expected type
      inputs[key] = param(context)
        .input as ParamWorkletNodeToInputs<P>[typeof key];
    }
  }
  return inputs;
}
