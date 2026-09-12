import {
  Allocation,
  createNoteStack,
  createVoiceAllocator,
  NotePriority,
  StealMode,
} from "./_voices";
import { ConnectedUnit, Disposable, disposable } from "./_worklet";
import {
  arpClear,
  ArpEvent,
  arpSilence,
  arpSoundHeld,
  arpStart,
  arpStep as stepArp,
  arpStop,
  createArpState,
} from "./arp";
import { ArpConfig, toArpConfig } from "./arp-config";
import { createFanouts, ParamSpec } from "./fanout";
import {
  createMonoState,
  MonoWrite,
  monoStart,
  monoStop,
  monoStopAll,
} from "./mono";
import {
  NotePriorityName,
  priorityName,
  resolvePriority,
  resolveStealMode,
  StealModeName,
} from "./names";
import { toFrequency, toMidi } from "./notes";
import {
  assertNoReservedParams,
  Preset,
  PresetBank,
  presetNames,
  PresetOptions,
  RESERVED,
  resolvePreset,
} from "./presets";

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
export { ArpConfig, toArpConfig } from "./arp-config";
export type { ParamSpec } from "./fanout";
// The user-zone names. Deliberately no arp *enum*: the instrument's mode is a
// string union, so there is exactly one `ArpMode` in the library and the
// umbrella's `export *` has no collision to resolve. `arp-enums.test.ts`
// guards that, and `names.ts` explains the rule.
export type {
  ArpModeName,
  ArpOctaveModeName,
  ArpOrder,
  NotePriorityName,
  StealModeName,
} from "./names";
export { toFrequency, toMidi } from "./notes";
export { fromDescriptor } from "./presets";
export type {
  Preset,
  PresetBank,
  PresetBankEntry,
  PresetOptions,
  ReservedKey,
} from "./presets";

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
  /** Names the definition in a preset error message. */
  name?: string;
  params: Record<P, ParamSpec>;
  /**
   * Build one voice, wiring the fan-out `inlets` into it. Called once per
   * voice with the *same* `inlets` object.
   */
  create: (context: BaseAudioContext, inlets: Record<P, AudioNode>) => V;
  /** Registers the voice's worklets. Registrars are cached per context. */
  register: (context: BaseAudioContext) => Promise<unknown>;
  /**
   * Named sounds, read by `setPreset`. Each is flat - a value per parameter,
   * plus any of the reserved keys (`glide`, `legato`, `priority`) - and typed
   * against this definition's own `P`, so a typo in a factory preset is a
   * build error rather than a runtime throw.
   */
  presets?: PresetBank<P>;
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

export type InstrumentOptions<P extends string = string> = {
  /** Default 8. */
  voices?: number;
  /**
   * The sound to load. A name from the definition's bank, or a preset object.
   * Applied at `ready`, after the pool is built and before queued notes are
   * flushed, so a note started before `ready` sounds with it.
   */
  preset?: string | Preset<P>;
  /** dB at construction. Default 0. */
  volume?: number;
  /** `"protect"`, `"lru"`, `"mru"` or `"drop"`. Default `"protect"`. */
  steal?: StealModeName;
  /** Seconds. Default 0.005. */
  stealFade?: number;
  /**
   * Which held note sounds: `"last"`, `"low"`, `"high"` or `"first"`.
   * `voices: 1` only - a pool picks a voice, not a note. Default `"last"`,
   * the only one that always speaks on the beat.
   */
  priority?: NotePriorityName;
  /**
   * `voices: 1` only. `false` (the default) retriggers the envelopes on every
   * note change - multi triggering, the ARP way. `true` leaves the gate high
   * while any key is held - single triggering, the Minimoog way.
   */
  legato?: boolean;
  /**
   * Portamento, in seconds. Default 0. An exponential ramp in Hz, which is a
   * linear ramp in pitch. Applies at any voice count, and is live-settable as
   * `synth.glide`.
   */
  glide?: number;
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
  /**
   * The sustain pedal. While `true`, a key release is remembered rather than
   * written; setting it back to `false` applies every one it swallowed. A name
   * rather than smplr's `setCC(64, on)`: the controller number is the MIDI
   * adapter's business.
   */
  hold: boolean;
  /**
   * The arpeggiator's pattern, or `null` for a plain poly. Assign to change.
   *
   * ```ts
   * synth.arp = ArpConfig("UpDownExclusive", { octaves: 2 });
   * ```
   *
   * A config is a value, so a pattern edit is a new value rather than a
   * mutation: `synth.arp = { ...synth.arp, octaves: 3 }`. An assignment takes
   * effect **at the next step** - the position, the held set and the sounding
   * notes live on the instrument rather than in the config, so a new value
   * never restarts the pattern. Switching to `null` sounds the held chord;
   * switching back silences it and resumes at the preserved position.
   */
  arp: ArpConfig | null;
  /**
   * Hold the arpeggio without holding the keys. The sustain pedal's twin -
   * both defer note-offs through one set, so the two cannot disagree - with
   * one extra rule: a key pressed while nothing is physically down replaces
   * the chord rather than adding to it. That is the Juno-60 manual's
   * behaviour and Arturia's.
   *
   * Inert while `arp` is `null`. A latch on a plain poly is a coherent
   * feature and not one this module has been asked for.
   */
  latch: boolean;
  /**
   * One step, from the host's scheduler. `duration` shortens the gate;
   * without it a note lasts until the next step releases it.
   *
   * Never an internal timer: `arpStep` generates notes, never time. That is
   * the transport this library declines to own, and it is what makes a
   * `Clock` or a `Euclid` in the graph - through the deferred `EdgeTap`
   * bridge - the thing that drives this with exact rhythm.
   */
  arpStep(time?: number, duration?: number): void;
  /** Back to the first step of the current mode, at the next call. */
  arpReset(): void;
  /** Portamento in seconds. The next note uses whatever it says. */
  glide: number;
  /** The definition's bank, in declaration order. `[]` without one. */
  presets: readonly string[];
  /**
   * Load a sound: one `setValueAtTime` per declared parameter, at `time` or
   * at `currentTime`. A preset is complete, so the parameters it does not name
   * are written with their declared defaults rather than left as they were.
   *
   * Before `ready` it is queued, in call order with the notes.
   */
  setPreset(preset: string | Preset<P>, options?: { time?: number }): void;
  /** The sound as it stands, complete, ready to be stored as JSON. */
  getPreset(name?: string): Preset<P>;
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
  options: InstrumentOptions<P> = {},
): InstrumentNode<P, V> {
  // The definition's schema is checked before anything is built: a parameter
  // named after a reserved preset key is a programming error, and the earliest
  // throw is the useful one.
  assertNoReservedParams(definition);

  const size = options.voices ?? 8;
  const stealFade = options.stealFade ?? 0.005;
  const velocityToGain = definition.velocityToGain ?? midiVelocityToGain;

  // rune06 prefers, among idle voices, one whose portamento tail has finished
  // over one still gliding (`synth.rs:391-414`). Deliberately not adopted:
  // `_voices.ts` never asks what time it is, so it cannot know whether a ramp
  // has ended, and teaching it would mean passing a clock into `noteOn` and
  // giving up the property that makes the file copyable into a worklet. The
  // audible case it fixes - a released voice reused mid-glide - is already
  // covered here, because a steal fades the voice's gain before it is rewritten
  // and a plain reuse writes a new ramp start point at the note's own time.
  const allocator = createVoiceAllocator(size, {
    // A name at the surface, a member inside: `_voices.ts` is written to be
    // copied into a worklet, so the enum stays on that side of the boundary.
    // `names.ts` has the rule.
    steal:
      options.steal === undefined
        ? StealMode.Protect
        : resolveStealMode(options.steal),
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
  let glide = options.glide ?? 0;
  let holding = false;
  let latching = false;
  let arp: ArpConfig | null = null;

  /**
   * `voices: 1` is a monosynth, not a pool of one: it routes through the note
   * stack, so releasing the top key returns to the one underneath.
   */
  const mono = size === 1 ? createMonoState() : null;
  const monoOptions = {
    priority:
      options.priority === undefined
        ? NotePriority.Last
        : resolvePriority(options.priority),
    legato: options.legato ?? false,
  };

  /** Note-offs swallowed by the sustain pedal or the latch, applied when it lifts. */
  const deferred = new Set<number>();

  /**
   * Every key down, at **every voice count and whether or not an arp is
   * running**.
   *
   * The arpeggiator reads this set, and criterion 9 is what makes it
   * unconditional: switching the arp on mid-chord has to find the chord
   * already there, and switching it off has to hand the chord back. Before
   * this ticket a held-note set existed only at `voices: 1`, inside
   * `mono.ts` - which is the one thing the ticket got wrong about the code
   * when it said this adds no new state.
   *
   * Deliberately not mono's own stack: in arp mode that one holds exactly the
   * note the arp is sounding, so sharing them would make `priority: "low"`
   * pick the lowest of the notes the arp had accumulated.
   */
  const held = createNoteStack(16);

  /**
   * The arpeggiator, over that set and the **same** `deferred` set the pedal
   * owns - by reference, so `hold` and `latch` cannot hold different sets.
   * Sized at the stack's capacity times the octave maximum.
   */
  const arpState = createArpState(held, deferred, 64);

  /** The last note each voice sounded, or -1. What glide ramps from. */
  const previous: number[] = [];

  type QueuedNote = NoteEvent & {
    note: number;
    velocity: number;
    time: number;
  };
  /** A `setPreset` that arrived early, queued in call order with the notes. */
  type QueuedPreset = { preset: string | Preset<P>; at?: number };
  const isPreset = (entry: QueuedNote | QueuedPreset): entry is QueuedPreset =>
    "preset" in entry;

  /** Events that arrived before `ready`. `null` once the pool exists. */
  let queued: (QueuedNote | QueuedPreset)[] | null = [];

  /**
   * Pitch into one voice, glided from wherever that voice left off.
   *
   * Per voice rather than per instrument, which is what every hardware poly
   * with a portamento knob does: a stolen voice glides from the note it was
   * stolen from, and that smear is correct. `mayGlide` is false for a note
   * with nothing to glide from - a fresh voice, or a monosynth whose gate had
   * closed - and then the write is a step.
   *
   * An exponential ramp in Hz *is* a linear ramp in pitch, so portamento needs
   * no DSP at all. It is constant-*time*: a semitone and two octaves both take
   * `glide` seconds, which is the Minimoog's behaviour and what the ramp gives
   * for free. Constant-rate would be `glide * |semitones|`.
   */
  function writeFrequency(
    index: number,
    midi: number,
    time: number,
    mayGlide: boolean,
  ) {
    const frequency = voices[index].frequency;
    const from = previous[index];
    if (glide > 0 && mayGlide && from >= 0) {
      // The ramp needs a start point at `time`, or it interpolates from
      // whatever the last scheduled event was, however long ago.
      frequency.setValueAtTime(toFrequency(from), time);
      frequency.exponentialRampToValueAtTime(toFrequency(midi), time + glide);
    } else {
      frequency.setValueAtTime(toFrequency(midi), time);
    }
    previous[index] = midi;
  }

  /** Turn `mono.ts`'s answer into automation on the single voice. */
  function applyMono(writes: MonoWrite[]) {
    const voice = voices[0];
    for (const write of writes) {
      if (write.param === "frequency") {
        writeFrequency(0, write.note, write.time, write.glide);
      } else if (write.param === "velocity") {
        voice.velocity?.setValueAtTime(write.velocity / 127, write.time);
        gains[0].gain.setValueAtTime(
          velocityToGain(write.velocity),
          write.time,
        );
      } else {
        const at = write.justBefore
          ? write.time - 1 / context.sampleRate
          : write.time;
        voice.gate.setValueAtTime(write.value, at);
      }
    }
  }

  /**
   * Turn `arp.ts`'s answer into automation - the counterpart to `applyMono`.
   *
   * In mono a `stop` whose note the batch immediately replaces is a **silent
   * stack removal**, never a `monoStop`: that would set `sounding = -1`, and
   * the `monoStart` after it would then see a closed gate and write a pitch
   * *step* with no retrigger dip - which loses the glide between steps and
   * the retrigger both. Removing the note directly leaves `monoStart` to do
   * the whole job. A `stop` that ends the arpeggio, with no start after it,
   * has to close the gate itself.
   *
   * `arpStep` emits its stops before its starts, so one pass is enough.
   */
  function applyArp(events: ArpEvent[]) {
    const replaced = events.some((event) => event.kind === "start");
    for (const event of events) {
      if (event.kind === "stop") {
        if (mono) {
          mono.stack.remove(event.note);
          if (!replaced) applyMono(monoStopAll(mono, event.time));
        } else {
          noteOff(event.note, event.time);
        }
        continue;
      }
      if (mono) {
        applyMono(
          monoStart(mono, monoOptions, {
            note: event.note,
            velocity: event.velocity,
            time: event.time,
          }),
        );
        if (event.duration !== undefined) {
          applyMono(
            monoStop(mono, monoOptions, {
              note: event.note,
              time: event.time + event.duration,
            }),
          );
        }
      } else {
        schedule(event.note, event.velocity, event.time, event.duration);
      }
    }
  }

  /**
   * Every release the pedal or the latch swallowed, applied now - at
   * `currentTime`, not at the time each release was asked for, because that
   * moment has passed.
   *
   * In arp mode nothing is written: the note leaves the held set and the
   * *next step* stops it, which is what "the arpeggio stops at the next step"
   * means.
   */
  function applyDeferred() {
    const at = context.currentTime;
    for (const midi of deferred) {
      held.remove(midi);
      if (!arp) noteOff(midi, at);
    }
    deferred.clear();
  }

  /**
   * `synth.arp = …`. Only the two transitions through `null` write anything;
   * a change from one config to another is picked up at the next step, which
   * is what keeps a pattern edit from restarting the pattern.
   */
  function assignArp(value: ArpConfig | Partial<ArpConfig> | null | undefined) {
    const next = toArpConfig(value);
    const previous = arp;
    arp = next;
    // Before `ready` there is no pool to write to and nothing is held.
    if (queued) return;
    const at = context.currentTime;
    if (previous === null && next !== null) {
      // A plain poly becomes an arpeggio: what is sounding through the normal
      // path stops, and the held set is already the set the arp will read -
      // nothing needs seeding.
      if (mono) applyMono(monoStopAll(mono, at));
      else for (let i = 0; i < held.size; i++) noteOff(held.sorted(i).note, at);
    } else if (previous !== null && next === null) {
      // And back: the arp's note stops and the whole held chord sounds, each
      // note with its own velocity. One batch, so in mono the stop is the
      // silent removal `applyArp` describes rather than a closed gate.
      applyArp([...arpSilence(arpState, at), ...arpSoundHeld(arpState, at)]);
    }
  }

  function noteOff(midi: number, time: number) {
    if (mono) {
      applyMono(monoStop(mono, monoOptions, { note: midi, time }));
      return;
    }
    const index = allocator.noteOff(midi);
    if (index === -1) return;
    // Cancel first: a note whose off is scheduled here may also have a
    // note-on still pending after `time`, and this is what removes it.
    voices[index].gate.cancelScheduledValues(time);
    voices[index].gate.setValueAtTime(0, time);
  }

  function stopAll(time: number) {
    // A panic is a panic: the pedal does not defer it, and it takes the
    // deferred notes with it. The held set, the keys the latch was watching
    // and the arp's position go too - "`stop()` with no argument clears
    // everything, arp position included".
    deferred.clear();
    arpClear(arpState);
    if (mono) {
      applyMono(monoStopAll(mono, time));
      voices[0].gate.cancelScheduledValues(time);
      voices[0].gate.setValueAtTime(0, time);
      voices[0].frequency.cancelScheduledValues(time);
      gains[0].gain.cancelScheduledValues(time);
      return;
    }
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
    writeFrequency(allocation.index, midi, at, true);
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
    if (arp) {
      // A press changes the set the next step will read and sounds nothing
      // now: a step is what sounds. Criterion 8, and Arturia's
      // quantise-to-step behaviour. `arpStart` owns the held set here,
      // because the latch's "new chord" rule has to clear it *before* the
      // press is recorded.
      applyArp(arpStart(arpState, { note: midi, velocity }, latching));
      return Object.assign(
        ((when?: number) => stop({ note: midi, time: when })) as StopFn,
        { voice: null },
      );
    }

    // The key is down again, so a swallowed release for it is void.
    deferred.delete(midi);
    held.push(midi, velocity);

    if (mono) {
      applyMono(monoStart(mono, monoOptions, { note: midi, velocity, time }));
      if (event.duration !== undefined) {
        // A duration is the note's own length, not a key release, so the
        // sustain pedal does not defer it.
        applyMono(
          monoStop(mono, monoOptions, {
            note: midi,
            time: time + event.duration,
          }),
        );
      }
      return Object.assign(
        ((when?: number) => stop({ note: midi, time: when })) as StopFn,
        { voice: voices[0] },
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
          // A queued preset is not a note and no `stop` form addresses one.
          isPreset(event) ||
          event.time < at ||
          (midi !== undefined && event.note !== midi),
      );
      return;
    }
    if (midi === undefined) {
      stopAll(at);
      return;
    }
    if (arp) {
      // One boolean, which is what makes the pedal and the latch impossible
      // to disagree about a release. The note the arp is sounding runs until
      // the next step releases it.
      applyArp(arpStop(arpState, midi, holding || latching));
      return;
    }
    if (holding) {
      // The pedal is down: remember the release rather than writing it, and
      // the key is still held, so it stays in the set. rune06's `set_hold`
      // and Mutable's `ignore_note_off_messages_` are the same one line, and
      // `latch` is now its twin.
      deferred.add(midi);
      return;
    }
    held.remove(midi);
    noteOff(midi, at);
  }

  /**
   * The reserved keys are instrument options, not parameters: they have no
   * fan-out node and nothing to write to, so a preset carrying one sets the
   * option instead. A lead sound *is* its glide.
   */
  function applyOptions(values: PresetOptions) {
    if (values.glide !== undefined) glide = values.glide;
    if (values.legato !== undefined) monoOptions.legato = values.legato;
    if (values.priority !== undefined) {
      // A name in the saved JSON, validated here. Before this it was only
      // TypeScript checking, which is no help to a preset read from a file.
      monoOptions.priority = resolvePriority(values.priority);
    }
    // Through the same setter a direct assignment uses, so a preset loaded
    // from JSON is validated on one path and gets the same two transitions.
    // Applied only when present, as the other three are: a preset written
    // before this ticket must not silently stop a running arp.
    if (values.arp !== undefined) assignArp(values.arp);
  }

  function applyPreset(preset: string | Preset<P>, time?: number) {
    const resolved = resolvePreset(definition, preset);
    const at = time ?? context.currentTime;
    // Every declared parameter, every time: `resolvePreset` has already filled
    // in the ones the preset did not name with their defaults.
    for (const [key, value] of resolved.writes) {
      params[key as P].setValueAtTime(value, at);
    }
    applyOptions(resolved.options);
  }

  function setPreset(
    preset: string | Preset<P>,
    presetOptions: { time?: number } = {},
  ) {
    if (queued) {
      // Resolved now even though it is applied later, so a bad name throws at
      // the call rather than inside `ready`, where nobody is listening.
      resolvePreset(definition, preset);
      queued.push({ preset, at: presetOptions.time });
      return;
    }
    applyPreset(preset, presetOptions.time);
  }

  function getPreset(name = "untitled"): Preset<P> {
    const values = {} as Partial<Record<P, number>>;
    for (const key of Object.keys(definition.params) as P[]) {
      // Before `ready` there are no inlets to read and the sound is still its
      // declared defaults, which is what a round-trip should give back.
      values[key] = params[key]?.value ?? definition.params[key].default;
    }
    return {
      name,
      params: values,
      glide,
      legato: monoOptions.legato,
      // A name, not a member: a preset is JSON somebody reads and shares.
      priority: priorityName(monoOptions.priority),
      // One value, already JSON, already complete. `latch` is deliberately
      // absent: it is performance state, as `hold` is, not part of a sound.
      arp,
    };
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
      // Nothing to glide from until this voice has sounded once.
      previous.push(-1);
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
    // The sound before the notes: `options.preset` lands after the pool exists
    // and before the queue is flushed, so a note started before `ready` sounds
    // with the preset rather than with the definition's defaults.
    if (options.preset !== undefined) applyPreset(options.preset);
    for (const event of pending) {
      if (isPreset(event)) {
        applyPreset(event.preset, event.at);
        continue;
      }
      // Late on arrival: dropped, silently, the way smplr drops one.
      if (event.time < context.currentTime) continue;
      if (arp) {
        // An arp was configured before `ready` - by an option, a preset, or a
        // direct assignment - so these queued notes are the chord it will
        // arpeggiate, not notes to sound. A step is what sounds, which is the
        // same rule a press after `ready` gets.
        applyArp(
          arpStart(
            arpState,
            { note: event.note, velocity: event.velocity },
            latching,
          ),
        );
        continue;
      }
      // The held set is maintained for notes that arrived early too, so an
      // arp switched on after `ready` finds them. A dropped note is not held.
      held.push(event.note, event.velocity);
      schedule(event.note, event.velocity, event.time, event.duration);
    }
  })();

  const cascade = node.dispose;
  Object.assign(node, {
    ready,
    volume: out.gain,
    params,
    voices,
    presets: presetNames(definition),
    setPreset,
    getPreset,
    start,
    stop,
    arpStep(time = context.currentTime, duration?: number) {
      // A step before `ready` is dropped rather than queued: a step is a
      // musical instant, not an event with a time worth keeping.
      if (queued || !arp) return;
      applyArp(
        // The release lands one sample before the note, which is the idiom
        // `schedule` and `mono.ts` already use. Two `setValueAtTime` calls at
        // one instant are not an edge the audio thread can see, so without it
        // a repeated note - or a note landing on the voice just released -
        // gets no gate fall and no retrigger.
        stepArp(arpState, arp, time, time - 1 / context.sampleRate, duration),
      );
    },
    arpReset() {
      // The next step reads the first position *for the current mode*: the
      // root for `Up`, the top for `Down`, a fresh bag for `RandomOther`.
      arpState.traversal.reset();
    },
    dispose() {
      disposed = true;
      cascade.call(node);
    },
  });

  Object.defineProperties(node, {
    // `hold` and `latch` are one mechanism through one set, so they are two
    // symmetric three-line setters: either one going false applies the
    // swallowed releases, but only if the other is not still holding them.
    // That is criterion 10, and it falls out rather than being arranged.
    hold: {
      enumerable: true,
      get: () => holding,
      set(value: boolean) {
        holding = value;
        if (!value && !latching) applyDeferred();
      },
    },
    latch: {
      enumerable: true,
      get: () => latching,
      set(value: boolean) {
        latching = value;
        if (!value && !holding) applyDeferred();
      },
    },
    arp: {
      enumerable: true,
      get: () => arp,
      set: assignArp,
    },
    glide: {
      enumerable: true,
      get: () => glide,
      set(value: number) {
        glide = value;
      },
    },
  });

  return node;
}
