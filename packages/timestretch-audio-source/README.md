# @synthlet/timestretch-audio-source

> A sampler whose time, pitch, region and direction all move independently, as
> an AudioWorklet

Part of [Synthlet](https://github.com/danigb/synthlet)

Web Audio's `AudioBufferSourceNode` is a varispeed: `playbackRate` and `detune`
both resample, so playing a clip at half speed also drops it an octave. There is
no way to stretch a sample to a target duration at constant pitch, or to repitch
it at constant duration — the two operations musicians and video timelines
actually want.

This is the same API with those two things pulled apart, plus the three a
sampler is actually for: choose the slice, choose the direction, cycle it. Six
`AudioParam`s, all modulatable while a note sounds.

## Install

```bash
npm i @synthlet/timestretch-audio-source
```

Or `npm i synthlet` for every module, from which the same names are exported.

## Usage

```ts
import {
  TimestretchAudioSource,
  registerTimestretchAudioSourceWorklet,
} from "@synthlet/timestretch-audio-source";

const ac = new AudioContext();
await registerTimestretchAudioSourceWorklet(ac);

const bytes = await fetch("/loop.mp3").then((r) => r.arrayBuffer());
const buffer = await ac.decodeAudioData(bytes);

const src = TimestretchAudioSource(ac, {
  playbackRate: 0.5, // half speed, same pitch
  detune: 300, // +3 semitones, same duration
  startOffset: 2.5, // play from 2.5s...
  endOffset: 4.0, // ...to 4.0s
  loop: 1, // round and round
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
| `startOffset`  | 0       | 0      | 3600 | Region start, in seconds into the buffer     |
| `endOffset`    | 0       | 0      | 3600 | Region end, in seconds. **0 means the end**  |
| `reverse`      | 0       | 0      | 1    | `> 0` plays the region backwards             |
| `loop`         | 0       | 0      | 1    | `> 0` cycles the region instead of ending    |

All six are real `AudioParam`s, so they can be set, scheduled, or driven by
another node — automating `playbackRate` mid-playback ramps the tempo without
the pitch moving with it.

```ts
src.playbackRate.setValueAtTime(1, ac.currentTime);
src.playbackRate.linearRampToValueAtTime(0.5, ac.currentTime + 4);
```

The same list is available at runtime as `TimestretchAudioSource.descriptors`, if
you're generating UI from it.

**`detune`'s range is the cap.** The engine is good for ±12 semitones, and that
is exactly the parameter's range — an `AudioParam` clamps to its descriptor, so
there is nothing to refuse and nothing to catch.

**They are all k-rate, and honestly so.** WSOLA consumes a rate or region change
when it starts its next analysis frame, so a per-sample value has nothing it
could mean. A ramp is a sequence of small per-block steps, which is what you
hear, and a region edge lands on a block boundary rather than on a sample. If
you need sample-accurate modulation of any of this, it is the wrong algorithm.

**`reverse` and `loop` are `AudioParam`s too, which means they are patchable.**
That is not obvious about a boolean, and it is where most of the fun is: a
square LFO into `reverse` is a stutter, and an envelope into `loop` is a
one-shot that becomes a sustain. `> 0` is on — the same gate rule the rest of
Synthlet uses, and the one that survives an input scaled by a gain and an
offset.

## Region

`startOffset` and `endOffset` are a live window onto the buffer, in seconds:

```ts
src.startOffset.value = 2.5;
src.endOffset.value = 4.0; // play 2.5s -> 4.0s
src.endOffset.value = 0; // 0 means "to the end of the buffer"
```

`endOffset`'s zero is a sentinel rather than a position, because an
`AudioParam`'s range is fixed when the node is built and the buffer's length is
not known until `setBuffer`. (The 3600 second cap on both is arbitrary for the
same reason. It is an hour.)

Both can be swept **while a note sounds**, which is the point of them being
params — sweeping a start point across a break is a technique, not a setup step:

```ts
src.startOffset.linearRampToValueAtTime(3.0, ac.currentTime + 8);
```

Moving the region does not rewind: the playhead stays where it is and the new
edges take effect from the next analysis frame. Three consequences worth
knowing:

- Sweeping `endOffset` back past the playhead ends playback, and fires
  `onended` — the region ran out under the note.
- A region that momentarily inverts (`endOffset` below `startOffset`, easy to
  do with two LFOs) is **held**, not applied. A crossing modulation must not
  kill the note.
- Starting with nothing to play — an offset past the end of the clip — still
  refuses and fires `onended` immediately, so the node never gets stuck.

## Reverse

```ts
src.reverse.value = 1;
```

Pitch and duration are unchanged; only the direction of travel flips. Flipping
it mid-playback reverses the playhead **in place** — it walks back over what it
just played, rather than jumping to the mirror position — and the flip itself is
clickless, measured at 1.00x the material's own largest sample-to-sample step.

**Why not a negative `playbackRate`?** Because a parameter's range cannot be
discontinuous. `[-16, 16]` would have to include 0, and rate 0 means freeze —
a real feature with its own semantics that nothing here needs to invent yet.
A separate flag keeps `playbackRate` strictly positive.

## Loop

```ts
src.loop.value = 1; // cycle startOffset..endOffset until stop()
```

While `loop > 0` the source never ends on its own: `onended` arrives only from
`stop()`. Turn it off mid-cycle and playback runs out to `endOffset` and ends
normally.

**The seam is a crossfade you already paid for.** WSOLA's overlap-add _is_ a
crossfade and its similarity search exists to find where a waveform best
continues, so the loop point needs neither a re-prime nor a bolted-on fade: the
analysis position wraps between frames and the frame either side of the wrap is
aligned and overlap-added like any other pair. On a tone whose period does not
divide the region — the case that makes a butt-join unmissable — the largest
sample-to-sample step across a looped render measures 1.01x the theoretical
maximum for that tone, against 17x for the butt-join.

The one thing it costs: **the seam needs one analysis frame of source past the
loop point to crossfade with** — 30 ms at the default `frameMs`, and half a
frame is measurably not enough. So looping a region _inside_ a longer sample
loops exactly the length you asked for, while looping the whole buffer right to
its last sample comes up one frame short. Lower `frameMs` if that matters more
than the stretch quality does.

Because looping reads a little either side of the region, a loop's edges are
soft to about a frame. That is the runway, and it is audible only as the
crossfade being made of real material rather than silence.

**Against `AudioBufferSourceNode`.** There, `loop`, `loopStart` and `loopEnd`
are separate from `start()`'s `offset`, which is what lets a sampler play an
attack once and then sustain on a shorter loop. Here there is one region:
`startOffset`/`endOffset` are both the slice that plays and the slice that
cycles. Attack-then-loop is a third position concept and is not implemented yet.

## Playing

`start`, `stop` and `onended` follow `AudioBufferSourceNode`, in seconds:

```ts
src.start(); // now
src.start(ac.currentTime + 1); // in a second
src.start(0, 2.5, 1.0); // now, from 2.5s in, for 1s
src.stop(ac.currentTime + 4);
```

`offset` and `duration` are sugar over the region params — `start(0, 2.5, 1.0)`
writes `startOffset = 2.5` and `endOffset = 3.5` and then starts — so there is
one source of truth for where the playhead is. They are written **only when
passed**, so `start()` and `start(when)` leave a region you set deliberately
alone.

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
src.naturalDuration; // 3.2 - the whole clip at playbackRate 1
src.regionDuration; // 1.0 - startOffset..endOffset at playbackRate 1
src.setDuration(4); // sets playbackRate to regionDuration / 4
```

`setDuration` divides the **region**, not the whole clip: the two are the same
until you move the offsets, and once you have, the region is what plays.

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

- **Not an attack-then-loop sampler yet.** One region is both what plays and
  what cycles, so a sample cannot play an attack once and then sustain on a
  shorter loop. That needs a third position concept, and is a follow-up.
- **Not sample-accurate at the region edges.** All six params are k-rate, so an
  edge lands on a 128-frame block boundary.
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
implements, and the seven things this implementation does that the sources do
not — including the measurements behind the loop seam — are recorded in the
header of `src/wsola.ts`.

See the repository's
[THIRD-PARTY-LICENSES.md](https://github.com/danigb/synthlet/blob/main/THIRD-PARTY-LICENSES.md).

## License

MIT © [danigb](https://github.com/danigb)
