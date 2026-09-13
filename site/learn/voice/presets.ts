import {
  LfoType,
  PolyblepOscillatorType,
  type PresetBank,
  SvfType,
} from "synthlet";
import type { LearnVoiceParam } from "./params";

// Two banks, and they are two because they answer different questions.
//
// **The lesson bank** is the starting point a lesson hands the reader. Each one
// is as close to `Init` as the lesson allows: a preset that set nine parameters
// when the page shows two sliders would be teaching by accident. Several are
// deliberately the amp envelope and nothing else, because lesson 2.4 asks the
// reader to *match* them with four sliders and a target that differed anywhere
// else would be unmatchable.
//
// **The gallery bank** is the Playground's, and those presets are sounds: they
// set whatever they need. Sixteen, covering the ground Ableton's list covers,
// under our own names.
//
// A preset is complete rather than a diff - `resolvePreset` writes every
// declared parameter on every load, the unnamed ones at their defaults - so
// nothing here inherits anything from the sound before it. `glide` is not a
// parameter; it is one of the instrument options a preset may carry, applied by
// the allocator, and a bass sound *is* its glide.

export const lessonPresets = {
  /** The bare voice: one saw, open filter, the modules' own envelopes. */
  Init: {},

  // ## Chapter 2 — Envelopes
  //
  // The amp ADSR and nothing else, all seven of them.
  attack: { attack: 0.01, decay: 0, sustain: 1, release: 0.25 },
  "decay-sustain": { attack: 0.005, decay: 0.45, sustain: 0.3, release: 0.25 },
  release: { attack: 0.005, decay: 0.2, sustain: 0.8, release: 1.5 },
  /** 2.4's four targets, from Part 3's Figure 5. On and off, no shape at all. */
  "envelope-organ": { attack: 0.004, decay: 0, sustain: 1, release: 0.03 },
  /** A lip that takes a moment to start and holds. */
  "envelope-trombone": {
    attack: 0.12,
    decay: 0.08,
    sustain: 0.85,
    release: 0.18,
  },
  /** All at the front, then a long fall to nothing. */
  "envelope-thunderclap": {
    attack: 0.002,
    decay: 1.8,
    sustain: 0,
    release: 0.9,
  },
  /** Part 54's flute, whose too-short release "sucks" on a legato line. */
  "envelope-flute": { attack: 0.09, decay: 0.12, sustain: 0.9, release: 0.05 },

  // ## Chapter 4 — Filters
  "filter-sweep": {
    cutoff: 200,
    resonance: 5,
    filterEnv: 6500,
    modAttack: 0.01,
    modDecay: 0.7,
    modSustain: 0.12,
    modRelease: 0.4,
    sustain: 1,
    release: 0.3,
  },
  "filter-types": {
    cutoff: 900,
    resonance: 3,
    filterType: SvfType.BandPass,
    sustain: 1,
    release: 0.2,
  },
  "key-tracking": {
    cutoff: 300,
    resonance: 3,
    keyTrack: 0.8,
    sustain: 1,
    release: 0.2,
  },

  // ## Chapter 5 — Modulation
  /** One pulse and a slow LFO on its width: the string-machine shimmer. */
  pwm: {
    sawLevel: 0,
    pulseLevel: 0.85,
    pulseWidth: 0.5,
    pulseWidthLfo: 0.35,
    lfoShape: LfoType.Sine,
    lfoRate: 0.7,
    attack: 0.4,
    sustain: 1,
    release: 0.5,
  },
  vibrato: {
    pitchLfo: 0.4,
    lfoRate: 5.5,
    lfoDelay: 0.6,
    sustain: 1,
    release: 0.2,
  },
  tremolo: {
    tremolo: 0.6,
    lfoShape: LfoType.Sine,
    lfoRate: 5,
    sustain: 1,
    release: 0.2,
  },
  /** The note starts an octave up and falls into place. */
  "pitch-envelope": {
    pitchEnv: 12,
    modAttack: 0.001,
    modDecay: 0.25,
    modSustain: 0,
    modRelease: 0.1,
    sustain: 1,
    release: 0.2,
  },
  /** Two tones, alternating: the square LFO is the switch between them. */
  "siren-german": {
    cutoff: 1400,
    resonance: 9,
    filterLfo: 2400,
    lfoShape: LfoType.Square,
    lfoRate: 1.1,
    sustain: 1,
    release: 0.2,
  },
  /** One tone, wailing: the same amount through a triangle, half the rate. */
  "siren-american": {
    cutoff: 1100,
    resonance: 11,
    filterLfo: 3200,
    lfoShape: LfoType.Triangle,
    lfoRate: 0.45,
    sustain: 1,
    release: 0.3,
  },

  // ## Chapters 1 and 6 — sources and voices
  noise: {
    sawLevel: 0,
    noiseLevel: 0.8,
    cutoff: 4000,
    resonance: 2,
    sustain: 1,
    release: 0.3,
  },
  /** Two oscillators nine cents apart, which is the whole of "fat". */
  detune: {
    pulseLevel: 0.8,
    pulseWidth: 0.5,
    detuneFine: 9,
    sustain: 1,
    release: 0.4,
  },
} satisfies PresetBank<LearnVoiceParam>;

export const galleryPresets = {
  bass: {
    cutoff: 320,
    resonance: 4.5,
    filterEnv: 2800,
    modDecay: 0.2,
    modSustain: 0.08,
    modRelease: 0.12,
    attack: 0.002,
    decay: 0.12,
    sustain: 0.7,
    release: 0.1,
    glide: 0.04,
  },
  /** Ableton's `wowbass`: the same bass with the cutoff on a slow LFO. */
  "wow-bass": {
    cutoff: 260,
    resonance: 9,
    filterLfo: 1800,
    lfoShape: LfoType.Sine,
    lfoRate: 1.6,
    attack: 0.002,
    decay: 0.2,
    sustain: 0.85,
    release: 0.12,
    glide: 0.05,
  },
  /** A sine an octave below the key, with a pulse for something to hear. */
  sub: {
    waveform: PolyblepOscillatorType.Sine,
    bend: -1200,
    pulseLevel: 0.3,
    pulseWidth: 0.5,
    cutoff: 1200,
    attack: 0.01,
    decay: 0.2,
    sustain: 0.9,
    release: 0.15,
    glide: 0.06,
  },
  lead: {
    pulseLevel: 0.7,
    pulseWidth: 0.35,
    detuneFine: 7,
    cutoff: 3200,
    resonance: 3,
    filterEnv: 2200,
    modDecay: 0.3,
    modSustain: 0.4,
    attack: 0.01,
    decay: 0.15,
    sustain: 0.8,
    release: 0.2,
    pitchLfo: 0.25,
    lfoRate: 5.5,
    lfoDelay: 0.7,
    glide: 0.06,
  },
  /** The pulse narrows as the note dies, so it thins as well as fades. */
  pluck: {
    pulseLevel: 0.4,
    pulseWidthEnv: -0.2,
    cutoff: 400,
    resonance: 3,
    filterEnv: 5000,
    modAttack: 0.001,
    modDecay: 0.22,
    modSustain: 0,
    modRelease: 0.1,
    attack: 0.002,
    decay: 0.35,
    sustain: 0,
    release: 0.18,
  },
  /** Parts 46-47: two sources a few cents apart, PWM, and a slow attack. */
  strings: {
    pulseLevel: 0.7,
    pulseWidth: 0.5,
    pulseWidthLfo: 0.18,
    detuneFine: 8,
    cutoff: 3000,
    resonance: 1.5,
    filterEnv: 1200,
    modAttack: 0.5,
    modSustain: 0.7,
    attack: 0.45,
    decay: 0.6,
    sustain: 0.85,
    release: 0.7,
    lfoShape: LfoType.Triangle,
    lfoRate: 0.35,
  },
  /** Parts 25-27: the tone opens after the note, and the vibrato arrives late. */
  brass: {
    cutoff: 500,
    resonance: 2.5,
    filterEnv: 4200,
    filterLfo: 80,
    keyTrack: 0.7,
    modAttack: 0.6,
    modDecay: 0.4,
    modSustain: 0.55,
    modRelease: 0.3,
    attack: 0.06,
    decay: 0.2,
    sustain: 0.9,
    release: 0.2,
    lfoShape: LfoType.Sine,
    lfoRate: 5,
    lfoDelay: 0.8,
  },
  /** Parts 52-54: breath in the tone, and the modulation on the cutoff only. */
  flute: {
    sawLevel: 0.55,
    noiseLevel: 0.3,
    cutoff: 2000,
    resonance: 1.2,
    filterLfo: 300,
    keyTrack: 0.35,
    attack: 0.09,
    decay: 0.12,
    sustain: 0.9,
    release: 0.06,
    lfoRate: 4.5,
    lfoDelay: 0.5,
  },
  /** Part 33: a pitch that drops as fast as the loudness. */
  kick: {
    waveform: PolyblepOscillatorType.Sine,
    pitchEnv: 12,
    cutoff: 900,
    modAttack: 0.001,
    modDecay: 0.06,
    modSustain: 0,
    modRelease: 0.05,
    attack: 0.001,
    decay: 0.28,
    sustain: 0,
    release: 0.12,
  },
  hat: {
    sawLevel: 0,
    noiseLevel: 0.9,
    filterType: SvfType.HighPass,
    cutoff: 7000,
    resonance: 2,
    attack: 0.001,
    decay: 0.06,
    sustain: 0,
    release: 0.04,
  },
  /** The wail speeds up as the note goes on: the envelope is on the LFO's rate. */
  siren: {
    cutoff: 900,
    resonance: 10,
    filterLfo: 3000,
    lfoShape: LfoType.Triangle,
    lfoRate: 0.6,
    lfoRateEnv: 4,
    modAttack: 2,
    modSustain: 1,
    sustain: 1,
    release: 0.3,
  },
  /** An octave of pitch and a closing filter, both in a third of a second. */
  laser: {
    pitchEnv: 12,
    cutoff: 6000,
    resonance: 6,
    filterEnv: -3000,
    modAttack: 0.001,
    modDecay: 0.3,
    modSustain: 0,
    modRelease: 0.1,
    attack: 0.001,
    decay: 0.4,
    sustain: 0,
    release: 0.1,
  },
  "bouncing-ball": {
    waveform: PolyblepOscillatorType.Sine,
    pitchEnv: 5,
    cutoff: 2500,
    modAttack: 0.001,
    modDecay: 0.12,
    modSustain: 0,
    attack: 0.001,
    decay: 0.14,
    sustain: 0,
    release: 0.08,
  },
  /** A narrow pulse, a fifth above it, and a new random pitch fourteen times a second. */
  "old-computer": {
    waveform: PolyblepOscillatorType.Square,
    pulseLevel: 0.5,
    pulseWidth: 0.2,
    detuneCoarse: 7,
    filterType: SvfType.BandPass,
    cutoff: 1600,
    resonance: 6,
    pitchLfo: 7,
    lfoShape: LfoType.RandSampleHold,
    lfoRate: 14,
    attack: 0.002,
    decay: 0.05,
    sustain: 0.9,
    release: 0.03,
  },
  /** No waveshaper in this voice, so the grit is three sources and a resonance. */
  grit: {
    pulseLevel: 0.9,
    pulseWidth: 0.18,
    noiseLevel: 0.25,
    detuneFine: -22,
    cutoff: 1800,
    resonance: 11,
    filterEnv: 3000,
    modDecay: 0.3,
    modSustain: 0.3,
    attack: 0.005,
    decay: 0.2,
    sustain: 0.8,
    release: 0.15,
  },
  /** A fifth apart is two instruments; the LFO moves the width and the cutoff. */
  "two-sounds-in-one": {
    pulseLevel: 0.8,
    pulseWidth: 0.4,
    pulseWidthLfo: 0.25,
    detuneCoarse: 7,
    cutoff: 2200,
    resonance: 4,
    filterLfo: 1500,
    lfoRate: 0.8,
    attack: 0.02,
    decay: 0.3,
    sustain: 0.75,
    release: 0.3,
  },
} satisfies PresetBank<LearnVoiceParam>;

/** The two banks, by name, for a UI that shows one of them. */
export const presetBanks = {
  lesson: lessonPresets,
  gallery: galleryPresets,
};

export const LESSON_PRESET_NAMES = Object.keys(lessonPresets);
export const GALLERY_PRESET_NAMES = Object.keys(galleryPresets);

/**
 * Both banks flat, which is what `Instrument` reads: `setPreset` takes one name
 * and the definition has one namespace for them. The banks are disjoint, and
 * `learn-voice.test.ts` keeps them that way.
 */
export const presets: PresetBank<LearnVoiceParam> = {
  ...lessonPresets,
  ...galleryPresets,
};
