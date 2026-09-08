import { Allocation, createVoiceAllocator, StealMode } from "./_voices";
import { ConnectedUnit, Disposable, disposable } from "./_worklet";
import { createFanouts, ParamSpec } from "./fanout";
import { toFrequency, toMidi } from "./notes";

export {
  createNoteStack,
  createVoiceAllocator,
  NotePriority,
  StealMode,
} from "./_voices";
export type {
  Allocation,
  NoteEntry,
  NoteStack,
  VoiceAllocator,
  VoiceAllocatorOptions,
} from "./_voices";
export { createFanouts } from "./fanout";
export type { Fanouts, ParamSpec } from "./fanout";
export { toFrequency, toMidi } from "./notes";

/**
 * One voice: a node that ends the voice's signal path, plus the three
 * *per-note* parameters the allocator writes into it.
 *
 * `velocity` is optional because not every voice uses it as a signal - many
 * want velocity only as level, which the instrument applies on the voice's own
 * gain without the voice knowing.
 */
export type Voice = Disposable<AudioNode> & {
  gate: AudioParam;
  /** Hz. */
  frequency: AudioParam;
  /** 0-1, written when the voice declares it. */
  velocity?: AudioParam;
};

/**
 * What a definition tells the instrument: the parameters a preset addresses,
 * how to build one voice, and how to register whatever worklets that needs.
 *
 * A definition rather than a bare `createVoice` because the other three fields
 * are not optional extras: without `params` there is no preset schema and no
 * fan-out to hand `create`, and without `register` there is no `ready`.
 */
export type VoiceDefinition<P extends string, V extends Voice = Voice> = {
  params: Record<P, ParamSpec>;
  /**
   * Build one voice, wiring the fan-out `inlets` into it. Called once per
   * voice with the *same* `inlets` object.
   */
  create: (context: BaseAudioContext, inlets: Record<P, AudioNode>) => V;
  /** Registers the voice's worklets. Registrars are cached per context. */
  register: (context: BaseAudioContext) => Promise<unknown>;
  /** Named sounds, read by `setPreset`. */
  presets?: Record<string, Partial<Record<P, number>>>;
  /**
   * Whether a note already sounding reuses its voice. Default `true`. A
   * plucked string wants `false`: a repeated note is a second string.
   */
  sameNoteReuse?: boolean;
  /** Default `(v / 127)²`, smplr's curve, from the DLS spec. */
  velocityToGain?: (velocity: number) => number;
};

export type NoteEvent = {
  /** A MIDI number, or a name: `"C4"`, `"F#3"`, `"Bb2"`. */
  note: number | string;
  /** 0-127. Default 100. */
  velocity?: number;
  /** Context seconds. Default `currentTime`. */
  time?: number;
  /** Seconds. Schedules the note-off. */
  duration?: number;
};

/** Stops the note it came from, now or at `time`. */
export type StopFn = (time?: number) => void;

export type InstrumentOptions = {
  /** Default 8. */
  voices?: number;
  /** dB at construction. Default 0. */
  volume?: number;
  /** Default `StealMode.Protect`. */
  steal?: StealMode;
  /** Seconds. Default 0.005. */
  stealFade?: number;
};

export type InstrumentNode<
  P extends string,
  V extends Voice,
> = Disposable<GainNode> & {
  /** Resolves once the worklets are registered and the pool is built. */
  ready: Promise<void>;
  /** The output gain, linear. `options.volume` is its dB at construction. */
  volume: AudioParam;
  /** The fan-out inlets, one per declared parameter. Empty until `ready`. */
  params: Record<P, AudioParam>;
  /** The pool. Empty until `ready`. */
  voices: readonly V[];
  start(event: NoteEvent): StopFn & { voice: V | null };
  stop(
    what?: number | string | { note?: number | string; time?: number },
  ): void;
};

/** smplr's curve, `midiVelToGain` in `src/player/volume.ts`, from the DLS spec. */
const midiVelocityToGain = (velocity: number) => (velocity / 127) ** 2;

const dbToGain = (db: number) => 10 ** (db / 20);

/** `disposable`'s teardown for one dependency, for the nodes it never saw. */
function release(unit: ConnectedUnit) {
  if (typeof unit === "function") unit();
  else if (typeof (unit as any).dispose === "function") (unit as any).dispose();
  else unit.disconnect();
}

/**
 * A polyphonic instrument from a voice definition.
 *
 * ```ts
 * const synth = Instrument(ac, monoVoice, { voices: 8 });
 * synth.connect(ac.destination);
 * await synth.ready;
 * synth.start({ note: "C4", velocity: 96, duration: 0.5 });
 * synth.params.cutoff.setValueAtTime(2000, ac.currentTime);
 * ```
 *
 * Construction is synchronous and the instrument *is* a node, so it can be
 * connected and wrapped in effects before `ready` resolves - which is what
 * makes `await synth.ready` a line the host may put wherever it likes rather
 * than a gate it must pass before building its graph.
 *
 * **Allocation happens at call time, not at the note's time.** Schedule
 * `{ note: 60, time: 5 }` and then `{ note: 62, time: 2 }` and the allocator's
 * least-recently-used state reflects the order the calls were made, not the
 * order the notes sound. A host that schedules in order inside a lookahead
 * window never sees this.
 */
export function Instrument<P extends string, V extends Voice = Voice>(
  context: BaseAudioContext,
  definition: VoiceDefinition<P, V>,
  options: InstrumentOptions = {},
): InstrumentNode<P, V> {
  const size = options.voices ?? 8;
  const stealFade = options.stealFade ?? 0.005;
  const velocityToGain = definition.velocityToGain ?? midiVelocityToGain;

  const allocator = createVoiceAllocator(size, {
    steal: options.steal ?? StealMode.Protect,
    sameNoteReuse: definition.sameNoteReuse ?? true,
  });

  // The output exists before anything else, so `connect()` and `dispose()`
  // work from the first line. Everything built later joins its cascade by
  // being pushed onto `owned`, which `disposable` holds by reference.
  const owned: ConnectedUnit[] = [];
  const out = new GainNode(context);
  out.gain.value = dbToGain(options.volume ?? 0);

  const voices: V[] = [];
  const gains: GainNode[] = [];
  let params = {} as Record<P, AudioParam>;
  let disposed = false;

  /** Events that arrived before `ready`. `null` once the pool exists. */
  let queued:
    (NoteEvent & { note: number; velocity: number; time: number })[] | null =
    [];

  function noteOff(midi: number, time: number) {
    const index = allocator.noteOff(midi);
    if (index === -1) return;
    // Cancel first: a note whose off is scheduled here may also have a
    // note-on still pending after `time`, and this is what removes it.
    voices[index].gate.cancelScheduledValues(time);
    voices[index].gate.setValueAtTime(0, time);
  }

  function stopAll(time: number) {
    for (let i = 0; i < voices.length; i++) {
      voices[i].gate.cancelScheduledValues(time);
      voices[i].gate.setValueAtTime(0, time);
      // Everything, "sounding or merely scheduled": a note scheduled after
      // `time` is a pending write on these two as well as on the gate.
      voices[i].frequency.cancelScheduledValues(time);
      gains[i].gain.cancelScheduledValues(time);
    }
    allocator.clear();
  }

  function schedule(
    midi: number,
    velocity: number,
    time: number,
    duration?: number,
  ) {
    const allocation: Allocation = allocator.noteOn(midi);
    if (allocation === null) {
      // StealMode.Drop, and the pool is full: the note does not sound.
      return Object.assign((() => {}) as StopFn, { voice: null });
    }

    const voice = voices[allocation.index];
    const gain = gains[allocation.index];
    let at = time;

    if (allocation.stolen) {
      // Fade the losing voice out *ending at* the new note, on the gain the
      // allocator owns rather than in the voice's envelope. A note that steals
      // at "now" is therefore delayed by `stealFade` - the trade-off US
      // 7,728,217 names, and the reason the fade is milliseconds.
      const from = Math.max(context.currentTime, time - stealFade);
      at = from + stealFade;
      gain.gain.cancelScheduledValues(from);
      gain.gain.setValueAtTime(gain.gain.value, from);
      gain.gain.linearRampToValueAtTime(0, at);
      voice.gate.setValueAtTime(0, from);
    }

    // A retriggered voice needs to see its gate fall, or the envelope reads
    // one long note: the gate contract fires on the transition, not the level.
    if (allocation.reused) {
      voice.gate.setValueAtTime(0, at - 1 / context.sampleRate);
    }

    // Pitch and level before the gate, so both are in place when it rises.
    voice.frequency.setValueAtTime(toFrequency(midi), at);
    voice.velocity?.setValueAtTime(velocity / 127, at);
    gain.gain.setValueAtTime(velocityToGain(velocity), at);
    voice.gate.setValueAtTime(1, at);

    if (duration !== undefined) noteOff(midi, at + duration);

    return Object.assign(
      ((when?: number) => stop({ note: midi, time: when })) as StopFn,
      { voice },
    );
  }

  function start(event: NoteEvent) {
    const midi = toMidi(event.note);
    const velocity = event.velocity ?? 100;
    const time = event.time ?? context.currentTime;

    if (queued) {
      queued.push({ ...event, note: midi, velocity, time });
      return Object.assign(
        ((when?: number) => stop({ note: midi, time: when })) as StopFn,
        { voice: null },
      );
    }
    return schedule(midi, velocity, time, event.duration);
  }

  function stop(
    what?: number | string | { note?: number | string; time?: number },
  ) {
    let midi: number | undefined;
    let time: number | undefined;
    if (typeof what === "number" || typeof what === "string") {
      midi = toMidi(what);
    } else if (what) {
      if (what.note !== undefined) midi = toMidi(what.note);
      time = what.time;
    }
    const at = time ?? context.currentTime;

    if (queued) {
      // Nothing has been scheduled yet, so stopping is forgetting. An event
      // due before `at` still plays: it is not one of the notes being stopped.
      queued = queued.filter(
        (event) =>
          event.time < at || (midi !== undefined && event.note !== midi),
      );
      return;
    }
    if (midi === undefined) stopAll(at);
    else noteOff(midi, at);
  }

  const node = disposable(out, owned) as InstrumentNode<P, V>;

  const ready = (async () => {
    await definition.register(context);

    const fanouts = createFanouts(context, definition.params);
    params = fanouts.params;
    owned.push(...fanouts.nodes);

    for (let i = 0; i < size; i++) {
      const voice = definition.create(context, fanouts.inlets);
      // One gain per voice: where velocity lands, and where a steal fades.
      // Never in the voice's envelope, which cannot be interrupted from here.
      const gain = new GainNode(context);
      voice.connect(gain).connect(out);
      voices.push(voice);
      gains.push(gain);
      owned.push(voice, gain);
    }

    if (disposed) {
      // `dispose()` was called while this was awaiting: the cascade has
      // already run and will not run again, so tear down what it never saw.
      while (owned.length) release(owned.pop()!);
      return;
    }

    Object.assign(node, { params, voices });
    const pending = queued!;
    queued = null;
    for (const event of pending) {
      // Late on arrival: dropped, silently, the way smplr drops one.
      if (event.time < context.currentTime) continue;
      schedule(event.note, event.velocity, event.time, event.duration);
    }
  })();

  const cascade = node.dispose;
  return Object.assign(node, {
    ready,
    volume: out.gain,
    params,
    voices,
    start,
    stop,
    dispose() {
      disposed = true;
      cascade.call(node);
    },
  });
}
