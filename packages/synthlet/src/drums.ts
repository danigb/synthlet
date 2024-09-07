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
  const s = getSynthlet(context);
  const params = toParams(s, inputs);

  const snap = s.conn.mixInto(
    [s.osc.sin(100), s.osc.sin(200)],
    s.amp.perc(params.trigger, 0.01, params.decay)
  );

  const splash = s.conn.serial(
    s.noise.white(),
    s.amp.perc(params.trigger, 0.01, params.decay)
  );
  const synth = s.conn.mixInto([snap, splash], s.gain(params.volume));
  return s.withParams(synth, params);
};

export const ClaveDrum = (
  context: AudioContext,
  inputs: DrumInputs = {}
): DrumNode => {
  const s = getSynthlet(context);
  const params = toParams(s, inputs);

  const freq = s.param.lin(2400, 2500, params.tone);
  const filterFreq = s.param.lin(1000, 3000, params.tone);

  return s.withParams(
    s.conn.serial(
      s.osc.tri(freq),
      s.amp.perc(params.trigger, 0.01, params.decay),
      s.bqf.bandpass(filterFreq),
      s.amp(params.volume)
    ),
    params
  );
};

export const HiHatDrum = (context: AudioContext, inputs: DrumInputs = {}) => {
  const s = getSynthlet(context);
  const params = toParams(s, inputs);

  const loFreq = s.param.lin(8000, 12000, params.tone);
  const hiFreq = s.param.add(-2000, loFreq);

  const freqs = [263, 400, 421, 474, 587, 845];
  const oscs = s.conn(
    freqs.map((f) => s.osc.square(f)),
    s.amp(0.3)
  );

  return s.withParams(
    s.conn(
      oscs,
      s.bqf.bandpass(loFreq),
      s.bqf.hi(hiFreq),
      s.amp.perc(params.trigger, 0.01, params.decay),
      s.gain(params.volume)
    ),
    params
  );
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
  const lowFreq = s.param.lin(440, 540, tone);
  const midFreq = s.param.lin(600, 1700, tone);
  const hiFreq = s.param.lin(2000, 5000, tone);
  const lowDecay = s.param.mul(0.5, decay);
  const midDecay = s.param.mul(0.2, decay);
  const hiDecay = s.param.mul(5, decay);

  const freqs = [263, 400, 421, 474, 587, 845];
  const oscs = s.conn(
    freqs.map((f) => s.osc.square(f)),
    s.amp(0.3)
  );

  const synth = s.conn(
    [
      s.conn(oscs, s.bqf.lp(lowFreq), s.amp.perc(trigger, 0.001, lowDecay)),
      s.conn(
        oscs,
        s.bqf.bandpass(midFreq),
        s.amp.perc(trigger, 0.001, midDecay)
      ),
      s.conn(oscs, s.bqf.hi(hiFreq), s.amp.perc(trigger, 0.001, hiDecay)),
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
    [
      s.conn(
        s.noise.white(),
        s.bqf.bandpass(freq),
        s.amp.perc(params.trigger, 0.02, params.decay),
        s.gain(s.lfo.rampUp(100))
      ),
      s.impulse.trigger(params.trigger),
    ],
    s.clip.soft(2, 0.5),
    s.gain(params.volume)
  );
  return s.withParams(synth, params);
};

export const TomDrum = (context: AudioContext, inputs: DrumInputs = {}) => {
  const s = getSynthlet(context);
  const params = toParams(s, inputs);

  const freq = s.param.lin(125, 240, params.tone);

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
  const params = toParams(s, inputs);

  const freq = s.param.lin(220, 455, params.tone);

  const synth = s.conn(
    [
      s.conn(s.osc.sin(freq), s.amp.perc(params.trigger, 0.001, params.decay)),
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
