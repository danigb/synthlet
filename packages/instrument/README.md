# @synthlet/instrument

> A voice definition in, a playable instrument out

Part of [Synthlet](https://github.com/danigb/synthlet).

`Instrument` takes a **voice definition** — a function that builds one voice,
the parameters a preset addresses, and the worklets it needs — and gives back a
polyphonic instrument: a pool of voice graphs, one fan-out node per
per-instrument parameter, and the allocator that decides which voice plays
which note. It contains no DSP of its own.

## Install

```bash
npm i @synthlet/instrument
```

Or `npm i synthlet` for every module at once.

## Usage

```ts
import { Instrument, NotePriority, StealMode } from "@synthlet/instrument";

const synth = Instrument(ac, junoVoice, { voices: 8, volume: -6 });
synth.connect(ac.destination);
await synth.ready; // registers the voice's worklets, builds the pool

const stop = synth.start({ note: "C4", velocity: 96, duration: 0.5 });
stop.voice; // the voice it landed on, for a per-note reach-in
stop(ac.currentTime + 1); // or stop it by hand

synth.params.cutoff.setValueAtTime(2000, ac.currentTime); // one write, every voice
synth.volume.value = 0.5; // the output gain, linear
synth.stop({ time: ac.currentTime + 2 }); // everything, sounding or scheduled
synth.dispose();
```

A definition is four fields:

```ts
const junoVoice: VoiceDefinition<"cutoff"> = {
  params: { cutoff: { default: 1200, min: 20, max: 20000, unit: "Hz" } },
  register: (ac) => registerMonoSynth(ac),
  create: (ac, inlets) => {
    /* build one voice, wiring `inlets.cutoff` into it */
  },
};
```

## A sound by name

A preset is a name and one number per declared parameter — plain JSON, keyed by
the definition's own parameter names:

```ts
const synth = Instrument(ac, junoVoice, { voices: 8, preset: "Brass 1" });

synth.presets; // ["Brass 1", "Pad 3", …] — the definition's bank
synth.setPreset("Pad 3"); // one setValueAtTime per parameter, now
synth.setPreset("Brass 1", { time: bar9 }); // …or at bar 9
synth.setPreset({ name: "mine", params: { cutoff: 900 }, glide: 0.2 });

const sound = synth.getPreset("my patch"); // complete, ready to JSON.stringify
synth.setPreset(sound); // and back again
```

**A preset is a complete sound, not a diff.** Every declared parameter is
written on every load: the ones the preset names with its values, the rest with
their declared defaults — so loading `"Brass 1"` after `"Pad 3"` does not
inherit the pad's cutoff. For a partial change, write the parameter:
`synth.params.cutoff.value = 900`.

**An unknown key throws**, naming the key and listing the known ones. A
definition's `params` keys _are_ its schema, and renaming one breaks its
presets — that is the versioning story, and it is said out loud rather than
hidden behind a migration layer. A value _outside_ a parameter's range is a
different thing: a saved 1.2 on a 0–1 parameter is a stale file, so it is
clamped silently.

`glide`, `legato` and `priority` are **reserved keys**: a preset may carry them,
they set the instrument options rather than a parameter, and no definition may
declare a parameter with one of those names. A lead sound _is_ its glide.

`options.preset` is applied at `ready`, after the pool is built and before
queued notes are flushed, so a note started before `ready` sounds with it. A
`setPreset` before `ready` is queued in call order with the notes.

A definition fills its `params` from a module's own descriptors rather than
retyping the numbers:

```ts
import { fromDescriptor } from "@synthlet/instrument";

params: {
  attack: fromDescriptor(AdsrAmp, "attack", { default: 0.01 }),
}
```

## One voice at a time

`voices: 1` is not a pool of one — it is a monosynth, and it routes through a
note stack:

```ts
const lead = Instrument(ac, junoVoice, {
  voices: 1,
  priority: NotePriority.Low, // Last (default) | Low | High | First
  legato: true, // leave the envelopes running between notes
  glide: 0.08, // portamento, in seconds
});

lead.start({ note: "C4" });
lead.start({ note: "E4" }); // C4 keeps sounding under Low priority
lead.stop("E4"); // and under Last, this returns to C4

lead.hold = true; // the sustain pedal: note-offs are remembered
lead.hold = false; // and applied now
lead.glide = 0; // live-settable, at any voice count
```

`priority` and `legato` are a monosynth's and are inert above one voice; a pool
picks a _voice_, not a _note_. `glide` and `hold` work at any voice count —
glide is per voice, from that voice's own last note.

The four priorities are Synth Secrets Part 18's, and they are not reducible to
each other: on a line that changes direction all four differ and two of them
play only three of the four notes. `legato` is the article's single-versus-multi
triggering axis, which on the gate contract is one decision — does the gate dip
between two notes, or stay high.

**Two kinds of parameter.** Per-note parameters — gate, pitch, velocity — are
written by the allocator into one voice. Per-instrument parameters — everything
in `params` — are one `ConstantSourceNode` each, connected to every voice, so a
knob is an `AudioParam` and a preset is one write per parameter. Values are in
the parameter's own units; there is no scaling layer.

**Construction is synchronous, and the instrument is a node.** It can be
connected and wrapped in effects before `ready` resolves; notes started before
then are queued and scheduled on flush, and dropped if their time has already
passed. Nothing is auto-connected to `ac.destination` — the host owns the
graph.

**Allocation happens at call time**, not at the note's time: two notes
scheduled into the future out of order get the allocator's state in call order.
A host that schedules in order inside a lookahead window never sees this.

The four steal modes, the note stack and the four mono priorities are
documented in `src/_voices.ts`.
