---
"@synthlet/instrument": minor
---

Presets: a sound by name.

There was no way to name a sound. A `MonoSynth` sounds one way, and changing it
meant knowing that the filter envelope's `gain` is 3000 — with nothing to call
the result, save it, or load it back.

```ts
const synth = Instrument(ac, junoVoice, { voices: 8, preset: "Brass 1" });

synth.presets; // the definition's bank, in declaration order
synth.setPreset("Pad 3"); // one setValueAtTime per parameter, now
synth.setPreset("Brass 1", { time: bar9 }); // …or at bar 9
const sound = synth.getPreset("my patch"); // complete, ready to JSON.stringify
```

A preset is `{ name, params: { id: value } }` — **keys, not an array**: a key
survives reordering, a missing key means "default", and it is already JSON,
which is what smplr's `SmplrPreset` is too. Because every per-instrument
parameter is a fan-out node with an `AudioParam` input, loading one is one
write per parameter and a _scheduled_ preset change is free.

**A preset is complete, not a diff.** Every declared parameter is written on
every load, the ones the preset does not name with their declared defaults, so
loading "Brass 1" after "Pad 3" does not inherit the pad's cutoff. A partial
change is still `synth.params.cutoff.value = …`.

**An unknown key throws**, naming the key and the known ones: a definition's
`params` keys are its schema, and that is the versioning story. A value outside
a parameter's range is clamped silently — a saved 1.2 on a 0–1 parameter is a
stale file, not an error.

`glide`, `legato` and `priority` are reserved keys a preset may carry: they set
the instrument options, and a definition that declares a parameter with one of
those names is rejected at construction.

Also: `VoiceDefinition.presets` is typed against the definition's own parameter
names, so a typo in a factory bank is a build error; `options.preset` applies at
`ready`, before queued notes are flushed; and `fromDescriptor(AdsrAmp, "attack",
{ default: 0.01 })` fills a `ParamSpec` from a module's own descriptors so a
definition retypes no ranges.
