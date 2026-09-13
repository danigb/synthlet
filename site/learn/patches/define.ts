/*
 * What a patch is, as a type.
 *
 * A patch is synthlet code plus a *description* of its controls and views. The
 * description is data: it says a control is a slider from 1 to 16 with a label
 * and a unit, and says nothing at all about what a slider looks like. The kit
 * reads it and decides; a theme decides the rest. That split is the whole
 * point of the section, and it only survives if this file never learns about
 * pixels.
 *
 * So this file imports nothing - not React, not `synthlet`, not the kit. It is
 * types and two small pure functions, and `rules.test.ts` checks that it stays
 * that way.
 */

/**
 * Anything the kit can read and write.
 *
 * An `AudioParam` is one. So is a plain `{ get value() / set value() }` object
 * on a compound's `exposes`, which is how a patch publishes something that is
 * not a parameter at all - a harmonic count that rebuilds a wavetable, a
 * waveform index that has to reach two oscillators, an instrument option like
 * glide. `PolyblepExample.tsx` has used the same trick since the docs' first
 * example; the kit never needs to know which kind it was handed.
 */
export interface ValueRef {
  value: number;
}

/** How a control reaches the thing it moves, given the built compound. */
export type ParamRef<S> = (synth: S) => ValueRef;

/**
 * How a slider's position maps onto its value.
 *
 * `lin` is the default. `log` is for anything measured in Hz, where the ear
 * hears ratios and a linear knob spends four fifths of its travel above 4 kHz.
 * `db` is for levels: the control writes a gain and prints decibels. `time` is
 * a squared taper for a duration: every envelope stage starts at 0, which has
 * no logarithm, and a linear second spends its first third on the whole of a
 * plucked note.
 */
export type ControlScale = "lin" | "log" | "db" | "time";

export type ControlKind =
  "slider" | "select" | "toggle" | "xy" | "gate" | "keyboard" | "button";

interface ControlCommon {
  /** Unique within the patch. This is the name a lesson writes in `show`. */
  id: string;
  label: string;
  /** One line the kit may show beside the control. Prose, never markup. */
  help?: string;
}

export interface SliderControl<S> extends ControlCommon {
  kind: "slider";
  param: ParamRef<S>;
  min: number;
  max: number;
  step?: number;
  scale?: ControlScale;
  /** Printed after the value: `Hz`, `dB`, `ms`, `c`. */
  unit?: string;
  /** The position a reset returns to. Omit it and there is no reset. */
  default?: number;
}

/**
 * A list of names, written as an index.
 *
 * The library's rule, one layer down: main-thread APIs take strings, DSP takes
 * numbers. A `select` is the main thread's half of it - the lesson and the
 * reader see `Sawtooth`, the param receives `2`.
 */
export interface SelectControl<S> extends ControlCommon {
  kind: "select";
  param: ParamRef<S>;
  options: string[];
  default?: number;
}

export interface ToggleControl<S> extends ControlCommon {
  kind: "toggle";
  param: ParamRef<S>;
  /** 0 or 1; a toggle is a two-valued param, not a different kind of thing. */
  default?: number;
}

/** One dimension of an `xy` pad: a slider without a label of its own. */
export interface ControlAxis<S> {
  param: ParamRef<S>;
  label: string;
  min: number;
  max: number;
  scale?: ControlScale;
  unit?: string;
  default?: number;
}

export interface XYControl<S> extends ControlCommon {
  kind: "xy";
  x: ControlAxis<S>;
  y: ControlAxis<S>;
}

export interface GateControl<S> extends ControlCommon {
  kind: "gate";
  param: ParamRef<S>;
  /** `hold` is on while pressed; `trigger` is a pulse. Defaults to `hold`. */
  mode?: "hold" | "trigger";
}

/** `note` is a scientific pitch name, the form `Instrument.start` takes. */
export type NoteFn = (note: string, velocity: number) => void;

/** What the kit needs to draw keys, wherever they are declared. */
export interface KeyboardSource<S> {
  noteOn: (synth: S) => NoteFn;
  noteOff: (synth: S) => NoteFn;
  octaves?: number;
  /** Leftmost key, scientific pitch notation. Defaults to `C3`. */
  from?: string;
}

export interface KeyboardControl<S> extends ControlCommon, KeyboardSource<S> {
  kind: "keyboard";
}

export interface ButtonControl<S> extends ControlCommon {
  kind: "button";
  action: (synth: S) => () => void;
}

export type Control<S = any> =
  | SliderControl<S>
  | SelectControl<S>
  | ToggleControl<S>
  | XYControl<S>
  | GateControl<S>
  | KeyboardControl<S>
  | ButtonControl<S>;

export type ViewKind =
  "scope" | "spectrum" | "meter" | "keyboard" | "pattern" | "diagram";

/**
 * The analyser a drawing view reads.
 *
 * One per view that needs one, created and owned by the compound - the docs
 * examples' convention, so that the picture is a measurement of a defined point
 * in the chain rather than of whatever the kit could reach.
 */
export type AnalyserRef<S> = (synth: S) => AnalyserNode;
/** The node a meter taps. Defaults to the compound's own output. */
export type NodeRef<S> = (synth: S) => AudioNode;

/** What a `pattern` view draws: the shipped `Euclid.pattern` arguments. */
export interface PatternState {
  steps: number;
  beats: number;
  rotation: number;
  spread?: number;
  channels?: number;
}

/*
 * View options.
 *
 * Every view kind carries its own bag, optional and open to new keys. It is
 * here on the first day so that a later chapter can ask for a long scope window
 * or a set of predicted frequencies without changing the shape of `View` and
 * therefore without touching any patch that already exists.
 */

export interface ScopeOptions {
  /**
   * `wave` shows a few cycles; `contour` shows a second or two, which is what
   * an envelope looks like. Defaults to `wave`.
   */
  window?: "wave" | "contour";
  /** How long a `contour` window is. Defaults to the kit's own choice. */
  seconds?: number;
}

export interface SpectrumOptions<S> {
  /**
   * Frequencies to draw as vertical marks: where the theory says the partials
   * should land, next to where they actually are. A function so it can follow a
   * control that is moving; evaluated per frame.
   */
  marks?: number[] | ((synth: S) => number[]);
  minDb?: number;
  maxDb?: number;
}

export interface MeterOptions {
  /** Defaults to peak alone. `lufs` needs a `LevelMeter` that reports it. */
  show?: ("peak" | "rms" | "lufs")[];
}

export interface KeyboardViewOptions {
  octaves?: number;
  /** Leftmost key, scientific pitch notation. Defaults to `C3`. */
  from?: string;
}

export interface PatternOptions {
  /** Draw the grid even where the pattern is empty. */
  grid?: boolean;
}

export interface DiagramOptions {
  /** Drop the parameter port labels, for a diagram beside a narrow widget. */
  compact?: boolean;
}

export type View<S = any> =
  | {
      kind: "scope";
      label?: string;
      source: AnalyserRef<S>;
      options?: ScopeOptions;
    }
  | {
      kind: "spectrum";
      label?: string;
      source: AnalyserRef<S>;
      options?: SpectrumOptions<S>;
    }
  | {
      kind: "meter";
      label?: string;
      source?: NodeRef<S>;
      options?: MeterOptions;
    }
  /*
   * Keys, as a view.
   *
   * There is a `keyboard` *control* too, and the difference is not cosmetic: a
   * lesson's `show` filters controls, so a widget whose whole job is to be
   * played would lose its keys the moment a lesson narrowed the knobs down to
   * one. A view is never filtered. `learn/voice/README.md` decided it this way
   * for the voice patch; a patch whose keyboard is one control among several -
   * an arpeggiator's, say - still declares the control kind.
   */
  | ({
      kind: "keyboard";
      label?: string;
      options?: KeyboardViewOptions;
    } & Pick<KeyboardSource<S>, "noteOn" | "noteOff">)
  | {
      kind: "pattern";
      label?: string;
      source: (synth: S) => PatternState;
      options?: PatternOptions;
    }
  | { kind: "diagram"; label?: string; options?: DiagramOptions };

/** Reid's three shelves, plus the one every diagram ends at. */
export type DiagramNodeKind = "source" | "modifier" | "controller" | "output";

export interface DiagramNode {
  id: string;
  /** The library's name for the module: `PolyblepOscillator`, `Svf`. */
  label: string;
  kind?: DiagramNodeKind;
  /** The key on `exposes` this box is, so a test can check it is real. */
  exposedAs?: string;
}

export interface DiagramEdge {
  from: string;
  to: string;
  /** Set for a control edge: the parameter port it arrives at. */
  param?: string;
}

/**
 * `"auto"` is reserved for the day `graph()` can enumerate a running compound
 * (`thoughts/tickets/graph-introspection.md`). Until then a diagram is
 * declared, and a test keeps the declaration honest against `exposes`.
 */
export type Diagram = "auto" | { nodes: DiagramNode[]; edges: DiagramEdge[] };

/** What the kit may pass to `build` beyond the context. */
export interface PatchBuildOptions {
  /** Named by the lesson as `<Patch preset="..." />`. */
  preset?: string;
  voices?: number;
}

/** What "View the code" shows, when the whole file is not the answer. */
export interface CodeOptions {
  /**
   * A slice of the source, 1-based and inclusive, for a patch whose interesting
   * part is one function in a long file.
   */
  lines?: [number, number];
}

export interface LessonPatch<S = any> {
  /**
   * The patch's path under `learn/patches/`, without the extension. It is the
   * id a lesson writes, the key it is registered under and the file it lives
   * in, and `rules.test.ts` checks that all three agree - so a patch can always
   * be found from a lesson by reading the id as a path.
   */
  id: string;
  /** What the widget calls itself. Defaults to the id. */
  label?: string;
  /**
   * Build the sound.
   *
   * The contract is the docs examples', unchanged: return a `Compound`, own
   * everything you created so `dispose()` tears it down, and arrive **silent** -
   * the last node is a gain at 0 that the kit's Play toggle opens, on the click
   * that also resumes the context.
   *
   * `build` is synchronous, because a `Compound` is. A compound that is not
   * usable the instant it exists - `Instrument`, whose `params` are empty until
   * its worklets are registered - exposes a `ready` promise, and the kit waits
   * for it before it reads a single accessor. That is `InstrumentExample.tsx`'s
   * `await synth.ready`, moved one layer up so no patch has to remember it.
   */
  build: (ac: AudioContext, options?: PatchBuildOptions) => S;
  controls: Control<S>[];
  views: View<S>[];
  diagram?: Diagram;
  /** Which part of the file "View the code" opens on. The whole of it by default. */
  code?: CodeOptions;
}

/**
 * Declare a patch.
 *
 * It returns its argument. The function exists for the type parameter: writing
 * `definePatch({ ... })` infers `S` from `build` and then checks every `param`
 * accessor in the manifest against it, so a renamed key on `exposes` is a
 * compile error in the file that renamed it rather than a dead knob in a
 * lesson.
 */
export function definePatch<S>(patch: LessonPatch<S>): LessonPatch<S> {
  return patch;
}

/**
 * The controls a lesson asked for, in the order the patch declares them.
 *
 * Manifest order, not `show` order: which knobs a lesson reveals is pedagogy,
 * but the order they sit in is layout, and layout belongs to the patch and the
 * kit. Names in `show` that the patch does not have are dropped here and
 * reported by `unknownControls` - `rules.test.ts` is what turns them into a
 * failure, so a typo is a red test rather than a missing knob nobody notices.
 */
export function resolveControls<S>(
  patch: LessonPatch<S>,
  show?: string[],
): Control<S>[] {
  if (!show) return patch.controls;
  const wanted = new Set(show);
  return patch.controls.filter((control) => wanted.has(control.id));
}

/** The names in `show` that are not controls of this patch. */
export function unknownControls<S>(
  patch: LessonPatch<S>,
  show?: string[],
): string[] {
  if (!show) return [];
  const known = new Set(patch.controls.map((control) => control.id));
  return show.filter((name) => !known.has(name));
}
