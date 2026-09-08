---
"synthlet": minor
---

`MonoSynth` exposes `frequency` and takes `filterEnv`; `monoVoice`, the first
voice definition.

`@synthlet/instrument` had been built and tested against a stub whose `create`
returns a gain with two params on it. `monoVoice` is the library's own voice as
a `VoiceDefinition` — the first real one — so `Instrument` now has something to
play:

```ts
const synth = Instrument(ac, monoVoice, { voices: 8, preset: "Pad" });
synth.connect(ac.destination);
await synth.ready;
synth.start({ note: "C4", velocity: 96, duration: 0.5 });
synth.params.cutoff.setValueAtTime(1200, ac.currentTime);
```

**Sixteen parameters**, every one from the compound's own surface: `cutoff` and
`envAmount` (the filter envelope's floor and its travel), `resonance`, the two
ADSRs, three vibrato controls, `waveform`, and `bend` — pitch bend as a declared
parameter on `osc.detune` rather than as a feature. Ranges come from each
module's own `descriptors` through `fromDescriptor`, narrowed where a
descriptor's range is not a knob's (`Svf.Q` runs to 40; the definition stops at
12). A bank of three, `Init`, `Bass` and `Pad`, where `Init` is `{}` by
construction: every declared default is the value a bare `MonoSynth(ctx)`
already builds, so the definition changes no existing sound.

**`MonoSynth` is still a compound**, and still patchable: `MonoSynth(ctx, {
gate: euclid, frequency: arp })` is unchanged. What it gains is a `filterEnv`
sub-input — the envelope's `gain: 3000` and `offset: 2000` were unreachable
constants and are now defaults — and `frequency` in its exposed surface, which
is `osc.frequency` seen from outside and the per-note parameter every voice
definition has to publish. Both are backwards-compatible.

Also: an `OfflineAudioContext` render of a whole instrument — two overlapping
notes on a pool of two, deterministic sample for sample — next to the existing
`offline.test.ts`.
