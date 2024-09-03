import { AdInputParams, AdWorkletNode, createAdNode } from "@synthlet/ad";
import { createImpulseNode } from "@synthlet/impulse";
import { createNoiseNode, NoiseType } from "@synthlet/noise";
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
  noise: createNoiseNode,
  perc: (context: AudioContext, options: Partial<AdInputParams>) => {
    const ad = $.ad(context, options);
    const amp = $.gain(context, { gain: ad });
  },
};

export type DrumNode = GainNode & {
  trigger: AudioParam;
  env: AdWorkletNode;
  dispose(): void;
};
export type KickDrumNode = DrumNode & {};

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

export type SnareDrumNode = DrumNode & {};

export function SnareDrum(context: AudioContext): SnareDrumNode {
  const trigger = $.param(context);

  const snap = $.gain(context, {
    gain: $.ad(context, { trigger, attack: 0.01, decay: 0.1 }),
  });
  $.osc(context, { type: "sine", frequency: 238 }).connect(snap);
  $.osc(context, { type: "sine", frequency: 476 }).connect(snap);

  const noise = $.noise(context, { type: NoiseType.WHITE });
  const lpf = $.filter(context, { type: "highpass", frequency: 1800 });
  const tail = $.gain(context, {
    gain: $.ad(context, { trigger, attack: 0.01, decay: 0.2 }),
  });
  noise.connect(lpf).connect(tail);

  const out = $.gain(context, { gain: 1 }) as SnareDrumNode;
  snap.connect(out);
  tail.connect(out);

  out.trigger = trigger.offset;

  return disposable(out, [snap, tail, lpf]);
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
  osc.connect(bpf).connect(out);

  out.env = env;
  out.trigger = trigger.offset;
  return disposable(out, [osc, env, trigger]);
}
