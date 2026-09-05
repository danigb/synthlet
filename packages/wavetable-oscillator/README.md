# @synthlet/wavetable-oscillator

> A morphing wavetable oscillator module for [synthlet](https://github.com/danigb/synthlet)

## Install

```bash
npm i @synthlet/wavetable-oscillator
```

## Wavetables

The oscillator generates its own table and is audible the moment it is
constructed, with no network — `setHarmonics` builds one from harmonic spectra
and `setWavetable` takes one you already have.

`loadWavetable` and `fetchWavetableNames` additionally fetch from a **catalog**,
which defaults to a static mirror of [WaveEdit Online](https://waveeditonline.com/)
at `https://smpldsnds.github.io/wavedit-online/samples`. **That mirror is a third
party's GitHub Pages site, not ours**: nothing here controls its uptime, its
contents or its CORS headers, and a strict CSP will block it. So it is
overridable, per synthlet's rule that every URL in the library can be
self-hosted:

```ts
// your own copy of the files, same NAME.WAV + files.json layout
const osc = WavetableOscillator(ac, { catalog: "/wavetables" });

// or resolve names however you like
const osc = WavetableOscillator(ac, {
  catalog: {
    url: (name) => bundled[name],
    names: async () => Object.keys(bundled),
  },
});

// a URL needs no catalog at all
await osc.loadWavetable("/tables/my-own.wav");
```

Any WAV file works: PCM at 8, 16, 24 or 32 bits, IEEE float at 32 or 64, and
`WAVE_FORMAT_EXTENSIBLE` around either. It must be mono, and its sample count
must be a whole number of frames — 256 by default, `{ length }` otherwise.
Anything else rejects with a message naming what was found.
