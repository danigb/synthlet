import { createOperators } from "../operators";
import { ParamInput } from "./_worklet";

export type DrumNode = AudioNode & {
  trigger: AudioParam;
  volume: AudioParam;
  tone: AudioParam;
  decay: AudioParam;
  dispose(): void;
};
export type KickDrumNode = DrumNode & {};

export function KickDrum(context: AudioContext): KickDrumNode {
  const op = createOperators(context);

  const trigger = op.param();
  const decay = op.param(0.8);
  const volume = op.param.db();
  const tone = op.param.lin(20, 100, 0.2);

  const out = op.conn(
    [
      op.osc.sine(op.env.ad(trigger, 0.1, decay, { offset: tone, gain: 50 })),
      op.impulse(trigger),
    ],
    op.amp.perc(trigger, 0.01, decay),
    op.clip.soft(5, 0.6)
  );

  return op.synth(out, { trigger, volume, tone, decay });
}

export type SnareDrumNode = DrumNode & {};

export function SnareDrum(context: AudioContext): SnareDrumNode {
  const op = createOperators(context);

  const trigger = op.param();
  const volume = op.param.db();
  const decay = op.param();
  const tone = op.param();

  const out = op.conn(
    [
      op.conn(op.noise.white(), op.amp.perc(trigger, 0.01, decay)),
      op.conn(
        [op.osc.sine(100), op.osc.sine(200)],
        op.amp.perc(trigger, 0.01, decay)
      ),
    ],
    op.amp(volume)
  );

  return op.synth(out, { trigger, volume, tone, decay });
}

type ClaveDrumInputs = {
  volume?: ParamInput;
  trigger?: ParamInput;
  decay?: ParamInput;
  tone?: ParamInput;
};

export function ClaveDrum(
  context: AudioContext,
  params: ClaveDrumInputs = {}
): DrumNode {
  const op = createOperators(context);

  const volume = op.param.db(params.volume ?? 0);
  const trigger = op.param(params.trigger);
  const decay = op.param(params.decay);
  const tone = op.param.lin(1200, 1800, params.tone);

  const out = op.conn(
    op.osc.tri(tone),
    op.amp.perc(trigger, 0.01, 0.05),
    op.bq.lp(tone),
    op.amp(2),
    op.amp(volume)
  );

  return op.synth(out, { trigger, volume, tone, decay });
}
