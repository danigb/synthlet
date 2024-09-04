import { AdInputParams, createAdNode } from "@synthlet/ad";
import { createClipAmpNode } from "@synthlet/clip-amp";
import { createImpulseNode } from "@synthlet/impulse";
import { createNoiseNode } from "@synthlet/noise";
import { createParamNode, ParamType, ParamWorkletNode } from "@synthlet/param";
import { DisposableAudioNode, ParamInput } from "./src/_worklet";
import {
  createConstantNode,
  createFilter,
  createGain,
  createOscillator,
} from "./src/waa";

export type Operators = ReturnType<typeof createOperators>;

export function createOperators(context: AudioContext) {
  const set = new Set<DisposableAudioNode>();

  const add = <T extends DisposableAudioNode>(node: T): T => {
    if (!set.has(node)) console.log("ADD", node);
    set.add(node);
    return node;
  };
  const disposer = (node: AudioNode) => {
    const _dispose = (node as any).dispose;
    const disposables = Array.from(set).filter((d) => d !== node);
    set.clear();
    console.log("DISPOSER", node, disposables);
    return () => {
      _dispose?.();
      disposables.forEach((d) => d.dispose());
    };
  };

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
    // Parameters
    trigger: () => add(createParamNode(context)),
    param: (value?: ParamInput) =>
      add(createParamNode(context, { input: value })),
    dbToGain: (value?: ParamInput) =>
      add(
        createParamNode(context, { input: value, type: ParamType.DB_TO_GAIN })
      ),
    volume: (offset?: ParamInput) =>
      add(createParamNode(context, { offset, type: ParamType.DB_TO_GAIN })),
    linear: (min: ParamInput, max: ParamInput, value?: ParamInput) =>
      add(
        createParamNode(context, {
          input: value,
          type: ParamType.LINEAR,
          min,
          max,
        })
      ),

    // Oscillators
    sine: (frequency?: ParamInput, detune?: ParamInput) =>
      add(createOscillator(context, { type: "sine", frequency, detune })),
    tri: (frequency?: ParamInput, detune?: ParamInput) =>
      add(createOscillator(context, { type: "triangle", frequency, detune })),

    white: () => add(createNoiseNode(context)),

    pulse: (trigger: ParamInput) =>
      add(createImpulseNode(context, { trigger })),

    // Envelope generators
    genAd: (trigger: ParamInput, attack?: ParamInput, decay?: ParamInput) =>
      add(createAdNode(context, { trigger, attack, decay })),

    // Amplifiers
    amp: (gain?: ParamInput) =>
      add(createClipAmpNode(context, { postGain: gain })),
    softClip: (pre: number, post: number, type: number) =>
      add(
        createClipAmpNode(context, {
          preGain: pre,
          postGain: post,
          clipType: type,
        })
      ),

    // Attack-Decay
    ad: (
      trigger: ParamInput,
      attack?: ParamInput,
      decay?: ParamInput,
      params?: Partial<AdInputParams>
    ) =>
      add(
        createGain(context, {
          gain: createAdNode(context, { trigger, attack, decay, ...params }),
        })
      ),

    // === FILTERS ===
    // Low Pass Filter
    lpf: (frequency?: ParamInput, Q?: ParamInput) =>
      add(createFilter(context, { type: "lowpass", frequency, Q })),
    bpf: (frequency?: ParamInput, Q?: ParamInput) =>
      add(createFilter(context, { type: "bandpass", frequency, Q })),

    // Math
    add: (...inputs: ParamInput[]) => {
      const g = createGain(context, { gain: 1 });
      inputs.forEach((input) => {
        if (typeof input === "number") {
          add(createConstantNode(context, input)).connect(g);
        } else if (input instanceof AudioNode) {
          input.connect(g);
        }
      });
      return add(g);
    },

    // Dispose
    synth<T extends AudioNode, P extends ControlParams>(
      node: T,
      params?: P
    ): T & DisposableAudioNode & ParamWorkletNodeToInputs<P> {
      return Object.assign(node, {
        dispose: disposer(node),
        ...convertParamsToInputs(params),
      });
    },
    disposer,
  };
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
