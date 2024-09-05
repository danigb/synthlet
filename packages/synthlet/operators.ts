import { AdInputParams, createAdNode } from "@synthlet/ad";
import { AdsrInputParams, createVcaNode } from "@synthlet/adsr";
import { createClipAmpNode } from "@synthlet/clip-amp";
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
  createConstantNode,
  createFilter,
  createGain,
  createOscillator,
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
    console.log("Loading wavetable", urlOrName);
    this.promise
      .then((wavetable) => {
        console.log("READY", urlOrName);
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
  // Polyblep Oscillator
  const oscp = (
    type?: ParamInput,
    frequency?: ParamInput,
    params?: Partial<PolyblepOscillatorInputParams>
  ) => oc.add(createPolyblepOscillatorNode(context, { type, ...params }));

  return {
    // Connect
    serial: (...nodes: AudioNode[]) =>
      nodes.reduce((prev, current) => {
        prev.connect(current);
        return current;
      }),

    mix<N extends AudioNode>(nodes: AudioNode[], destination: N): N {
      nodes.forEach((node) => node.connect(destination));
      return destination;
    },

    // Params
    param,
    table: (urlOrName: string) => new WavetableLoadOperator(urlOrName),

    // Oscillators
    oscp: Object.assign(oscp, {
      tri: (frequency?: ParamInput) =>
        oscp(PolyblepWaveformType.TRIANGLE, frequency),
      saw: (frequency?: ParamInput) =>
        oscp(PolyblepWaveformType.SAWTOOTH, frequency),
    }),
    sine: (frequency?: ParamInput, detune?: ParamInput) =>
      oc.add(createOscillator(context, { type: "sine", frequency })),
    tri: (frequency?: ParamInput, detune?: ParamInput) =>
      oc.add(
        createPolyblepOscillatorNode(context, {
          type: PolyblepWaveformType.TRIANGLE,
          frequency,
        })
      ),
    white: () => oc.add(createNoiseNode(context)),
    wt: (
      loader: WavetableLoadOperator,
      frequency?: ParamInput,
      params?: Partial<WavetableInputParams>
    ) =>
      oc.add(
        loader.register(
          createWavetableOscillatorNode(context, { frequency, ...params })
        )
      ),

    impulse: (trigger: ParamInput) =>
      oc.add(createImpulseNode(context, { trigger })),

    // Envelope generators
    ad: (
      trigger: ParamInput,
      attack?: ParamInput,
      decay?: ParamInput,
      params?: Partial<AdInputParams>
    ) => oc.add(createAdNode(context, { trigger, attack, decay, ...params })),

    // Amplifiers
    amp: (gain?: ParamInput) =>
      oc.add(createClipAmpNode(context, { postGain: gain })),
    softClip: (pre: number, post: number, type: number) =>
      oc.add(
        createClipAmpNode(context, {
          preGain: pre,
          postGain: post,
          clipType: type,
        })
      ),
    vca: (gate: ParamInput, params?: Partial<AdsrInputParams>) =>
      oc.add(createVcaNode(context, { gate, ...params })),

    // Attack-Decay (percussive) envelope
    perc: (
      trigger: ParamInput,
      attack?: ParamInput,
      decay?: ParamInput,
      params?: Partial<AdInputParams>
    ) =>
      oc.add(
        createGain(context, {
          gain: createAdNode(context, { trigger, attack, decay, ...params }),
        })
      ),

    // === FILTERS ===
    // Low Pass Filter
    lpf: (frequency?: ParamInput, Q?: ParamInput) =>
      oc.add(createFilter(context, { type: "lowpass", frequency, Q })),
    bpf: (frequency?: ParamInput, Q?: ParamInput) =>
      oc.add(createFilter(context, { type: "bandpass", frequency, Q })),

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
