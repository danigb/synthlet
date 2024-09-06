import { ParamInput } from "./_worklet";
import { getSynthlet } from "./synthlet";

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

export const KickDrum = (
  context: AudioContext,
  inputs: DrumInputs = {}
): DrumNode => {
  const s = getSynthlet(context);
  const p = {
    trigger: s.param(inputs.trigger),
    decay: s.param(inputs.decay ?? 0.8),
    volume: s.param(inputs.volume ?? 0),
    tone: s.param.lin(20, 100, inputs.tone ?? 0.2),
  };

  const synth = s.conn.serial(
    s.conn.mix(
      s.osc.sin(
        s.env.ad(p.trigger, {
          attack: 0.1,
          decay: p.decay,
          offset: p.tone,
          gain: 50,
        })
      ),
      s.impulse.trigger(p.trigger)
    ),
    s.amp.perc(p.trigger, 0.01, p.decay),
    s.clip.soft(5, 0.6)
  );
  return s.withParams(synth, p);
};

export const SnareDrum = (
  context: AudioContext,
  inputs: DrumInputs = {}
): DrumNode => {
  const { param, conn, osc, amp, noise, withParams } = getSynthlet(context);
  const trigger = param(inputs.trigger);
  const decay = param(inputs.decay ?? 0.8);
  const volume = param.db(inputs.volume ?? 0);
  const tone = param.lin(20, 100, inputs.tone ?? 0.2);

  const snap = conn.mixInto(
    [osc.sin(100), osc.sin(200)],
    amp.perc(trigger, 0.01, decay)
  );

  const splash = conn.serial(noise.white(), amp.perc(trigger, 0.01, decay));
  const synth = conn.mixInto([snap, splash], amp());
  return withParams(synth, { trigger, volume, tone, decay });
};

export const ClaveDrum = (
  context: AudioContext,
  inputs: DrumInputs = {}
): DrumNode => {
  const { param, osc, amp, synth, conn, bqf } = getSynthlet(context);
  const trigger = param(inputs.trigger);
  const decay = param(inputs.decay ?? 0.8);
  const volume = param.db(inputs.volume ?? 0);
  const tone = param.lin(1200, 1800, inputs.tone ?? 0.1);

  return synth({
    out: conn.serial(
      osc.tri(tone),
      amp.perc(trigger, 0.01, decay),
      bqf.lp(tone),
      amp(volume)
    ),
    inputs: { trigger, volume, tone, decay },
  });
};
