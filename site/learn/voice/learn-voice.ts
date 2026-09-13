import {
  AdsrAmp,
  AdsrEnv,
  Compound,
  Gain,
  Lfo,
  Noise,
  NoiseType,
  Param,
  PolyblepOscillator,
  PolyblepOscillatorType,
  Svf,
  type VoiceDefinition,
} from "synthlet";
import { type LearnVoiceParam, learnVoiceParams } from "./params";
import { presets } from "./presets";
import { registerLearnVoice } from "./register";

// The voice every lesson shares, and the whole of it: Learning Synths' engine
// as a patch. Not `MonoSynth` with options - a second oscillator, noise and a
// modulation envelope would change a shipped compound's surface for a site's
// benefit - and not a good synth either, but a teachable one, so every route
// below is the plainest one that makes the sound.
//
// "View the code" on the Playground shows this file, so there is no loop and
// nothing that joins two nodes out of sight. `README.md` has the parameter
// table, the groups, and the three limits this patch lives inside.

function createLearnVoice(
  context: BaseAudioContext,
  p: Record<LearnVoiceParam, AudioNode>,
) {
  // Both per-note inlets are `Param` nodes rather than a module's own param:
  // the gate is read by two envelopes and the LFO, and the pitch by both
  // oscillators *and* the keyboard tracking, which needs it as a signal.
  const gate = Param(context);
  const frequency = Param(context);

  // One envelope with no destination of its own and one LFO: where they go is
  // entirely the `*Env` and `*Lfo` amounts below.
  const modEnv = AdsrEnv(context, {
    gate,
    attack: p.modAttack,
    decay: p.modDecay,
    sustain: p.modSustain,
    release: p.modRelease,
  });
  const lfo = Lfo(context, {
    gate,
    type: p.lfoShape,
    frequency: p.lfoRate,
    attack: p.lfoDelay,
  });

  // The sources: the selectable one, the pulse that owns `width`, and noise.
  const saw = PolyblepOscillator(context, {
    type: p.waveform,
    frequency,
    detune: p.bend,
  });
  const pulse = PolyblepOscillator(context, {
    type: PolyblepOscillatorType.Square,
    frequency,
    detune: p.bend,
    width: p.pulseWidth,
  });
  const noise = Noise(context, { type: NoiseType.White });

  const filter = Svf(context, {
    type: p.filterType,
    frequency: p.cutoff,
    Q: p.resonance,
  });
  const amp = AdsrAmp(context, {
    gate,
    attack: p.attack,
    decay: p.decay,
    sustain: p.sustain,
    release: p.release,
  });
  const mix = Gain(context);
  const out = Gain(context);
  // Cents is what `detune` speaks: one gain of 100 carries the two semitone
  // amounts, a second the pulse's own offset.
  const semitones = Gain(context, { gain: 100 });
  const coarse = Gain(context, { gain: 100 });

  // A modulation amount is a gain in the control path whose own gain is the
  // knob - Part 9's "an envelope amount is a VCA" - so there is exactly one
  // kind of routing below. `amount` builds that gain and remembers it for
  // `dispose()`. It joins nothing: every join is a line of its own.
  const owned: AudioNode[] = [];
  const amount = (gain: AudioNode) => {
    const node = Gain(context, { gain });
    owned.push(node);
    return node;
  };

  modEnv.connect(amount(p.lfoRateEnv)).connect(lfo.frequency);
  modEnv.connect(amount(p.pitchEnv)).connect(semitones);
  lfo.connect(amount(p.pitchLfo)).connect(semitones);
  semitones.connect(saw.detune);
  semitones.connect(pulse.detune);
  p.detuneCoarse.connect(coarse).connect(pulse.detune);
  p.detuneFine.connect(pulse.detune);
  lfo.connect(amount(p.pulseWidthLfo)).connect(pulse.width);
  modEnv.connect(amount(p.pulseWidthEnv)).connect(pulse.width);

  saw.connect(amount(p.sawLevel)).connect(mix);
  pulse.connect(amount(p.pulseLevel)).connect(mix);
  noise.connect(amount(p.noiseLevel)).connect(mix);

  modEnv.connect(amount(p.filterEnv)).connect(filter.frequency);
  lfo.connect(amount(p.filterLfo)).connect(filter.frequency);
  frequency.connect(amount(p.keyTrack)).connect(filter.frequency);
  // `out.gain` sits at 1 and the LFO is summed onto it, so `tremolo` is how far
  // the note swings either side of its own level.
  lfo.connect(amount(p.tremolo)).connect(out.gain);

  mix.connect(filter).connect(amp).connect(out);

  const modules = [gate, frequency, modEnv, lfo, saw, pulse, noise];
  const gains = [mix, out, semitones, coarse, filter, amp];
  return Compound({
    output: out,
    owns: [...modules, ...gains, ...owned],
    exposes: {
      gate: gate.input,
      frequency: frequency.input,
      saw,
      pulse,
      noise,
      filter,
      amp,
      lfo,
      modEnv,
    },
  });
}

export type LearnVoice = ReturnType<typeof createLearnVoice>;

/**
 * The tutorial voice: Learning Synths' engine as a `VoiceDefinition`, site-only
 * because it is shaped by pedagogy rather than by taste. It moves to the
 * library the day one of its recipe presets is good enough to ship as a factory
 * sound.
 *
 * ```ts
 * const synth = Instrument(ac, learnVoice, { voices: 8, preset: "strings" });
 * await synth.ready;
 * ```
 */
export const learnVoice: VoiceDefinition<LearnVoiceParam, LearnVoice> = {
  name: "learnVoice",
  params: learnVoiceParams,
  create: createLearnVoice,
  register: registerLearnVoice,
  presets,
};
