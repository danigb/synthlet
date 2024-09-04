import { AdInputParams, AdWorkletNode, createAdNode } from "@synthlet/ad";
import { createImpulseNode } from "@synthlet/impulse";
import { createNoiseNode, NoiseType } from "@synthlet/noise";
import { createParamNode, ParamType } from "@synthlet/param";
import { disposable } from "./_worklet";
import { createFilter, createGain, createOscillator } from "./waa";

const $ = {
  osc: createOscillator,
  gain: createGain,
  param: createParamNode,
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
  volume: AudioParam;
  dispose(): void;
};
export type KickDrumNode = DrumNode & {};

export function KickDrum(context: AudioContext): KickDrumNode {
  const trigger = $.param(context);
  const volume = $.param(context, { type: ParamType.DB_TO_GAIN, input: -6 });

  const osc = $.osc(context, { type: "sine", frequency: 48 });
  const click = $.pulse(context, { trigger });

  const env = $.gain(context, {
    gain: $.ad(context, { trigger, attack: 0.01, decay: 0.1 }),
  });
  const out = $.gain(context, { gain: volume }) as KickDrumNode;

  click.connect(env);
  osc.connect(env);
  env.connect(out);

  out.trigger = trigger.input;
  out.volume = volume.input;
  return disposable(out, [osc, env, trigger, click]);
}

export type SnareDrumNode = DrumNode & {};

export function SnareDrum(context: AudioContext): SnareDrumNode {
  const trigger = $.param(context);
  const volume = $.param(context, { type: ParamType.DB_TO_GAIN, input: -6 });
  const tone = $.param(context, { input: 0.7 });

  const snap = $.gain(context, {
    gain: $.ad(context, { trigger, attack: 0.01, decay: 0.1 }),
  });
  $.osc(context, {
    type: "sine",
    frequency: $.param(context, {
      input: tone,
      type: ParamType.LINEAR,
      min: 200,
      max: 300,
    }),
  }).connect(snap);
  $.osc(context, { type: "sine", frequency: 476 }).connect(snap);

  const noise = $.noise(context, { type: NoiseType.WHITE });
  const lpf = $.filter(context, { type: "highpass", frequency: 1800 });
  const tail = $.gain(context, {
    gain: $.ad(context, { trigger, attack: 0.01, decay: 0.2 }),
  });
  noise.connect(lpf).connect(tail);

  const out = $.gain(context, { gain: volume }) as SnareDrumNode;
  snap.connect(out);
  tail.connect(out);

  out.trigger = trigger.input;
  out.volume = volume.input;

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
  out.trigger = trigger.input;
  return disposable(out, [osc, env, trigger]);
}
