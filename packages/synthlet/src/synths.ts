import { ClipType } from "@synthlet/clip-amp";
import { createOperators } from "../operators";

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
  const tone = op.param.lin(30, 100, 0.2);

  const toneEnv = op.ad(trigger, 0.1, decay, { offset: tone, gain: 50 });

  const out = op.serial(
    op.mix(
      [op.sine(toneEnv), op.impulse(trigger)],
      op.perc(trigger, 0.01, decay)
    ),
    op.softClip(3, 0.5, ClipType.Tanh)
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

  const out = op.mix(
    [
      op.serial(op.white(), op.perc(trigger, 0.01, decay)),
      op.mix([op.sine(100), op.sine(200)], op.perc(trigger, 0.01, decay)),
    ],
    op.amp(volume)
  );

  return op.synth(out, { trigger, volume, tone, decay });
}

export function ClaveDrum(context: AudioContext): DrumNode {
  const op = createOperators(context);

  const volume = op.param.db();
  const trigger = op.param();
  const decay = op.param();
  const tone = op.param.lin(1200, 1800, 0.6);

  const out = op.serial(
    op.tri(tone),
    op.ad(trigger, 0.01, 0.05),
    op.bpf(tone),
    op.amp(volume)
  );

  return op.synth(out, { trigger, volume, tone, decay });
}
