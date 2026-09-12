import { AdsrAmp, AdsrEnv } from "@synthlet/adsr";
import { fromDescriptor, VoiceDefinition } from "@synthlet/instrument";
import { Lfo } from "@synthlet/lfo";
import { PolyblepOscillator } from "@synthlet/polyblep-oscillator";
import { Svf } from "@synthlet/state-variable-filter";
import { MonoSynth } from "./mono";
import { registerMonoSynth } from "./registrars";

// `MonoSynth`, described well enough for `Instrument` to build eight of it.
//
// The compound is unchanged as a compound: `MonoSynth(ctx, { gate: euclid,
// frequency: arp })` is still the generative-patch idiom, and `ArpExample.tsx`
// still builds it. What is here is the *description* - the parameters a preset
// addresses, how to wire the fan-out inlets into one voice, and three sounds -
// and it lives in the umbrella rather than in `@synthlet/instrument` because it
// depends on five packages and that one depends on none.
//
// **A definition is a taste decision with one rule**: every number a preset
// would want to differ between a bass and a pad. Sixteen of them, all from the
// compound's own surface. Not `volume`, which is the instrument's; not `gate`
// or `frequency`, which are per-note and written by the allocator.
//
// **Continuous or a switch.** `waveform` is a k-rate bank index: writing it
// from a preset is fine, sweeping it is a click. `ParamSpec.unit` carries that
// distinction for now - `"index"` rather than `"Hz"` - and a UI that wants to
// draw a selector instead of a slider reads it there.

export type MonoVoiceParam =
  | "cutoff"
  | "envAmount"
  | "resonance"
  | "filterAttack"
  | "filterDecay"
  | "filterSustain"
  | "filterRelease"
  | "attack"
  | "decay"
  | "sustain"
  | "release"
  | "vibratoRate"
  | "vibratoDepth"
  | "vibratoDelay"
  | "waveform"
  | "bend";

export type MonoVoice = ReturnType<typeof MonoSynth>;

/**
 * The library's own voice as a `VoiceDefinition`.
 *
 * ```ts
 * const synth = Instrument(ac, monoVoice, { voices: 8, preset: "Pad" });
 * await synth.ready;
 * synth.connect(ac.destination);
 * synth.start({ note: "C4", velocity: 96, duration: 0.5 });
 * ```
 *
 * Every default below is the value a bare `MonoSynth(ctx)` already builds, so
 * the `"Init"` preset is `{}` and the site's `MonoExample` is unchanged.
 */
export const monoVoice: VoiceDefinition<MonoVoiceParam, MonoVoice> = {
  name: "monoVoice",
  params: {
    // The filter envelope is the cutoff: its floor is where the filter sits
    // with the note released, and its gain is how far the note opens it.
    cutoff: { default: 2000, min: 20, max: 12000, unit: "Hz" },
    envAmount: { default: 3000, min: 0, max: 10000, unit: "Hz" },
    // `Svf.Q` runs to 40, which is not a resonance control, it is a sine
    // generator with a filter attached. 12 is as far as a knob should go.
    resonance: fromDescriptor(Svf, "Q", { min: 0.5, max: 12, unit: "Q" }),
    filterAttack: fromDescriptor(AdsrEnv, "attack", { unit: "s" }),
    filterDecay: fromDescriptor(AdsrEnv, "decay", { unit: "s" }),
    filterSustain: fromDescriptor(AdsrEnv, "sustain"),
    filterRelease: fromDescriptor(AdsrEnv, "release", { unit: "s" }),
    attack: fromDescriptor(AdsrAmp, "attack", { unit: "s" }),
    decay: fromDescriptor(AdsrAmp, "decay", { unit: "s" }),
    sustain: fromDescriptor(AdsrAmp, "sustain"),
    release: fromDescriptor(AdsrAmp, "release", { unit: "s" }),
    // The LFO is bipolar and reaches 200 Hz, which is an oscillator rather
    // than a vibrato; its depth is in Hz because it is summed into
    // `osc.frequency`, and its `attack` is the delay every wind player uses.
    vibratoRate: fromDescriptor(Lfo, "frequency", {
      default: 5,
      min: 0,
      max: 20,
      unit: "Hz",
    }),
    vibratoDepth: fromDescriptor(Lfo, "gain", {
      default: 5,
      min: 0,
      max: 50,
      unit: "Hz",
    }),
    vibratoDelay: fromDescriptor(Lfo, "attack", {
      default: 0.6,
      max: 5,
      unit: "s",
    }),
    waveform: fromDescriptor(PolyblepOscillator, "type", { unit: "index" }),
    // Pitch bend, and the whole of it: a declared parameter on the oscillator's
    // own detune, so bending is `synth.params.bend.linearRampToValueAtTime`
    // and not a feature anything had to be built for.
    bend: fromDescriptor(PolyblepOscillator, "detune", { unit: "cents" }),
  },

  // Each inlet is a `ConstantSourceNode` shared by every voice, and every
  // module here takes an `AudioNode` wherever it takes a number - so the whole
  // definition is the compound's existing sub-inputs with nodes in them.
  create: (context, p) =>
    MonoSynth(context, {
      osc: { type: p.waveform, detune: p.bend },
      filter: { Q: p.resonance },
      filterEnv: {
        offset: p.cutoff,
        gain: p.envAmount,
        attack: p.filterAttack,
        decay: p.filterDecay,
        sustain: p.filterSustain,
        release: p.filterRelease,
      },
      amp: {
        attack: p.attack,
        decay: p.decay,
        sustain: p.sustain,
        release: p.release,
      },
      vibrato: {
        frequency: p.vibratoRate,
        gain: p.vibratoDepth,
        attack: p.vibratoDelay,
      },
    }),

  register: registerMonoSynth,

  // Three sounds, by ear, named blandly on purpose: a bank worth a name is the
  // Juno folder's. `Init` is `{}` by construction - the defaults above *are*
  // the bare compound - so it is the sound `MonoExample` has always made.
  presets: {
    Init: {},
    Bass: {
      cutoff: 300,
      envAmount: 2600,
      resonance: 4,
      filterDecay: 0.18,
      filterSustain: 0.1,
      filterRelease: 0.12,
      attack: 0.002,
      decay: 0.12,
      sustain: 0.75,
      release: 0.08,
      vibratoDepth: 0,
      // A bass is played one note at a time, and the note under your finger is
      // the one you meant: last-note priority with a short glide between them.
      glide: 0.04,
    },
    Pad: {
      cutoff: 400,
      envAmount: 3600,
      resonance: 2,
      filterAttack: 1.2,
      filterDecay: 2,
      filterSustain: 0.4,
      filterRelease: 2.5,
      attack: 0.8,
      decay: 1.5,
      sustain: 0.8,
      release: 2.2,
      vibratoRate: 3.5,
      vibratoDepth: 3,
      vibratoDelay: 1.5,
    },
  },
};
