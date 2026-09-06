---
"@synthlet/wavetable-oscillator": minor
---

Condition wavetables the package did not generate.

A table handed to `setWavetable` or fetched by `loadWavetable` used to be trusted
exactly as it arrived. It is now conditioned first, on the main thread, before its
mipmap pyramid is built: each plane's DC is removed, every harmonic is rewritten to
the same canonical phase the generated tables use, and the planes are matched in
RMS so the morph changes timbre and holds level.

This is not insurance. Six real tables from the wavedit catalogue the loader points
at were fetched and measured: `SYNLP10` loses **5.7 dB on an average crossfade and
11.1 dB on its worst**, `ACCESS_V` carries a **0.61 DC offset** on one plane, and
three of the six span more than 14 dB of RMS across their planes. A linear crossfade
of two planes equals a linear crossfade of their harmonic magnitudes only while
corresponding harmonics share a phase (Serra, Rubine & Dannenberg, JAES 38(3) 1990,
Eq. 7); 90° of disagreement costs 3 dB and 180° is a null. After conditioning all
six measure 0.00 dB.

Each step has its own switch, and all three default on:

```ts
osc.loadWavetable("SYNLP10"); // all three
osc.loadWavetable("SYNLP10", { normalize: false }); // keep the level ramp
osc.setWavetable(table, { alignPhases: false }); // keep the phase design
```

DC removal and phase alignment are facts about the data. **Loudness normalization is
a product decision and is labelled as one** — no paper prescribes it, and an artist
who shaped a level ramp across their planes turns it off.

Generated tables are untouched: they are canonical, DC-free and peak-normalized by
construction, and `setWavetable` tells the two apart by whether a pyramid is already
present. `conditionWavetable`, `alignPhases`, `normalizeRms` and `removeDc` are
exported for use without a node, along with `analyzeHarmonics` and `trigTable` —
the package's one forward transform, now shared by the conditioner and the mipmap
builder.
