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
import { Instrument, StealMode } from "@synthlet/instrument";

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
