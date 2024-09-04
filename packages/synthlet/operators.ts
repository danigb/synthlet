import { createAdNode } from "@synthlet/ad";
import { createImpulseNode } from "@synthlet/impulse";
import { createNoiseNode } from "@synthlet/noise";
import { createParamNode, ParamType } from "@synthlet/param";
import { DisposableAudioNode, ParamInput } from "./src/_worklet";
import { createFilter, createGain, createOscillator } from "./src/waa";

export function createOperators(context: AudioContext) {
  const set = new Set<DisposableAudioNode>();
  const add = <T extends DisposableAudioNode>(node: T): T => {
    set.add(node);
    return node;
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
    amp: (gain?: ParamInput) => createGain(context, { gain }),
    ad: (trigger: ParamInput, attack?: ParamInput, decay?: ParamInput) =>
      createGain(context, {
        gain: createAdNode(context, { trigger, attack, decay }),
      }),

    // Filters
    lpf: (frequency?: ParamInput, Q?: ParamInput) =>
      add(createFilter(context, { type: "lowpass", frequency, Q })),
    bpf: (frequency?: ParamInput, Q?: ParamInput) =>
      add(createFilter(context, { type: "bandpass", frequency, Q })),

    // Dispose
    disposer: (node: AudioNode) => {
      const _dispose = (node as any).dispose;
      const disposables = Array.from(set).filter((d) => d !== node);
      set.clear();
      return () => {
        _dispose?.();
        disposables.forEach((d) => d.dispose());
      };
    },
  };
}
