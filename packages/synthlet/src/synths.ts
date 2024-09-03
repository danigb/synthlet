import { AdWorkletNode, createAdNode } from "@synthlet/ad";
import { createImpulseNode } from "@synthlet/impulse";
import { disposable } from "./_worklet";
import { createConstantSource, createGain, createOscillator } from "./waa";

const $ = {
  osc: createOscillator,
  gain: createGain,
  param: createConstantSource,
  ad: createAdNode,
  pulse: createImpulseNode,
};

export type KickNode = GainNode & {
  trigger: AudioParam;
  env: AdWorkletNode;
  dispose(): void;
};

export type KickParams = {};

export function Kick(context: AudioContext) {
  const trigger = $.param(context);
  const osc = $.osc(context, { type: "sine", frequency: 48 });
  const click = $.pulse(context, { trigger });

  const env = $.ad(context, { trigger, attack: 0.01, decay: 0.1 });
  const kick = $.gain(context, { gain: env }) as KickNode;
  kick.env = env;
  kick.trigger = trigger.offset;

  click.connect(kick);
  osc.connect(kick);
  return disposable(kick, [osc, env, trigger, click]);
}
