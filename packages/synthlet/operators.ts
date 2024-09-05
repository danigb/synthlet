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
import { DisposableAudioNode, ParamInput } from "./src/_worklet";
import {
  BiquadFilterInputs,
  createBiquadFilter,
  createConstantNode,
  createGain,
  createOscillator,
  OscillatorInputs,
} from "./src/waa";

export type Operators = ReturnType<typeof createOperators>;

export class WavetableLoadOperator {
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

export function createOperators(context: AudioContext) {
  const oc = new OperatorContext();
  const param = createParamOperators(context, oc);
  const wt = createWavetableOperators(context, oc);
  const oscp = createPolyblepOperators(context, oc);
  const osc = createOscillatorOperators(context, oc);
  const amp = createAmpOperators(context, oc);
  const bq = createBiquadFilterOperators(context, oc);
  const noise = createNoiseOperators(context, oc);
  const clip = createClipAmpOperators(context, oc);
  const env = createEnvelopeGeneratorOperators(context, oc);
  const conn = createConnectionOperators(context, oc);

  return {
    param,
    wt,
    oscp,
    osc,
    amp,
    bq,
    noise,
    clip,
    env,
    conn,

    impulse: (trigger: ParamInput) =>
      oc.add(createImpulseNode(context, { trigger })),

    // Math
    add: (...inputs: ParamInput[]) => {
      const g = createGain(context, { gain: 1 });
      inputs.forEach((input) => {
        if (typeof input === "number") {
          oc.add(createConstantNode(context, input)).connect(g);
        } else if (input instanceof AudioNode) {
          input.connect(g);
        }
      });
      return oc.add(g);
    },

    // Dispose
    synth<T extends AudioNode, P extends ControlParams>(
      node: T,
      params?: P
    ): T & DisposableAudioNode & ParamWorkletNodeToInputs<P> {
      return Object.assign(node, {
        dispose: oc.disposer(node),
        ...convertParamsToInputs(params),
      });
    },
  };
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
    sine: (frequency?: ParamInput, options?: Partial<OscillatorInputs>) =>
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
    db: (db?: number) => param(db, { type: ParamType.DB_TO_GAIN }),
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

type ControlParams = Record<string, ParamWorkletNode>;

type ParamWorkletNodeToInputs<T extends ControlParams> = {
  [K in keyof T]: T[K]["input"];
};

function convertParamsToInputs<P extends ControlParams>(
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
