---
"@synthlet/instrument": minor
---

`Instrument`: a polyphonic synth from a voice definition.

There was no way to play a chord on a synthlet synth. `MonoSynth` exposes one
`gate` and one `frequency`; a second note either does nothing or retriggers the
first. `Instrument(ac, definition, options)` is the pool and the surface around
it.

```ts
const synth = Instrument(ac, junoVoice, { voices: 8, volume: -6 });
synth.connect(ac.destination);
await synth.ready;

synth.start({ note: "C4", velocity: 96, duration: 0.5 });
synth.params.cutoff.setValueAtTime(2000, ac.currentTime);
synth.stop({ time: ac.currentTime + 2 });
```

A **definition** — `{ params, create, register }` — rather than a bare
`createVoice`: without `params` there is no preset schema and no fan-out to
hand `create`, and without `register` there is no `ready`.

Per-instrument parameters are **one `ConstantSourceNode` each**, connected to
every voice, so every knob is an `AudioParam`, a preset is one write per
parameter, and a scheduled preset change is free. Values are in the parameter's
own units; there is no scaling layer.

A note is automation on a param that already exists — nothing is connected to
start one — so `start` writes pitch, then level, then the gate, all at the same
`time`, and `stop({ time })` is `cancelScheduledValues` followed by
`setValueAtTime(0, time)`: it cuts everything, sounding or merely scheduled,
which is play's `stopAll` contract and is exact.

Also: velocity 0-127 with smplr's `(v/127)²` curve, overridable per definition;
note names as well as numbers; a steal fade on the per-voice gain that ends
_at_ the new note's time; `start()` before `ready` queued and flushed, with
late events dropped; and `dispose()` that reaches the whole pool.

The `Instrument` node is a `GainNode` — connect effects to it, and connect it
where you like. Nothing is wired to `ac.destination` for you.
