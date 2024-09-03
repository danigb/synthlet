import { AdWorkletNode, createAdNode } from "@synthlet/ad";
import { createImpulseNode } from "@synthlet/impulse";
import { disposable } from "./_worklet";
import {
  createConstantSource,
  createFilter,
  createGain,
  createOscillator,
} from "./waa";

const $ = {
  osc: createOscillator,
  gain: createGain,
  param: createConstantSource,
  ad: createAdNode,
  pulse: createImpulseNode,
  filter: createFilter,
};

export type KickDrumNode = GainNode & {
  trigger: AudioParam;
  env: AdWorkletNode;
  dispose(): void;
};

export function KickDrum(context: AudioContext): KickDrumNode {
  const trigger = $.param(context);
  const osc = $.osc(context, { type: "sine", frequency: 48 });
  const click = $.pulse(context, { trigger });

  const env = $.ad(context, { trigger, attack: 0.01, decay: 0.1 });
  const out = $.gain(context, { gain: env }) as KickDrumNode;
  out.env = env;
  out.trigger = trigger.offset;

  click.connect(out);
  osc.connect(out);
  return disposable(out, [osc, env, trigger, click]);
}

export type ClaveDrumNode = GainNode & {
  trigger: AudioParam;
  env: AdWorkletNode;
  dispose(): void;
};

export function ClaveDrum(context: AudioContext): ClaveDrumNode {
  const trigger = $.param(context);
  const osc = $.osc(context, { type: "triangle", frequency: 1450 });

  const env = $.ad(context, { trigger, attack: 0.01, decay: 0.05 });
  const out = $.gain(context, { gain: env }) as ClaveDrumNode;
  const bpf = $.filter(context, { type: "bandpass", frequency: 1450 });
  out.env = env;
  out.trigger = trigger.offset;

  osc.connect(bpf).connect(out);
  return disposable(out, [osc, env, trigger]);
}
