import { AdAmp, AdEnv } from "@synthlet/ad";
import { ClipAmp, ClipType } from "@synthlet/clip-amp";
import { Impulse } from "@synthlet/impulse";
import { KarplusStrong } from "@synthlet/karplus-strong";
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

// Every drum's attack and decay was tuned by ear against the AD's old
// seconds->time-constant conversion (tau = attack x 0.05, tau = decay x 0.1).
// The envelope takes true seconds now - attack is the time to the peak, decay
// the time to -60 dB - so the old numbers are *converted* rather than
// re-tuned: same time constants, same drums.
const LEGACY_ATTACK = 0.05 * Math.log(100); // 0.2303
const LEGACY_DECAY = 0.1 * Math.log(1000); // 0.6908

/**
 * The four knobs every drum has, as Param nodes. Each one is scaled (`volume`,
 * from decibels) or fanned out to several modules (`trigger`, to every
 * envelope), so a plain AudioParam won't do: the inlet has to be a node.
 */
function toParams(context: AudioContext, inputs: DrumInputs = {}) {
  const decay = Param(context, { input: inputs.decay ?? 0.5 });
  return {
    trigger: Param(context, { input: inputs.trigger }),
    decay,
    // What the envelopes actually get: the knob is still 0...1, but the AD
    // takes seconds now, so it is converted rather than re-tuned (see
    // LEGACY_DECAY). Every drum's decay derives from this, not from the knob.
    decayTime: Param.mul(context, decay, LEGACY_DECAY),
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
  owned: Disposable<AudioNode>[],
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
  decay: ParamInput = params.decayTime,
) =>
  AdAmp(context, {
    trigger: params.trigger,
    attack: attack * LEGACY_ATTACK,
    decay,
  });

const OSC_BANK_FREQUENCIES = [263, 400, 421, 474, 587, 845];

/** The bank of squares that gives cymbals and hi-hats their metallic noise. */
function oscBank(context: AudioContext) {
  const oscs = OSC_BANK_FREQUENCIES.map((frequency) =>
    Oscillator(context, { type: "square", frequency }),
  );
  const out = Gain(context, { gain: 0.3 });
  oscs.forEach((osc) => osc.connect(out));
  return disposable(out, oscs);
}

export const KickDrum = (
  context: AudioContext,
  inputs: DrumInputs = {},
): DrumNode => {
  const params = toParams(context, inputs);
  const freq = Param.lin(context, params.tone, 20, 100);

  const pitchEnv = AdEnv(context, {
    trigger: params.trigger,
    attack: 0.1 * LEGACY_ATTACK,
    decay: params.decayTime,
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
  inputs: DrumInputs = {},
): DrumNode => {
  const params = toParams(context, inputs);
  // The two sines the snare's body is made of, an octave apart. At the default
  // tone of 0.5 they sit at 100 and 200 Hz, where they have always been.
  const freq = Param.lin(context, params.tone, 60, 140);
  const freq2 = Param.mul(context, freq, 2);

  const oscs = [freq, freq2].map((frequency) =>
    Oscillator(context, { type: "sine", frequency }),
  );
  const snap = perc(context, params, 0.01);
  oscs.forEach((osc) => osc.connect(snap));

  const noise = Noise(context, { type: NoiseType.White });
  const splash = perc(context, params, 0.01);
  noise.connect(splash);

  const out = Gain(context, { gain: params.volume });
  [snap, splash].forEach((node) => node.connect(out));

  return drum(out, params, [freq, freq2, ...oscs, snap, noise, splash]);
};

export const ClaveDrum = (
  context: AudioContext,
  inputs: DrumInputs = {},
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
  inputs: DrumInputs = {},
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
  inputs: DrumInputs = {},
): DrumNode => {
  const params = toParams(context, inputs);
  const hiFreq = Param.lin(context, params.tone, 700, 900);
  const lowFreq = Param.lin(context, params.tone, 440, 540);
  const shortDecay = Param.mul(context, params.decayTime, 0.1);

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
  inputs: DrumInputs = {},
): DrumNode => {
  const params = toParams(context, inputs);
  const lowFreq = Param.lin(context, params.tone, 440, 540);
  const midFreq = Param.lin(context, params.tone, 600, 1700);
  const hiFreq = Param.lin(context, params.tone, 2000, 5000);
  const lowDecay = Param.mul(context, params.decayTime, 0.5);
  const midDecay = Param.mul(context, params.decayTime, 0.2);
  const hiDecay = Param.mul(context, params.decayTime, 5);

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
  inputs: DrumInputs = {},
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
  inputs: DrumInputs = {},
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
  inputs: DrumInputs = {},
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
  inputs: DrumInputs = {},
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

/**
 * The drum half of "Digital Synthesis of Plucked-String **and Drum**
 * Timbres" - Karplus and Strong 1983, the drum algorithm Kevin Karplus
 * discovered in December 1979 - and the one voice in this kit that is a
 * resonator rather than an oscillator through an envelope.
 *
 * It is `KarplusStrong` with `blend` at 1/2, where "the sound is drumlike".
 * At that blend the buffer length stops being a pitch:
 *
 * > For b = 1/2, the wavetable length does not control the pitch of the tone,
 * > as the sound is aperiodic. Instead, it controls the decay time of the noise
 * > burst... For fairly large p (200 or more) and a sampling frequency of
 * > 20 KHz, the effect is that of a snare drum. For small p (around 20), the
 * > effect is that of a brushed tom-tom.
 *
 * Their p = 200 at 20 kHz is 100 Hz and their p = 20 is 1 kHz, so `tone`
 * sweeps 100...1000 Hz, which is their own snare-to-brushed-tom axis: low tone
 * is a big, long drum and high tone a small, tight one.
 *
 * `decay` drives the resonator's own loop gain rather than an amplifier
 * envelope, because this voice decays physically - that is what a loop with a
 * loss in it does, and it is the reason to build a drum out of one. `stretch`
 * is at 4 for the paper's own reason: "for drums (b near 1/2), increasing S
 * increases the 'snare' sound, allowing smaller values of p to be used for the
 * same duration". Without it the damping filter alone ends the hit in 60 ms
 * whatever `decay` says, because a randomly-signed loop carries white noise
 * and a two-zero lowpass takes 2.3 dB a trip out of white noise; with it the
 * knob spans 88 to 571 ms at the low end of `tone` and 75 to 204 at the high
 * end, which is a drum's worth of range.
 *
 * `position` is 0 because the pick-position comb is a *string* filter and it
 * annihilates the constant wavetable the drum is loaded with, and `dynamics`
 * is 1 for the same reason: nothing here is a pluck.
 */
export const MembraneDrum = (
  context: AudioContext,
  inputs: DrumInputs = {},
): DrumNode => {
  const params = toParams(context, inputs);
  const freq = Param.lin(context, params.tone, 100, 1000);

  const membrane = KarplusStrong(context, {
    trigger: params.trigger,
    frequency: freq,
    decay: params.decayTime,
    blend: 0.5,
    stretch: 4,
    brightness: 0.8,
    level: 0.6, // peaks at 0.87: the drum builds up past its own load
    position: 0,
    dynamics: 1,
  });
  const out = Gain(context, { gain: params.volume });

  membrane.connect(out);

  return drum(out, params, [freq, membrane]);
};
