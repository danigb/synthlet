import { ParamInput } from "./_worklet";
import { createOperators } from "./operators";

export type DrumInputs = {
  volume?: ParamInput;
  trigger?: ParamInput;
  decay?: ParamInput;
  tone?: ParamInput;
};

export type DrumNode = AudioNode & {
  trigger: AudioParam;
  volume: AudioParam;
  tone: AudioParam;
  decay: AudioParam;
  dispose(): void;
};
export type KickDrumNode = DrumNode & {};

export const KickDrum = (inputs?: DrumInputs) => (context: AudioContext) =>
  createKickDrum(context, inputs);

export function createKickDrum(
  context: AudioContext,
  inputs: DrumInputs = {}
): KickDrumNode {
  const op = createOperators(context);

  const trigger = op.param(inputs.trigger);
  const decay = op.param(inputs.decay ?? 0.8);
  const volume = op.param.db(inputs.volume);
  const tone = op.param.lin(20, 100, inputs.tone ?? 0.2);

  const out = op.conn(
    [
      op.osc.sin(op.env.ad(trigger, 0.1, decay, { offset: tone, gain: 50 })),
      op.impulse(trigger),
    ],
    op.amp.perc(trigger, 0.01, decay),
    op.clip.soft(5, 0.6)
  );

  return op.synth(out, { trigger, volume, tone, decay });
}

export const SnareDrum = (inputs?: DrumInputs) => (context: AudioContext) =>
  createSnareDrum(context, inputs);

export function createSnareDrum(
  context: AudioContext,
  inputs: DrumInputs = {}
): DrumNode {
  const op = createOperators(context);

  const trigger = op.param(inputs.trigger);
  const volume = op.param.db(inputs.volume);
  const decay = op.param(inputs.decay ?? 0.2);
  const tone = op.param(inputs.tone ?? 2000);

  const out = op.conn(
    [
      op.conn(op.noise.white(), op.amp.perc(trigger, 0.01, decay)),
      op.conn(
        [op.osc.sin(100), op.osc.sin(200)],
        op.amp.perc(trigger, 0.01, decay)
      ),
    ],
    op.amp(volume)
  );

  return op.synth(out, { trigger, volume, tone, decay });
}

export const ClaveDrum = (inputs?: DrumInputs) => (context: AudioContext) =>
  createClaveDrum(context, inputs);

export function createClaveDrum(
  context: AudioContext,
  inputs: DrumInputs = {}
): DrumNode {
  const op = createOperators(context);

  const volume = op.param.db(inputs.volume ?? 0);
  const trigger = op.param(inputs.trigger);
  const decay = op.param(inputs.decay);
  const tone = op.param.lin(1200, 1800, inputs.tone);

  const out = op.conn(
    op.osc.tri(tone),
    op.amp.perc(trigger, 0.01, 0.05),
    op.bq.lp(tone),
    op.amp(2),
    op.amp(volume)
  );

  return op.synth(out, { trigger, volume, tone, decay });
}
