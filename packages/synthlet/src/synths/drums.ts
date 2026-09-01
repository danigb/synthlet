import { AdAmp, AdEnv } from "@synthlet/ad";
import { ClipAmp, ClipType } from "@synthlet/clip-amp";
import { Impulse } from "@synthlet/impulse";
import { Lfo, LfoType } from "@synthlet/lfo";
import { Noise, NoiseType } from "@synthlet/noise";
import { Param } from "@synthlet/param";
import {
  Compound,
  CompoundNode,
  Disposable,
  disposable,
  ParamInput,
} from "../_worklet";
import { BiquadFilter, Gain, Oscillator } from "../waa";

export type DrumInputs = {
  volume?: ParamInput;
  trigger?: ParamInput;
  decay?: ParamInput;
  tone?: ParamInput;
};

export type DrumNode = CompoundNode<
  GainNode,
  {
    trigger: AudioParam;
    volume: AudioParam;
    tone: AudioParam;
    decay: AudioParam;
  }
>;

/**
 * The four knobs every drum has, as Param nodes. Each one is scaled (`volume`,
 * from decibels) or fanned out to several modules (`trigger`, to every
 * envelope), so a plain AudioParam won't do: the inlet has to be a node.
 */
function toParams(context: AudioContext, inputs: DrumInputs = {}) {
  return {
    trigger: Param(context, { input: inputs.trigger }),
    decay: Param(context, { input: inputs.decay ?? 0.5 }),
    volume: Param.db(context, inputs.volume ?? 0),
    tone: Param(context, { input: inputs.tone ?? 0.5 }),
  };
}

type DrumParams = ReturnType<typeof toParams>;

/**
 * Every drum ends the same way: the output gain owns everything the drum
 * built, and the four knobs are exposed as plain AudioParams. A drum is a
 * voice, not a kit - `trigger`, `tone`, `decay` and `volume` are the whole
 * surface, so the modules stay private.
 */
function drum(
  out: Disposable<GainNode>,
  params: DrumParams,
  owned: Disposable<AudioNode>[]
): DrumNode {
  return Compound({
    output: out,
    owns: [...owned, ...Object.values(params)],
    exposes: {
      trigger: params.trigger.input,
      decay: params.decay.input,
      volume: params.volume.input,
      tone: params.tone.input,
    },
  });
}

/** A percussive amplifier: the input, shaped by an attack-decay envelope. */
const perc = (
  context: AudioContext,
  params: DrumParams,
  attack: number,
  decay: ParamInput = params.decay
) => AdAmp(context, { trigger: params.trigger, attack, decay });

const OSC_BANK_FREQUENCIES = [263, 400, 421, 474, 587, 845];

/** The bank of squares that gives cymbals and hi-hats their metallic noise. */
function oscBank(context: AudioContext) {
  const oscs = OSC_BANK_FREQUENCIES.map((frequency) =>
    Oscillator(context, { type: "square", frequency })
  );
  const out = Gain(context, { gain: 0.3 });
  oscs.forEach((osc) => osc.connect(out));
  return disposable(out, oscs);
}

export const KickDrum = (
  context: AudioContext,
  inputs: DrumInputs = {}
): DrumNode => {
  const params = toParams(context, inputs);
  const freq = Param.lin(context, params.tone, 20, 100);

  const pitchEnv = AdEnv(context, {
    trigger: params.trigger,
    attack: 0.1,
    decay: params.decay,
    offset: freq,
    gain: 50,
  });
  const osc = Oscillator(context, { type: "sine", frequency: pitchEnv });
  const click = Impulse(context, { trigger: params.trigger });
  const mix = Gain(context);
  const amp = perc(context, params, 0.01);
  const clip = ClipAmp(context, {
    type: ClipType.Tanh,
    preGain: 5,
    postGain: 0.6,
  });
  const out = Gain(context, { gain: params.volume });

  [osc, click].forEach((node) => node.connect(mix));
  mix.connect(amp).connect(clip).connect(out);

  return drum(out, params, [freq, pitchEnv, osc, click, mix, amp, clip]);
};

export const SnareDrum = (
  context: AudioContext,
  inputs: DrumInputs = {}
): DrumNode => {
  const params = toParams(context, inputs);

  const oscs = [100, 200].map((frequency) =>
    Oscillator(context, { type: "sine", frequency })
  );
  const snap = perc(context, params, 0.01);
  oscs.forEach((osc) => osc.connect(snap));

  const noise = Noise(context, { type: NoiseType.White });
  const splash = perc(context, params, 0.01);
  noise.connect(splash);

  const out = Gain(context, { gain: params.volume });
  [snap, splash].forEach((node) => node.connect(out));

  return drum(out, params, [...oscs, snap, noise, splash]);
};

export const ClaveDrum = (
  context: AudioContext,
  inputs: DrumInputs = {}
): DrumNode => {
  const params = toParams(context, inputs);
  const freq = Param.lin(context, params.tone, 2400, 2500);
  const filterFreq = Param.lin(context, params.tone, 1000, 3000);

  const osc = Oscillator(context, { type: "triangle", frequency: freq });
  const amp = perc(context, params, 0.01);
  const filter = BiquadFilter(context, {
    type: "bandpass",
    frequency: filterFreq,
  });
  const out = Gain(context, { gain: params.volume });

  osc.connect(amp).connect(filter).connect(out);

  return drum(out, params, [freq, filterFreq, osc, amp, filter]);
};

export const HiHatDrum = (
  context: AudioContext,
  inputs: DrumInputs = {}
): DrumNode => {
  const params = toParams(context, inputs);
  const loFreq = Param.lin(context, params.tone, 8000, 12000);
  const hiFreq = Param(context, { input: loFreq, offset: -2000 });

  const bank = oscBank(context);
  const band = BiquadFilter(context, { type: "bandpass", frequency: loFreq });
  const high = BiquadFilter(context, { type: "highpass", frequency: hiFreq });
  const amp = perc(context, params, 0.01);
  const out = Gain(context, { gain: params.volume });

  bank.connect(band).connect(high).connect(amp).connect(out);

  return drum(out, params, [loFreq, hiFreq, bank, band, high, amp]);
};

export const CowBellDrum = (
  context: AudioContext,
  inputs: DrumInputs = {}
): DrumNode => {
  const params = toParams(context, inputs);
  const hiFreq = Param.lin(context, params.tone, 700, 900);
  const lowFreq = Param.lin(context, params.tone, 440, 540);
  const shortDecay = Param.mul(context, params.decay, 0.1);

  const hiOsc = Oscillator(context, { type: "square", frequency: hiFreq });
  const hiAmp = perc(context, params, 0.001);
  const lowOsc = Oscillator(context, { type: "square", frequency: lowFreq });
  const lowAmp = perc(context, params, 0.001, shortDecay);
  const out = Gain(context, { gain: params.volume });

  hiOsc.connect(hiAmp).connect(out);
  lowOsc.connect(lowAmp).connect(out);

  return drum(out, params, [
    hiFreq,
    lowFreq,
    shortDecay,
    hiOsc,
    hiAmp,
    lowOsc,
    lowAmp,
  ]);
};

export const CymbalDrum = (
  context: AudioContext,
  inputs: DrumInputs = {}
): DrumNode => {
  const params = toParams(context, inputs);
  const lowFreq = Param.lin(context, params.tone, 440, 540);
  const midFreq = Param.lin(context, params.tone, 600, 1700);
  const hiFreq = Param.lin(context, params.tone, 2000, 5000);
  const lowDecay = Param.mul(context, params.decay, 0.5);
  const midDecay = Param.mul(context, params.decay, 0.2);
  const hiDecay = Param.mul(context, params.decay, 5);

  const bank = oscBank(context);
  const out = Gain(context, { gain: params.volume });

  // Three filtered branches off the same bank, each with its own decay.
  const branches = [
    { type: "lowpass", frequency: lowFreq, decay: lowDecay },
    { type: "bandpass", frequency: midFreq, decay: midDecay },
    { type: "highpass", frequency: hiFreq, decay: hiDecay },
  ] as const;

  const nodes = branches.flatMap(({ type, frequency, decay }) => {
    const filter = BiquadFilter(context, { type, frequency });
    const amp = perc(context, params, 0.001, decay);
    bank.connect(filter).connect(amp).connect(out);
    return [filter, amp];
  });

  return drum(out, params, [
    lowFreq,
    midFreq,
    hiFreq,
    lowDecay,
    midDecay,
    hiDecay,
    bank,
    ...nodes,
  ]);
};

export const MaracasDrum = (
  context: AudioContext,
  inputs: DrumInputs = {}
): DrumNode => {
  const params = toParams(context, inputs);
  const freq = Param.lin(context, params.tone, 4000, 6000);

  const noise = Noise(context, { type: NoiseType.White });
  const filter = BiquadFilter(context, { type: "highpass", frequency: freq });
  const amp = perc(context, params, 0.02);
  const out = Gain(context, { gain: params.volume });

  noise.connect(filter).connect(amp).connect(out);

  return drum(out, params, [freq, noise, filter, amp]);
};

export const HandclapDrum = (
  context: AudioContext,
  inputs: DrumInputs = {}
): DrumNode => {
  const params = toParams(context, inputs);
  const freq = Param.lin(context, params.tone, 500, 1500);

  const noise = Noise(context, { type: NoiseType.White });
  const filter = BiquadFilter(context, { type: "bandpass", frequency: freq });
  const amp = perc(context, params, 0.02);
  // The ramp chops the burst into the several claps of a handclap.
  const ramp = Lfo(context, { type: LfoType.RampUp, frequency: 100 });
  const chop = Gain(context, { gain: ramp });
  const click = Impulse(context, { trigger: params.trigger });
  const clip = ClipAmp(context, {
    type: ClipType.Tanh,
    preGain: 2,
    postGain: 0.5,
  });
  const out = Gain(context, { gain: params.volume });

  noise.connect(filter).connect(amp).connect(chop);
  [chop, click].forEach((node) => node.connect(clip));
  clip.connect(out);

  return drum(out, params, [freq, noise, filter, amp, chop, click, clip]);
};

export const TomDrum = (
  context: AudioContext,
  inputs: DrumInputs = {}
): DrumNode => {
  const params = toParams(context, inputs);
  const freq = Param.lin(context, params.tone, 125, 240);

  const osc = Oscillator(context, { type: "sine", frequency: freq });
  const oscAmp = perc(context, params, 0.01);
  const click = Impulse(context, { trigger: params.trigger });
  const clickAmp = Gain(context, { gain: 0.3 });
  const noise = Noise(context, { type: NoiseType.Pink });
  const noiseAmp = perc(context, params, 0.01);
  const out = Gain(context, { gain: params.volume });

  osc.connect(oscAmp).connect(out);
  click.connect(clickAmp).connect(out);
  noise.connect(noiseAmp).connect(out);

  return drum(out, params, [
    freq,
    osc,
    oscAmp,
    click,
    clickAmp,
    noise,
    noiseAmp,
  ]);
};

export const CongaDrum = (
  context: AudioContext,
  inputs: DrumInputs = {}
): DrumNode => {
  const params = toParams(context, inputs);
  const freq = Param.lin(context, params.tone, 220, 455);

  const osc = Oscillator(context, { type: "sine", frequency: freq });
  const oscAmp = perc(context, params, 0.001);
  const click = Impulse(context, { trigger: params.trigger });
  const clickAmp = Gain(context, { gain: 0.3 });
  const out = Gain(context, { gain: params.volume });

  osc.connect(oscAmp).connect(out);
  click.connect(clickAmp).connect(out);

  return drum(out, params, [freq, osc, oscAmp, click, clickAmp]);
};
