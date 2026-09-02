# @synthlet/flex-audio-buffer-source

> A sample player whose time and pitch move independently, as an AudioWorklet

Part of [Synthlet](https://github.com/danigb/synthlet)

Web Audio's `AudioBufferSourceNode` is a varispeed: `playbackRate` and `detune`
both resample, so playing a clip at half speed also drops it an octave. There is
no way to stretch a sample to a target duration at constant pitch, or to repitch
it at constant duration — the two operations musicians and video timelines
actually want.

This is the same API with those two things pulled apart.

## Install

```bash
npm i @synthlet/flex-audio-buffer-source
```

Or `npm i synthlet` for every module, from which the same names are exported.

## Usage

```ts
import {
  FlexAudioBufferSource,
  registerFlexAudioBufferSourceWorklet,
} from "@synthlet/flex-audio-buffer-source";

const ac = new AudioContext();
await registerFlexAudioBufferSourceWorklet(ac);

const bytes = await fetch("/loop.mp3").then((r) => r.arrayBuffer());
const buffer = await ac.decodeAudioData(bytes);

const src = FlexAudioBufferSource(ac, {
  playbackRate: 0.5, // half speed, same pitch
  detune: 300, // +3 semitones, same duration
});
src.setBuffer(buffer);
src.connect(ac.destination);

src.onended = () => console.log("done");
src.start();

// ...when you're done with it
src.dispose();
```

Registration is asynchronous and has to happen before you create anything: an
`AudioWorkletProcessor` can't fetch its own code, so it must be installed on the
context first. Everything after that is synchronous.

## Parameters

| Param          | Default | Min    | Max  | Meaning                                      |
| -------------- | ------- | ------ | ---- | -------------------------------------------- |
| `playbackRate` | 1       | 0.0625 | 16   | Time-stretch ratio. Pitch is unaffected      |
| `detune`       | 0       | -1200  | 1200 | Pitch shift in cents. Duration is unaffected |

Both are real `AudioParam`s, so they can be set, scheduled, or driven by another
node — automating `playbackRate` mid-playback ramps the tempo without the pitch
moving with it.

```ts
src.playbackRate.setValueAtTime(1, ac.currentTime);
src.playbackRate.linearRampToValueAtTime(0.5, ac.currentTime + 4);
```

The same list is available at runtime as `FlexAudioBufferSource.descriptors`, if
you're generating UI from it.

**`detune`'s range is the cap.** The engine is good for ±12 semitones, and that
is exactly the parameter's range — an `AudioParam` clamps to its descriptor, so
there is nothing to refuse and nothing to catch.

**Both are k-rate, and honestly so.** WSOLA consumes a rate change when it
starts its next analysis frame, so a per-sample rate has nothing it could mean.
A ramp is a sequence of small per-block steps, which is what you hear. If you
need sample-accurate rate modulation, this is the wrong algorithm.

## Playing

`start`, `stop` and `onended` follow `AudioBufferSourceNode`, in seconds:

```ts
src.start(); // now
src.start(ac.currentTime + 1); // in a second
src.start(0, 2.5, 1.0); // now, from 2.5s in, for 1s
src.stop(ac.currentTime + 4);
```

**One deliberate difference: this node is restartable.** By spec an
`AudioBufferSourceNode` is spent after a single play and a second `start()`
throws, so replaying a sample means building a new node and re-uploading the
buffer. Here a source that has ended, or been stopped, can simply be started
again. Starting one that is _already playing_ still throws — that is a mistake
rather than a rewind.

**Playback starts on the sample you asked for.** There is no lookahead latency
and no fade-in: output sample 0 is the clip's sample 0. This is worth stating
because it is the thing streaming time-stretchers usually can't offer — they
have to buffer input before they can look ahead. Since this one owns the whole
buffer and reads it by random access, looking ahead is free.

## Duration

Duration can't be a coherent `AudioParam`: under modulation it is the integral of
the rate, not a value. The modulatable primitive is `playbackRate`, and
`setDuration` is a convenience over it:

```ts
src.naturalDuration; // 3.2 - the clip at playbackRate 1
src.setDuration(4); // sets playbackRate to 3.2 / 4 = 0.8
```

So "modulate the duration" in practice means automating `playbackRate`.

## Buffers

`setBuffer` takes an `AudioBuffer`, or raw channel data for callers who never
built one:

```ts
src.setBuffer(audioBuffer);
src.setBuffer({ channels: [left, right], sampleRate: 48000 });
```

If the buffer's sample rate isn't the context's, it is resampled once, on the
spot — the same policy `decodeAudioData` follows — rather than on every block.
Your `AudioBuffer` is not modified or detached; the node copies before it posts.

A mono buffer fans out to every output channel. A stereo buffer stays panned:
the time-stretch engine aligns on a mono mix and applies the same alignment to
both channels, so the stereo image can't tear.

## Configuration

The engine's geometry is set at construction, not by `AudioParam` — these size
buffers, so they can't change while it runs:

| Option         | Default | Meaning                                     |
| -------------- | ------- | ------------------------------------------- |
| `channelCount` | 2       | Output bus width                            |
| `frameMs`      | 30      | Analysis frame length                       |
| `overlap`      | 0.5     | Fraction of a frame that overlaps the next  |
| `tolerance`    | 0.25    | Search radius, as a fraction of a frame     |
| `searchRate`   | 12000   | Rate the waveform-similarity search runs at |

`searchRate` is the interesting one. The similarity search runs on a decimated
copy of the signal, so it can only align structure below half that rate — which
is where the periodicity of real material lives, and is why the default is well
under Nyquist. Raising it to `ac.sampleRate` makes the search exhaustive and
much more expensive.

## What it isn't

- **No looping yet.** `loop`/`loopStart`/`loopEnd` need a clickless seam, which
  means a mid-stream re-prime or a crossfade. One-shot plus `onended` first.
- **Not a formant shifter.** Pitch shifting moves the spectral envelope with the
  pitch, so large shifts sound like a chipmunk or a giant. That is inherent to
  resampling-based pitch shifting, not a defect.
- **Not transparent on transients.** WSOLA is a time-domain method; stretched
  drums can double or stutter, and dense polyphony can warble. It is very good
  on monophonic and rhythmic material and merely acceptable on the hardest.

## Credits

The time-stretch engine is re-derived from published descriptions of WSOLA —
principally Driedger & Müller, _A Review of Time-Scale Modification of Music
Signals_ (Applied Sciences, 2016), and the original Verhelst & Roelands ICASSP
and EUROSPEECH papers of 1993 — and the pitch stage from Julius O. Smith's
_Digital Audio Resampling Home Page_. Which published equation each step
implements, and the five things this implementation does that the sources do
not, are recorded in the header of `src/wsola.ts`.

See the repository's
[THIRD-PARTY-LICENSES.md](https://github.com/danigb/synthlet/blob/main/THIRD-PARTY-LICENSES.md).

## License

MIT License
