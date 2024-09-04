import { createOperators } from "../operators";

export type DrumNode = AudioNode & {
  trigger: AudioParam;
  volume: AudioParam;
  tone: AudioParam;
  dispose(): void;
};
export type KickDrumNode = DrumNode & {};

export function KickDrum(context: AudioContext): KickDrumNode {
  const op = createOperators(context);

  const trigger = op.trigger();
  const volume = op.volume();
  const tone = op.param();

  const out = op.serial(
    op.mix([op.sine(100), op.pulse(trigger)], op.ad(trigger, 0.01, 0.1)),
    op.amp(volume)
  );

  return Object.assign(out, {
    trigger: trigger.input,
    volume: volume.input,
    tone: tone.input,
    dispose: op.disposer(out),
  });
}

export type SnareDrumNode = DrumNode & {};

export function SnareDrum(context: AudioContext): SnareDrumNode {
  const op = createOperators(context);

  const trigger = op.trigger();
  const volume = op.volume();
  const tone = op.param();

  const out = op.mix(
    [
      op.serial(op.white(), op.ad(trigger)),
      op.mix([op.sine(100), op.sine(200)], op.ad(trigger)),
    ],
    op.amp(volume)
  );

  return Object.assign(out, {
    trigger: trigger.input,
    volume: volume.input,
    tone: tone.input,
    dispose: op.disposer(out),
  });
}

export function ClaveDrum(context: AudioContext): DrumNode {
  const op = createOperators(context);

  const volume = op.volume();
  const trigger = op.trigger();
  const tone = op.linear(1200, 1800, 0.6);

  const out = op.serial(
    op.tri(tone),
    op.ad(trigger, 0.01, 0.05),
    op.bpf(tone),
    op.amp(volume)
  );

  return Object.assign(out, {
    trigger: trigger.input,
    volume: volume.input,
    tone: tone.input,
    dispose: op.disposer(out),
  });
}
