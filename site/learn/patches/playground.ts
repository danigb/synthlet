import { Compound, Gain, Instrument } from "synthlet";
import {
  bindingPosition,
  bindingValue,
  DEFAULT_PAD_MAPPING,
  INDEX_OPTIONS,
  LEARN_VOICE_GROUPS,
  learnVoice,
  learnVoiceParams,
  type LearnVoiceParam,
  type PadAxis,
  type PadMapping,
} from "../voice";
import { definePatch, type Control, type PatchBuildOptions } from "./define";
import { controlLabel, controlScale } from "./voice";

/*
 * The tutorial voice with nothing hidden.
 *
 * `voice.ts` is the same synth as a *lesson* sees it: a preset, two or three
 * knobs, and everything else out of the way. This is the same synth as a
 * *player* sees it - all thirty-one parameters, the voice count, the glide, and
 * the two things a lesson has no use for: a pad that moves several parameters
 * at once, and a sound you can put in a link.
 *
 * The thirty-one are derived the way `voice.ts` derives them, through the same
 * two functions, because a parameter table restated in a second file is a
 * parameter table that will eventually disagree with the synth it describes.
 * What is written out here is only what a lesson never has: the pad, and the
 * pool.
 */

/** Enough for a chord, and the count a Playground arrives at. */
const DEFAULT_VOICES = 8;
const MIN_VOICES = 1;
const MAX_VOICES = 8;

/**
 * How fast a pad write arrives, in seconds.
 *
 * A pointer sweeping a pad reports tens of positions a second, and each of them
 * is a step in a parameter: written flat, a fast sweep across the whole cutoff
 * range is a staircase, and a staircase in a filter is the zipper noise every
 * early digital synth had. `setTargetAtTime` turns each step into a 10 ms
 * approach, which is short enough that the pad still feels immediate and long
 * enough that the steps run into one another.
 *
 * It is here rather than in the pad control because it needs `currentTime`, and
 * the context is the patch's. The kit's XY knows where a finger is; only this
 * file knows what o'clock it is.
 */
const PAD_SECONDS = 0.01;

/** The thirty-one, in the order the Playground lays its groups out. */
const ORDER: LearnVoiceParam[] = Object.values(LEARN_VOICE_GROUPS).flatMap(
  (group) => [...group],
);

/** Where an axis sits when the sound is at its defaults. */
function axisHome(axis: PadAxis): number {
  const binding = axis.bind[0];
  return bindingPosition(binding, learnVoiceParams[binding.param].default);
}

function build(ac: AudioContext, options?: PatchBuildOptions) {
  let wanted = options?.voices ?? DEFAULT_VOICES;
  let instrument = Instrument(ac, learnVoice, {
    voices: wanted,
    preset: options?.preset,
  });
  let disposed = false;

  // One analyser, before the gate, so the scope and the spectrum are two
  // pictures of one measurement and a muted Playground is still drawing.
  const analyser = ac.createAnalyser();
  analyser.fftSize = 4096;
  analyser.smoothingTimeConstant = 0.6;
  analyser.minDecibels = -100;
  analyser.maxDecibels = -10;

  // Last, and at zero: a page must not arrive making a sound.
  const out = Gain.val(ac, 0);
  instrument.connect(analyser);
  analyser.connect(out);

  /*
   * A stable face on an instrument that gets replaced.
   *
   * Every control's accessor is a closure the manifest made once, so it needs
   * something that does not move to reach through - `Object.assign` copies what
   * `exposes` holds, and a key whose value is the instrument itself would still
   * be pointing at the first one after a swap. This object is the one that does
   * not move, and everything below reads `instrument` when it is asked rather
   * than when it was written.
   */
  const voice = {
    get params() {
      return instrument.params;
    },
    start(note: string, velocity: number) {
      instrument.start({ note, velocity });
    },
    stop(note: string) {
      instrument.stop(note);
    },
  };

  // Portamento is an instrument option, not a parameter - the allocator applies
  // it, so it has no fan-out node and no `AudioParam`.
  const glide = {
    get value() {
      return instrument.glide;
    },
    set value(seconds: number) {
      instrument.glide = seconds;
    },
  };

  /*
   * The voice count, which is the one control that cannot be written.
   *
   * The pool is built once and its size is fixed, so a different count is a
   * different instrument - `site/examples/InstrumentExample.tsx` has said so
   * since the module shipped, and there it means the page rebuilds. Here the
   * *patch* does it, and the difference matters: the analyser, the output gain
   * and the meter tapping it all stay, so the Playground keeps playing across a
   * voice change and nothing above has to be torn down and put back.
   *
   * The swap is asynchronous because `Instrument` is: `params` is empty until
   * the worklets are registered, so the new pool is built, waited for, given
   * every value the old one was holding, and only then put in its place.
   */
  const swap = async (count: number) => {
    const next = Instrument(ac, learnVoice, { voices: count });
    try {
      await next.ready;
    } catch {
      next.dispose();
      return;
    }

    // A knob dragged across three counts asks for three swaps; only the last
    // one is still what the reader wants, and a disposed patch wants none.
    if (disposed || count !== wanted) {
      next.dispose();
      return;
    }

    for (const name of ORDER)
      next.params[name].value = instrument.params[name].value;
    next.glide = instrument.glide;
    next.connect(analyser);

    const previous = instrument;
    instrument = next;
    // `dispose()` disconnects it from everything, which is why the new one is
    // connected first: the analyser never sees a gap.
    previous.dispose();
  };

  const voices = {
    get value() {
      return wanted;
    },
    set value(count: number) {
      const next = Math.min(
        MAX_VOICES,
        Math.max(MIN_VOICES, Math.round(count)),
      );
      if (next === wanted) return;
      wanted = next;
      void swap(next);
    },
  };

  /*
   * The pad.
   *
   * Two positions, 0 to 1, and a list of parameters bound to each. The bindings
   * arrive from `learn/voice/mappings.ts` when a preset is chosen, so the pad is
   * a different instrument-shaped gesture per sound rather than one more filter
   * knob - which is the whole of what Ableton's `*.mapping` files do.
   */
  let bound: PadMapping = DEFAULT_PAD_MAPPING;
  const position = { x: axisHome(bound.x), y: axisHome(bound.y) };

  const sweep = (axis: PadAxis, p: number) => {
    for (const binding of axis.bind) {
      // `params` is empty until `ready`, and the kit waits for it before it
      // touches an accessor - but a queued write from a reader who grabbed the
      // pad on arrival can still get here first.
      const param = voice.params[binding.param];
      if (!param) continue;
      param.setTargetAtTime(
        bindingValue(binding, p),
        ac.currentTime,
        PAD_SECONDS,
      );
    }
  };

  const padX = {
    get value() {
      return position.x;
    },
    set value(p: number) {
      position.x = Math.min(1, Math.max(0, p));
      sweep(bound.x, position.x);
    },
  };

  const padY = {
    get value() {
      return position.y;
    },
    set value(p: number) {
      position.y = Math.min(1, Math.max(0, p));
      sweep(bound.y, position.y);
    },
  };

  return Compound({
    output: out,
    // Not `instrument`: it is replaced by a voice-count change, so what is
    // disposed has to be whichever one is current when the page goes away.
    owns: [
      analyser,
      () => {
        disposed = true;
        instrument.dispose();
      },
    ],
    exposes: {
      voice,
      analyser,
      glide,
      voices,
      padX,
      padY,
      /** Install the pad a preset asks for. The position is not moved by it. */
      bindPad(mapping: PadMapping) {
        bound = mapping;
      },
      /**
       * Put the dot where the sound already is, without sweeping anything.
       *
       * Loading a preset writes all thirty-one parameters, so the pad has
       * nothing left to do but agree with them - and sweeping would undo part of
       * what was just written, because an axis with two bindings has no position
       * that satisfies both.
       */
      placePad(x: number, y: number) {
        position.x = Math.min(1, Math.max(0, x));
        position.y = Math.min(1, Math.max(0, y));
      },
      // `ready` is the one thing the kit asks of a compound it cannot use yet:
      // `instrument.params` is empty until the worklets are registered. A later
      // swap has a `ready` of its own and waits for it before it takes over, so
      // this one is only ever the first pool's.
      ready: instrument.ready,
    },
  });
}

type Playground = ReturnType<typeof build>;

const parameters: Control<Playground>[] = ORDER.map((name) => {
  const spec = learnVoiceParams[name];
  const options = INDEX_OPTIONS[name];

  if (spec.unit === "index" && options) {
    return {
      id: name,
      kind: "select",
      label: controlLabel(name),
      param: (synth) => synth.voice.params[name],
      options: [...options],
      default: spec.default,
    };
  }

  return {
    id: name,
    kind: "slider",
    label: controlLabel(name),
    param: (synth) => synth.voice.params[name],
    min: spec.min,
    max: spec.max,
    scale: controlScale(spec),
    unit: spec.unit,
    default: spec.default,
  };
});

export default definePatch<Playground>({
  id: "playground",
  label: "The Playground",
  build,
  controls: [
    ...parameters,
    // The pad, as the patch alone can offer it: the default mapping, cutoff
    // across and resonance up. The page rewrites the two labels when a preset
    // brings its own bindings; the axes themselves are always the position,
    // because a pad that changed its units per preset could not be shared in a
    // link.
    {
      id: "pad",
      kind: "xy",
      label: "Pad",
      help: "Two parameters under one finger. Which two depends on the preset.",
      x: {
        param: (synth) => synth.padX,
        label: DEFAULT_PAD_MAPPING.x.label,
        min: 0,
        max: 1,
        default: axisHome(DEFAULT_PAD_MAPPING.x),
      },
      y: {
        param: (synth) => synth.padY,
        label: DEFAULT_PAD_MAPPING.y.label,
        min: 0,
        max: 1,
        default: axisHome(DEFAULT_PAD_MAPPING.y),
      },
    },
    {
      id: "voices",
      kind: "slider",
      label: "Voices",
      help: "How many notes can sound at once. Changing it rebuilds the synth.",
      param: (synth) => synth.voices,
      min: MIN_VOICES,
      max: MAX_VOICES,
      step: 1,
      default: DEFAULT_VOICES,
    },
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
    // Declared as a control as well as a view, so that the manifest says the
    // keys are one of the ways into this patch.
    {
      id: "keyboard",
      kind: "keyboard",
      label: "Keyboard",
      noteOn: (synth) => (note, velocity) => {
        synth.voice.start(note, velocity);
      },
      noteOff: (synth) => (note) => {
        synth.voice.stop(note);
      },
    },
  ],
  views: [
    {
      kind: "keyboard",
      label: "Keyboard",
      noteOn: (synth) => (note, velocity) => {
        synth.voice.start(note, velocity);
      },
      noteOff: (synth) => (note) => {
        synth.voice.stop(note);
      },
    },
    { kind: "meter", label: "Output", options: { show: ["peak"] } },
    { kind: "scope", label: "Waveform", source: (synth) => synth.analyser },
    { kind: "spectrum", label: "Spectrum", source: (synth) => synth.analyser },
  ],
});
