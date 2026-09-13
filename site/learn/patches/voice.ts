import { Compound, Gain, Instrument } from "synthlet";
import {
  INDEX_OPTIONS,
  LEARN_VOICE_GROUPS,
  learnVoice,
  learnVoiceParams,
  type LearnVoiceParam,
} from "../voice";
import {
  definePatch,
  type Control,
  type ControlScale,
  type PatchBuildOptions,
} from "./define";

/*
 * The tutorial voice, as a lesson's widget.
 *
 * Every chapter that teaches a *parameter* rather than a module reaches for
 * this one: a lesson names a preset and the two or three controls it is about,
 * and the reader gets a playable synth with exactly those knobs on it. Thirty-
 * one parameters, one keyboard, one glide.
 *
 * **Nothing about those thirty-one is written here.** The labels, the ranges,
 * the units, the tapers and the option lists are all derived from
 * `learnVoice.params` by the rules in `learn/voice/README.md` ("The derivation
 * contract for `patches/voice.ts`"), because a parameter table restated in a
 * second file is a parameter table that will eventually disagree with the synth
 * it describes. The two controls that are not parameters - the keys and the
 * portamento - are the only ones spelled out.
 */

/** Enough for a chord in every lesson that wants one. */
const VOICES = 8;

/** The five whole-key names the mechanical rule gets wrong. */
const LABELS: Partial<Record<LearnVoiceParam, string>> = {
  pulseWidthLfo: "PWM depth",
  pulseWidthEnv: "PW envelope",
  detuneCoarse: "Coarse detune",
  detuneFine: "Fine detune",
  keyTrack: "Key tracking",
};

/** The three words a parameter name abbreviates and a control should not. */
const EXPANSIONS: Record<string, string> = {
  env: "envelope",
  lfo: "LFO",
  mod: "modulation",
};

/**
 * `lfoRateEnv` is "LFO rate envelope": split the camel case, expand the three
 * abbreviations, sentence-case what is left.
 */
export function controlLabel(name: string): string {
  const exception = LABELS[name as LearnVoiceParam];
  if (exception) return exception;

  const words = name
    .replace(/([A-Z])/g, " $1")
    .trim()
    .split(/\s+/)
    .map((word) => EXPANSIONS[word.toLowerCase()] ?? word.toLowerCase());

  const [first, ...rest] = words;
  const head =
    first === "LFO" ? first : first[0].toUpperCase() + first.slice(1);
  return [head, ...rest].join(" ");
}

/**
 * How the slider moves, from the range alone.
 *
 * `log` for anything spanning two decades or more from a positive floor -
 * `cutoff` and `lfoRate`, and nothing else in this voice. `time` for a
 * duration, which cannot be logarithmic because every envelope stage starts at
 * 0. `lin` for the rest, including the Hz *amounts*, which are depths rather
 * than frequencies and read linearly.
 */
export function controlScale(spec: {
  min: number;
  max: number;
  unit?: string;
}): ControlScale | undefined {
  if (spec.unit === "index") return undefined;
  if (spec.min > 0 && spec.max / spec.min >= 100) return "log";
  if (spec.unit === "s") return "time";
  return "lin";
}

/** The thirty-one, in the order the Playground lays its groups out. */
const ORDER: LearnVoiceParam[] = Object.values(LEARN_VOICE_GROUPS).flatMap(
  (group) => [...group],
);

function build(ac: AudioContext, options?: PatchBuildOptions) {
  const instrument = Instrument(ac, learnVoice, {
    voices: options?.voices ?? VOICES,
    preset: options?.preset,
  });

  // One analyser, before the gate, so the scope and the spectrum are two
  // pictures of one measurement and a muted widget is still a widget.
  const analyser = ac.createAnalyser();
  analyser.fftSize = 4096;
  analyser.smoothingTimeConstant = 0.6;
  analyser.minDecibels = -100;
  analyser.maxDecibels = -10;

  // Last, and at zero: a page must not arrive making a sound.
  const out = Gain.val(ac, 0);
  instrument.connect(analyser).connect(out);

  // Portamento is an instrument option, not a parameter - the allocator applies
  // it, so it has no fan-out node and no `AudioParam`. A plain accessor is all
  // the kit needs, and all it knows.
  const glide = {
    get value() {
      return instrument.glide;
    },
    set value(seconds: number) {
      instrument.glide = seconds;
    },
  };

  return Compound({
    output: out,
    owns: [instrument, analyser],
    // `ready` is the one thing the kit asks of a compound it cannot use yet:
    // `instrument.params` is empty until the worklets are registered, so no
    // control accessor is read before this resolves.
    exposes: { instrument, analyser, glide, ready: instrument.ready },
  });
}

type Voice = ReturnType<typeof build>;

const parameters: Control<Voice>[] = ORDER.map((name) => {
  const spec = learnVoiceParams[name];
  const options = INDEX_OPTIONS[name];

  if (spec.unit === "index" && options) {
    return {
      id: name,
      kind: "select",
      label: controlLabel(name),
      param: (synth) => synth.instrument.params[name],
      options: [...options],
      default: spec.default,
    };
  }

  return {
    id: name,
    kind: "slider",
    label: controlLabel(name),
    param: (synth) => synth.instrument.params[name],
    min: spec.min,
    max: spec.max,
    scale: controlScale(spec),
    unit: spec.unit,
    default: spec.default,
  };
});

export default definePatch<Voice>({
  id: "voice",
  label: "The tutorial voice",
  build,
  controls: [
    ...parameters,
    {
      id: "glide",
      kind: "slider",
      label: "Glide",
      help: "How long the pitch takes to slide from one note to the next.",
      param: (synth) => synth.glide,
      min: 0,
      max: 1,
      scale: "time",
      unit: "s",
      default: 0,
    },
    // Declared as a control as well as a view, so a lesson that wants the keys
    // among its `show` list can name them.
    {
      id: "keyboard",
      kind: "keyboard",
      label: "Keyboard",
      noteOn: (synth) => (note, velocity) => {
        synth.instrument.start({ note, velocity });
      },
      noteOff: (synth) => (note) => {
        synth.instrument.stop(note);
      },
    },
  ],
  views: [
    // A view, not only a control: `show` filters controls, and a lesson that
    // narrows the knobs down to one still has to be playable.
    {
      kind: "keyboard",
      label: "Keyboard",
      noteOn: (synth) => (note, velocity) => {
        synth.instrument.start({ note, velocity });
      },
      noteOff: (synth) => (note) => {
        synth.instrument.stop(note);
      },
    },
    { kind: "meter", label: "Output", options: { show: ["peak"] } },
    { kind: "scope", label: "Waveform", source: (synth) => synth.analyser },
    { kind: "spectrum", label: "Spectrum", source: (synth) => synth.analyser },
  ],
});
