# @synthlet/instrument

> A voice definition in, a finished synth out

Part of [Synthlet](https://github.com/danigb/synthlet).

`Instrument` takes a **voice definition** — a function that builds one voice,
the parameters a preset addresses, and the worklets it needs — and gives back a
polyphonic instrument: a pool of voice graphs, a note allocator, one automatable
knob per parameter, and named sounds. The surface is
[smplr](https://github.com/danigb/smplr)'s — `await synth.ready`,
`start({ note, velocity, time, duration })`, a `BaseAudioContext` — so a sampled
piano and a synthesised one are played the same way.

It contains **no DSP**. Every sound it makes comes from the definition; this
package is an allocator, a pool, fan-out nodes and `setValueAtTime`.

## Install

```bash
npm i @synthlet/instrument
```

Or `npm i synthlet` for every module at once, which is also where the voice
definitions live.

## Usage

Eight voices of the library's own `MonoSynth`:

```ts
import { Instrument, monoVoice, registerMonoSynth } from "synthlet";

const ac = await registerMonoSynth(new AudioContext());
const synth = Instrument(ac, monoVoice, { voices: 8, volume: -6 });
synth.connect(ac.destination);
await synth.ready; // registers the voice's worklets, builds the pool

const stop = synth.start({ note: "C4", velocity: 96, duration: 0.5 });
stop.voice; // the voice it landed on, for a per-note reach-in
stop(ac.currentTime + 1); // …or stop it by hand

synth.start({ note: 64 }); // a MIDI number is a note too
synth.stop(64);

synth.params.cutoff.setValueAtTime(2000, ac.currentTime); // one write, every voice
synth.volume.value = 0.5; // the output gain, linear
synth.stop({ time: ac.currentTime + 2 }); // everything, sounding or scheduled
synth.dispose();
```

Construction is synchronous and the instrument **is** an `AudioNode`, so it can
be connected and wrapped in effects before `ready` resolves — which is what
makes `await synth.ready` a line you put where you like rather than a gate you
have to pass before building your graph. Notes started before it resolves are
queued and scheduled on flush; one whose time has already passed is dropped, the
way smplr drops one.

### One voice at a time

`voices: 1` is not a pool of one. It is a monosynth, and it routes through a
note stack:

```ts
const lead = Instrument(ac, monoVoice, {
  voices: 1,
  priority: NotePriority.Low, // Last (default) | Low | High | First
  legato: true, // leave the envelopes running between notes
  glide: 0.08, // portamento, in seconds
});

lead.start({ note: "C4" });
lead.start({ note: "E4" }); // C4 keeps sounding under Low priority
lead.stop("E4"); // and under Last, this returns to C4

lead.hold = true; // the sustain pedal: note-offs are remembered
lead.hold = false; // …and applied now
lead.glide = 0; // live-settable, at any voice count
```

`priority` and `legato` are a monosynth's and are inert above one voice: a pool
picks a _voice_, not a _note_. `glide` and `hold` work at any voice count —
glide is per voice, from that voice's own last note, which is what every
hardware poly with a portamento knob does.

The four priorities are [Synth Secrets Part
18](https://www.soundonsound.com/techniques/synth-secrets-part-18)'s, and they
are not reducible to each other: on a line that changes direction all four
differ, and two of them play only three of the four notes. `legato` is the same
article's single-versus-multi triggering axis, which on the gate contract is one
decision — does the gate dip between two notes, or stay high.

### A sound by name

A preset is a name and one number per declared parameter — plain JSON, keyed by
the definition's own parameter names. Loading one is a single write per
parameter, so it can be _scheduled_:

```ts
synth.presets; // ["Init", "Bass", "Pad"] — the definition's bank
synth.setPreset("Pad"); // one setValueAtTime per parameter, now
synth.setPreset("Bass", { time: bar9 }); // …or at bar 9
synth.setPreset({ name: "mine", params: { cutoff: 900 }, glide: 0.2 });

const sound = synth.getPreset("my patch"); // complete, ready to JSON.stringify
synth.setPreset(sound); // and back again — a no-op
```

`options.preset` is applied at `ready`, after the pool is built and before
queued notes are flushed, so a note started before `ready` sounds with it. A
`setPreset` before `ready` is queued in call order with the notes.

### An arpeggiator over the held notes

Not in this release. The instrument keeps a note stack and a deferred-off set,
which is everything an arpeggiator needs, and the design — `arp.step(time)`
called by the host, never an internal timer — is written down in the project's
ticket folder along with the rest of [what is deferred](#what-it-does-not-do).

## The surface, next to smplr's

smplr 1.0's instrument API against what this module exposes, row by row:

| smplr 1.0                                                   | Instrument module                                                      | Note                                                                                                                                                                                                                                                      |
| ----------------------------------------------------------- | ---------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `SplendidGrandPiano(ctx, opts)` — factory, no `new`         | `Instrument(ctx, definition, opts)` — factory, no `new`                | Same. Synthlet never had `new`                                                                                                                                                                                                                            |
| `await piano.ready`                                         | `await synth.ready`                                                    | Same. Ours resolves after `definition.register(ctx)` and the pool is built. The factory stays synchronous, and one `await` is the whole cost of worklet registration at this tier                                                                         |
| `start({ note, velocity, time, duration, … })` → `StopFn`   | `start({ note, velocity?, time?, duration? })` → `StopFn & { voice }`  | Same shape. `note` is a MIDI number or a name (`"C4"`), as in smplr. The returned function also carries the allocated voice — the per-note reach-in                                                                                                       |
| `velocity` 0–127, default 100                               | 0–127, default 100, curve pluggable                                    | Same units, deliberately. A host that thinks in 0–1 does one multiply in its adapter                                                                                                                                                                      |
| `stop()` / `stop("C4")` / `stop({ stopId, time })`          | `stop()` / `stop(note)` / `stop({ note?, time? })`                     | Same. No `stopId`: a note is its own key, and the returned stop function covers the rest                                                                                                                                                                  |
| `dispose()`                                                 | `dispose()`                                                            | Same; cascades into every voice and fan-out node                                                                                                                                                                                                          |
| `output.volume = 80` (0–127)                                | `volume: AudioParam` — the output gain, linear; `options.volume` in dB | **Differs.** Not a MIDI-scaled setter but the node's own gain, so it automates and schedules. A dB `AudioParam` would be a `Param.db` worklet, which cannot exist before `ready`, and the output has to exist from the first line for `connect()` to work |
| `destination` option; `output.addEffect("reverb", fx, 0.2)` | the instrument _is_ a node: `synth.connect(reverb)`                    | **Differs.** A send bus is `connect()` twice. No auto-connect to `ctx.destination`: the host owns the graph                                                                                                                                               |
| `onStart` / `onEnded` callbacks                             | —                                                                      | Not in v1. `onended` on the envelope modules is a prerequisite that has not landed; when it does, this is a small addition                                                                                                                                |
| `setCC(64, on)` sustain                                     | `hold: boolean`                                                        | Same mechanism; a name rather than a CC number, because the controller number is the MIDI adapter's business                                                                                                                                              |
| `setDetune(cents)`                                          | a `detune`/`bend` per-instrument param the definition declares         | The general mechanism covers it: `monoVoice` declares `bend` on the oscillator's own detune                                                                                                                                                               |
| `renderOffline(async ctx => …)`                             | works on an `OfflineAudioContext` as it stands                         | The library is typed `BaseAudioContext` throughout. smplr's helper is smplr's; ours needs none, because the instrument takes whatever context it is given                                                                                                 |
| `Instrument()` builder (0.21+)                              | `Instrument(ctx, definition, opts)`                                    | The same idea: smplr defines an instrument as a sample map plus options, we define one as a voice plus parameters                                                                                                                                         |

The two "differs" rows are the same difference — smplr wraps its output in a
channel object with its own methods, synthlet returns a node — and a host
adapter absorbs both in a line each.

**Velocity is 0–127 and the curve is `(v / 127)²`** — smplr's, from the DLS
spec, so the two libraries answer a MIDI keyboard the same way. It lands on a
gain the allocator owns, one per voice, so a voice that does not declare a
`velocity` parameter still responds to it. A definition may replace the curve
with `velocityToGain`.

**A note is a MIDI number or a name**: `"C4"`, `"F#3"`, `"Bb2"`, `"Db-1"`.
Middle C is `"C4"` = 60. Nothing below the surface sees a string.

## A voice definition

```ts
export type VoiceDefinition<P extends string, V extends Voice = Voice> = {
  name?: string;
  params: Record<P, ParamSpec>;
  create: (context: BaseAudioContext, inlets: Record<P, AudioNode>) => V;
  register: (context: BaseAudioContext) => Promise<unknown>;
  presets?: PresetBank<P>;
  sameNoteReuse?: boolean;
  velocityToGain?: (velocity: number) => number;
};
```

**`params`** — the parameters a preset addresses, each a `{ default, min, max,
unit? }`. Written down rather than discovered from a module's `descriptors`,
because a schema should be readable and because a definition's parameters are
rarely one module's. `fromDescriptor` fills one in from a worklet's own
descriptors, and takes overrides for the ranges a knob should not have:

```ts
import { fromDescriptor } from "@synthlet/instrument";

params: {
  attack: fromDescriptor(AdsrAmp, "attack"),
  // `Svf.Q` runs to 40, which is not a resonance control
  resonance: fromDescriptor(Svf, "Q", { min: 0.5, max: 12, unit: "Q" }),
  cutoff: { default: 2000, min: 20, max: 12000, unit: "Hz" },
}
```

`unit` is documentation, not behaviour: values are in the parameter's own units
and there is no scaling layer. It is also where a definition says that a
parameter is a switch rather than a knob — `unit: "index"` on a waveform
selector — until something needs more than a convention.

**`create(context, inlets)`** — builds one voice, wiring the fan-out `inlets`
into it. Called once per voice with the _same_ `inlets` object, so a definition
may hold on to it: the nodes outlive any single voice. It must return a node
with `gate` and `frequency` `AudioParam`s, and optionally `velocity`. Every
synthlet module takes an `AudioNode` wherever it takes a number, so a definition
is usually the voice's own constructor with inlets in it:

```ts
create: (ctx, p) =>
  MonoSynth(ctx, {
    filter: { Q: p.resonance },
    filterEnv: { offset: p.cutoff, gain: p.envAmount },
    amp: { attack: p.attack, release: p.release },
  }),
```

**`register(context)`** — registers the voice's worklets; `ready` resolves after
it. Registrars are cached per context, so handing the same one to two
instruments registers once.

**`presets`** — the bank, typed against the definition's own parameter names, so
a typo in a factory preset is a build error rather than a runtime throw.

**`sameNoteReuse`** — whether a note already sounding reuses its voice. Default
`true`. A plucked string wants `false`: a repeated note is a second string.

**`velocityToGain`** — the curve, if `(v / 127)²` is not it.

### Two kinds of parameter

**Per-note** parameters — gate, pitch, velocity — are written by the allocator
into one voice. You never touch them: `start` and `stop` are their interface.

**Per-instrument** parameters — everything in `params` — are one
`ConstantSourceNode` each, its output connected to every voice. That is what
makes every knob an `AudioParam` on `synth.params`, a preset one write per
parameter, and a scheduled preset change free:

```ts
synth.params.cutoff.linearRampToValueAtTime(6000, ac.currentTime + 2);
```

A native constant source rather than `@synthlet/param`'s `Param` because `Param`
is a worklet, and a package with no dependencies cannot register another
package's processor. For a value that only needs an offset the two are the same
thing, and a constant source needs no registration — so the inlets exist the
moment `register` resolves.

A third kind belongs to the module rather than to the voice. `glide`, `hold`,
`priority` and `legato` are **instrument options**: the allocator applies them,
so the definition never sees them and they have no fan-out node.

### Keys are the schema

A definition's `params` keys are its preset schema. **An unknown key throws**,
naming the key and listing the known ones — renaming a parameter breaks its
presets, and that is the versioning story, said out loud rather than hidden
behind a migration layer. A value _outside_ a parameter's range is a different
thing: a saved 1.2 on a 0–1 parameter is a stale file, not a mistake, so it is
clamped silently.

**A preset is a complete sound, not a diff.** Every declared parameter is
written on every load: the ones the preset names with its values, the rest with
their declared defaults — so loading `"Bass"` after `"Pad"` cannot inherit the
pad's cutoff. A sound that depends on history is exactly what a name is supposed
to remove. For a partial change, write the parameter:
`synth.params.cutoff.value = 900`.

`glide`, `legato` and `priority` are **reserved keys**: a preset may carry them,
they set the instrument options rather than a parameter, and a definition that
declares a parameter with one of those names is rejected at construction. A lead
sound _is_ its glide.

## What it costs

A `MonoSynth` voice is seven worklet nodes, so eight of them are **56 worklet
nodes**, plus one `ConstantSourceNode` per declared parameter (sixteen, for
`monoVoice`), one gain per voice and the output gain. All of it is built once,
at `ready`.

The [automation-rate
benchmark](https://github.com/danigb/synthlet/tree/main/benchmarks/automation-rate)
measured that pool at **~180 µs per render block, 6.8 % of one core** at 48 kHz,
before any DSP runs — the cost of the plumbing alone. Real, worth knowing, not
alarming.

That number is the honest cost of a design where every voice is a patchable
graph, and it should be read next to what it buys: any voice at all, presets
over its whole surface, and a knob that is an `AudioParam`. It is also why a
native single-worklet synth is still on the roadmap — and when it arrives it
takes this same definition, with the same `params` and the same presets. Only
`create` changes.

## What it does not do

- **No internal clock or rate.** Nothing here schedules itself; the host does.
  An internal timer would be the transport this library declines to own.
- **No auto-connect.** `synth.connect(destination)`, always: the instrument is a
  node and the host owns the graph.
- **No `addEffect`.** Same reason. An effect is `connect()`, and a send bus is
  `connect()` twice.
- **No `onStart` / `onEnded` yet.** They wait on `onended` for `AdsrAmp` and
  `AdAmp`, which is a separate piece of work. Disposing idle voices waits on the
  same thing.
- **No arpeggiator, no unison or detune spread, no MPE.** The definition shape
  allows each of them and nothing here needs them yet.
- **Allocation happens at call time**, not at the note's time: two notes
  scheduled into the future out of order get the allocator's least-recently-used
  state in call order. A host that schedules in order inside a lookahead window
  never sees this.

The four steal modes, the note stack and the four mono priorities are documented
where they are implemented, in [`src/_voices.ts`](src/_voices.ts).

## Credits

- The allocator's three ordered rules — reuse, then least-recently-touched
  released, then steal — and the "touch on note-off" rule are stmlib's
  `algorithms/voice_allocator.h`, MIT, © 2012 Emilie Gillet. The algorithm is
  followed; the data structure is not copied. See
  [THIRD-PARTY-LICENSES.md](https://github.com/danigb/synthlet/blob/main/THIRD-PARTY-LICENSES.md).
- `StealMode.Protect`, the default — the lowest and highest sounding notes are
  protected and the oldest of the rest is taken — is JUCE's
  `Synthesiser::findVoiceToSteal`, described from its documentation.
- The four mono priorities, and the claim that they are not reducible to each
  other, are Sound On Sound's _Synth Secrets_ Part 18, "Priorities & Triggers"
  (Gordon Reid, October 2000).
- The velocity curve and the shape of the playing surface are
  [smplr](https://github.com/danigb/smplr)'s.
