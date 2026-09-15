import {
  AdsrAmp,
  AdsrEnv,
  fromDescriptor,
  Lfo,
  type ParamSpec,
  PolyblepOscillator,
  Svf,
} from "synthlet";

// The tutorial voice's parameter table: thirty-one numbers, and nothing else.
//
// It is a file of its own because it is the *schema* - `learn-voice.ts` builds
// the patch, `presets.ts` is typed against these keys, the kit derives a control
// per row, and the Playground lays them out by group. `learn-voice.ts` stays the
// wiring, which is what "view the code" is for.
//
// **Every default is a plain saw through an open filter**, so `Init` is `{}`:
// one sawtooth at full level, no second oscillator, no noise, no modulation
// anywhere, the filter at the top of its range, and the modules' own envelopes.
// A preset is therefore always a list of *departures* from that sound, which is
// how a lesson can hand the reader two sliders and mean it.
//
// **Ranges come from the module's own descriptor** wherever there is one
// (`fromDescriptor`), so a knob cannot ask for a value the DSP will not take.
// Where a range is written by hand it is narrower than the descriptor on
// purpose - `resonance` stops at 12 because `Svf.Q`'s 40 is a sine generator
// with a filter attached, `lfoRate` stops at 40 Hz because past that an LFO is
// an oscillator and that is chapter 5's own patch, not this voice's.
//
// `unit` is the only thing a `ParamSpec` carries besides the numbers, and
// `"index"` is the one that changes the control: a bank index is a `select`,
// not a slider, and the name lists below are what it selects from. That is the
// library's user-zone rule - strings at the surface, numbers in the DSP - met
// where a `ParamSpec` can meet it. `README.md` has the full contract.

const PARAMS = {
  // ## Oscillators
  //
  // Two `PolyblepOscillator`s and a `Noise` into one mixer. The first is "the
  // saw" and its waveform is selectable; the second is always a pulse, because
  // `pulseWidth` is only a control if the shape it belongs to is fixed.
  sawLevel: { default: 1, min: 0, max: 1 },
  pulseLevel: { default: 0, min: 0, max: 1 },
  pulseWidth: fromDescriptor(PolyblepOscillator, "width"),
  // The LFO is bipolar, so the width swings +/- this much around `pulseWidth`;
  // 0.5 is the whole range, and the DSP clamps the ends away from silence.
  pulseWidthLfo: { default: 0, min: 0, max: 0.5 },
  // The modulation envelope is unipolar, so this one is signed: a pulse that
  // narrows over the note and a pulse that widens are different instruments.
  pulseWidthEnv: { default: 0, min: -0.5, max: 0.5 },
  noiseLevel: { default: 0, min: 0, max: 1 },
  // The second oscillator's offset. Twelve semitones is the sub-oscillator and
  // the octave stack; seven is the fifth that makes "two sounds in one".
  detuneCoarse: { default: 0, min: -12, max: 12, unit: "semitones" },
  // Fine detune is the string machine: a few cents apart, two saws beat.
  detuneFine: { default: 0, min: -50, max: 50, unit: "cents" },
  waveform: fromDescriptor(PolyblepOscillator, "type", { unit: "index" }),

  // ## Pitch
  //
  // Everything here is summed, in cents, on both oscillators' own `detune`.
  // See `README.md`: the sum saturates at one octave either way, because that
  // is the range the `AudioParam` declares.
  pitchEnv: { default: 0, min: -12, max: 12, unit: "semitones" },
  pitchLfo: { default: 0, min: 0, max: 12, unit: "semitones" },
  bend: fromDescriptor(PolyblepOscillator, "detune", { unit: "cents" }),

  // ## Filter
  //
  // One `Svf`, whose cutoff is the sum of four things: where the knob sits,
  // what the modulation envelope adds, what the LFO adds, and how far the note
  // being played carries it.
  cutoff: { default: 12000, min: 20, max: 12000, unit: "Hz" },
  resonance: fromDescriptor(Svf, "Q", { min: 0.5, max: 12, unit: "Q" }),
  // Signed: a filter that closes as the note opens is the other half of every
  // sweep lesson, and it costs nothing to allow.
  filterEnv: { default: 0, min: -10000, max: 10000, unit: "Hz" },
  filterLfo: { default: 0, min: 0, max: 5000, unit: "Hz" },
  // Keyboard tracking, linear in Hz: at 1 the cutoff rises by the note's own
  // frequency, so the top of the keyboard is as bright as the bottom. Every
  // brass and flute recipe in the book asks for less than 100%.
  keyTrack: { default: 0, min: 0, max: 1 },
  // The first five `SvfType`s, which are the five a filter lesson names. The
  // shelves and the all-pass are real and are not a teaching control.
  filterType: { default: 1, min: 0, max: 4, unit: "index" },

  // ## Envelopes
  //
  // Two ADSRs from the same gate: one is the amplifier, the other is a signal
  // with no destination of its own - it goes wherever an `*Env` amount sends it.
  attack: fromDescriptor(AdsrAmp, "attack", { unit: "s" }),
  decay: fromDescriptor(AdsrAmp, "decay", { unit: "s" }),
  sustain: fromDescriptor(AdsrAmp, "sustain"),
  release: fromDescriptor(AdsrAmp, "release", { unit: "s" }),
  modAttack: fromDescriptor(AdsrEnv, "attack", { unit: "s" }),
  modDecay: fromDescriptor(AdsrEnv, "decay", { unit: "s" }),
  modSustain: fromDescriptor(AdsrEnv, "sustain"),
  modRelease: fromDescriptor(AdsrEnv, "release", { unit: "s" }),

  // ## LFO
  //
  // One LFO, four destinations, and a rate the modulation envelope can move -
  // which is the siren that speeds up, and the one thing the Ableton engine has
  // that a plain vibrato does not.
  lfoShape: fromDescriptor(Lfo, "type", { unit: "index" }),
  lfoRate: fromDescriptor(Lfo, "frequency", {
    default: 5,
    min: 0.02,
    max: 40,
    unit: "Hz",
  }),
  // The fade-in every wind player uses: the note's own gate restarts it, so the
  // vibrato arrives a moment after the note rather than on it. 0 disables the
  // depth envelope outright, which is why it is the default.
  lfoDelay: fromDescriptor(Lfo, "attack", { default: 0, max: 5, unit: "s" }),
  tremolo: { default: 0, min: 0, max: 1 },
  lfoRateEnv: { default: 0, min: -20, max: 20, unit: "Hz" },
} satisfies Record<string, ParamSpec>;

/** The thirty-one names, as a union: a typo in a preset is a build error. */
export type LearnVoiceParam = keyof typeof PARAMS;

/**
 * The thirty-one declared parameters.
 *
 * Widened to `ParamSpec` on the way out, deliberately. `satisfies` above keeps
 * the *keys* as literals - which is the point, because it is what makes a
 * preset typo a build error - but it also keeps each *value* as the shape that
 * was written, so asking `spec.unit` of one that has no unit would be a type
 * error rather than `undefined`. A control is derived by asking every spec the
 * same questions, so every spec has to be able to answer them.
 */
export const learnVoiceParams: Record<LearnVoiceParam, ParamSpec> = PARAMS;

export type LearnVoiceGroup = keyof typeof GROUPS;

const GROUPS = {
  oscillators: [
    "sawLevel",
    "pulseLevel",
    "pulseWidth",
    "pulseWidthLfo",
    "pulseWidthEnv",
    "noiseLevel",
    "detuneCoarse",
    "detuneFine",
    "waveform",
  ],
  pitch: ["pitchEnv", "pitchLfo", "bend"],
  filter: [
    "cutoff",
    "resonance",
    "filterEnv",
    "filterLfo",
    "keyTrack",
    "filterType",
  ],
  envelopes: [
    "attack",
    "decay",
    "sustain",
    "release",
    "modAttack",
    "modDecay",
    "modSustain",
    "modRelease",
  ],
  lfo: ["lfoShape", "lfoRate", "lfoDelay", "tremolo", "lfoRateEnv"],
} satisfies Record<string, readonly LearnVoiceParam[]>;

/**
 * The five groups the Playground lays its controls out in, in order.
 *
 * A lesson picks the controls it shows one by one; the Playground shows all of
 * them and needs somewhere to put each, and "which part of the synth is this"
 * is the only grouping that answers that.
 */
export const LEARN_VOICE_GROUPS: Record<
  LearnVoiceGroup,
  readonly LearnVoiceParam[]
> = GROUPS;

// The three `unit: "index"` option lists, each aligned with its parameter's
// range: entry `n` is the sound at value `min + n`. A `select` renders the
// names; the `AudioParam` only ever sees the number.

/** `waveform`, 0-3: `PolyblepOscillatorType` in brightness order. */
export const WAVEFORM_NAMES = [
  "sine",
  "triangle",
  "sawtooth",
  "square",
] as const;

/** `filterType`, 0-4: the first five `SvfType`s. */
export const FILTER_TYPE_NAMES = [
  "bypass",
  "lowpass",
  "bandpass",
  "highpass",
  "notch",
] as const;

/** `lfoShape`, 0-12: `LfoType`. "none" holds the LFO at its phase. */
export const LFO_SHAPE_NAMES = [
  "none",
  "sine",
  "triangle",
  "ramp up",
  "ramp down",
  "square",
  "exp ramp up",
  "exp ramp down",
  "exp triangle",
  "random",
  "impulse",
  "smooth random",
  "drift",
] as const;

/** The option list for a parameter whose `unit` is `"index"`. */
export const INDEX_OPTIONS: Partial<
  Record<LearnVoiceParam, readonly string[]>
> = {
  waveform: WAVEFORM_NAMES,
  filterType: FILTER_TYPE_NAMES,
  lfoShape: LFO_SHAPE_NAMES,
};
