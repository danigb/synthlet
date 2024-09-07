import { ParamInput } from "./_worklet";
import { getSynthlet, Synthlet } from "./synthlet";

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

export const KickDrum = (
  context: AudioContext,
  inputs: DrumInputs = {}
): DrumNode => {
  const s = getSynthlet(context);
  const params = toParams(s, inputs);

  const freq = s.param.lin(20, 100, params.tone);

  const synth = s.conn.serial(
    s.conn.mix(
      s.osc.sin(
        s.env.ad(params.trigger, {
          attack: 0.1,
          decay: params.decay,
          offset: freq,
          gain: 50,
        })
      ),
      s.impulse.trigger(params.trigger)
    ),
    s.amp.perc(params.trigger, 0.01, params.decay),
    s.clip.soft(5, 0.6)
  );
  return s.withParams(synth, params);
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
  const s = getSynthlet(context);
  const { trigger, decay, volume, tone } = toParams(s, inputs);

  const freq = s.param.lin(1200, 1800, tone);

  return s.synth({
    out: s.conn.serial(
      s.osc.tri(tone),
      s.amp.perc(trigger, 0.01, decay),
      s.bqf.lp(tone),
      s.amp(volume)
    ),
    params: { trigger, volume, tone, decay },
  });
};

export const HiHatDrum = (context: AudioContext, inputs: DrumInputs = {}) => {
  const s = getSynthlet(context);
  const { trigger, decay, volume, tone } = toParams(s, inputs);

  const loFreq = s.param.lin(8000, 12000, tone);
  const hiFreq = s.param(-2000, { offset: loFreq });

  const freqs = [263, 400, 421, 474, 587, 845];
  const oscs = s.conn(
    freqs.map((f) => s.osc.square(f)),
    s.amp(0.3)
  );

  return s.synth({
    out: s.conn(
      oscs,
      s.bqf.bandpass(tone),
      s.bqf.hi(hiFreq),
      s.amp.perc(trigger, 0.01, decay),
      s.amp(volume)
    ),
    params: { trigger, volume, tone, decay },
  });
};

export const CowBellDrum = (context: AudioContext, inputs: DrumInputs = {}) => {
  const s = getSynthlet(context);
  const { trigger, decay, volume, tone } = toParams(s, inputs);

  // Derived
  const hiFreq = s.param.lin(700, 900, tone);
  const lowFreq = s.param.lin(440, 540, tone);
  const shortDecay = s.param.mul(0.1, decay);

  const synth = s.conn(
    [
      s.conn.serial(s.osc.square(hiFreq), s.amp.perc(trigger, 0.001, decay)),
      s.conn.serial(
        s.osc.square(lowFreq),
        s.amp.perc(trigger, 0.001, shortDecay)
      ),
    ],
    s.amp(volume)
  );
  return s.withParams(synth, { trigger, volume, tone, decay });
};

export const CymbalDrum = (context: AudioContext, inputs: DrumInputs = {}) => {
  const s = getSynthlet(context);
  const { trigger, decay, volume, tone } = toParams(s, inputs);

  // Derived
  const hiFreq = s.param.lin(700, 900, tone);
  const lowFreq = s.param.lin(440, 540, tone);
  const shortDecay = s.param.mul(0.1, decay);

  const synth = s.conn(
    [
      s.conn.serial(s.osc.square(hiFreq), s.amp.perc(trigger, 0.001, decay)),
      s.conn.serial(
        s.osc.square(lowFreq),
        s.amp.perc(trigger, 0.001, shortDecay)
      ),
    ],
    s.amp(volume)
  );
  return s.withParams(synth, { trigger, volume, tone, decay });
};

export const MaracasDrum = (context: AudioContext, inputs: DrumInputs = {}) => {
  const s = getSynthlet(context);
  const params = toParams(s, inputs);

  const freq = s.param.lin(4000, 6000, params.tone);

  const synth = s.conn(
    s.noise.white(),
    s.bqf.hi(freq),
    s.amp.perc(params.trigger, 0.02, params.decay),
    s.amp(params.volume)
  );
  return s.withParams(synth, params);
};

export const HandclapDrum = (
  context: AudioContext,
  inputs: DrumInputs = {}
) => {
  const s = getSynthlet(context);
  const params = toParams(s, inputs);
  const freq = s.param.lin(500, 1500, params.tone);

  const synth = s.conn(
    s.noise.white(),
    s.bqf.bandpass(freq),
    s.amp.perc(params.trigger, 0.02, params.decay),
    s.gain(s.lfo.rampUp(0.1)),
    s.gain(params.volume)
  );
  return s.withParams(synth, params);
};

export const TomDrum = (context: AudioContext, inputs: DrumInputs = {}) => {
  const s = getSynthlet(context);
  const params = toParams(s, inputs);

  const freq = s.param.lin(200, 400, params.tone);

  const synth = s.conn(
    [
      s.conn(s.osc.sin(freq), s.amp.perc(params.trigger, 0.01, params.decay)),
      s.conn(s.impulse.trigger(params.trigger), s.gain(0.3)),
      s.conn(s.noise.pink(), s.amp.perc(params.trigger, 0.01, params.decay)),
    ],
    s.amp(params.volume)
  );
  return s.withParams(synth, params);
};

export const CongaDrum = (context: AudioContext, inputs: DrumInputs = {}) => {
  const s = getSynthlet(context);
  //const params = toParams(s, inputs);
  const params = {
    trigger: s.param(),
  };

  // const freq = s.param.lin(200, 400, params.tone);
  const freq = 300;

  const synth = s.conn(
    [
      s.conn(s.osc.sin(freq), s.amp.perc(params.trigger)),
      s.conn(s.impulse.trigger(params.trigger), s.gain(0.3)),
    ],
    s.amp(1)
  );
  return s.withParams(synth, params);
};

function toParams(s: Synthlet, inputs: DrumInputs = {}) {
  const trigger = s.param(inputs.trigger);
  const decay = s.param(inputs.decay ?? 0.5);
  const volume = s.param.db(inputs.volume ?? 0);
  const tone = s.param(inputs.tone ?? 0.5);

  return { trigger, decay, volume, tone };
}
