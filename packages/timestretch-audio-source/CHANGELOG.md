# @synthlet/timestretch-audio-source

## 0.1.0

### Minor Changes

- 48dd8cf: Initial release: a sampler whose time, pitch, region and direction
  all move independently.

  Web Audio's `AudioBufferSourceNode` is a varispeed — `playbackRate` and
  `detune` both resample, so playing a clip at half speed also drops it an
  octave. There is no way to stretch a sample to a target duration at constant
  pitch, or to repitch it at constant duration: the two operations musicians and
  video timelines actually want. This is the same API with those two pulled
  apart, plus the three a sampler is actually for — choose the slice, choose the
  direction, cycle it.

  ```ts
  const src = TimestretchAudioSource(ac, {
    playbackRate: 0.5, // half speed, same pitch
    detune: 300, // +3 semitones, same duration
    startOffset: 2.5, // play from 2.5s...
    endOffset: 4.0, // ...to 4.0s
    loop: 1,
  });
  src.setBuffer(buffer);
  src.connect(ac.destination);
  src.start();
  ```

  Six `AudioParam`s, all modulatable while a note sounds: `playbackRate`
  (0.0625–16), `detune` (±1200 cents), `startOffset`, `endOffset`, `reverse` and
  `loop`. `detune`'s range **is** the engine's limit, so an `AudioParam`'s own
  clamping is the whole enforcement — nothing to refuse and nothing to catch.

  **`reverse` and `loop` are `AudioParam`s too, which means they are patchable.**
  That is not obvious about a boolean, and it is where most of the fun is: a
  square LFO into `reverse` is a stutter, an envelope into `loop` is a one-shot
  that becomes a sustain. `> 0` is on — the same gate rule the rest of Synthlet
  uses.

  **All six are k-rate, and honestly so.** WSOLA consumes a rate or region
  change when it starts its next analysis frame, so a per-sample value has
  nothing it could mean; a region edge lands on a block boundary rather than on
  a sample.

  Notable behaviour:

  - **The region is live.** `startOffset`/`endOffset` can be swept while a note
    sounds, and moving them does not rewind — the playhead stays put and the new
    edges apply from the next frame. Sweeping `endOffset` back past the playhead
    ends the note; a momentarily inverted region (easy with two LFOs) is **held
    rather than applied**, because a crossing modulation must not kill a note.
    `endOffset = 0` is a sentinel meaning "to the end", since a param's range is
    fixed before the buffer's length is known.
  - **Reverse flips in place**, walking back over what it just played rather
    than jumping to the mirror position, and the flip measures 1.00× the
    material's own largest sample-to-sample step. It is a separate flag and not
    a negative `playbackRate` because a param's range cannot be discontinuous —
    `[-16, 16]` would have to include 0, and rate 0 means freeze.
  - **The loop seam is a crossfade you already paid for.** WSOLA's overlap-add
    _is_ a crossfade, so the analysis position simply wraps and the frames
    either side are aligned like any other pair — no re-prime, no bolted-on
    fade. On a tone whose period does not divide the region, the largest step
    across a looped render measures 1.01× the theoretical maximum against 17×
    for a butt-join. It costs one analysis frame of runway past the loop point
    (30 ms at the default `frameMs`), so looping a region inside a longer sample
    is exact while looping a whole buffer to its last sample comes up one frame
    short.
  - **This node is restartable**, unlike an `AudioBufferSourceNode`, which is
    spent after one play. A source that ended or was stopped can be started
    again; starting one already playing still throws.
  - **Playback starts on the sample you asked for** — no lookahead latency and
    no fade-in. Streaming time-stretchers usually cannot offer that; this one
    owns the whole buffer and reads it by random access, so looking ahead is
    free.

  `setBuffer` takes an `AudioBuffer` or raw channel data, resamples once on the
  spot if the rate differs, and copies rather than detaching. Mono fans out;
  stereo stays panned, because the engine aligns on a mono mix and applies the
  same alignment to both channels so the image cannot tear. `setDuration`,
  `naturalDuration` and `regionDuration` are conveniences over `playbackRate` —
  duration itself cannot be a coherent `AudioParam`, since under modulation it
  is the integral of the rate rather than a value.

  Five construction options set the engine geometry: `channelCount`, `frameMs`,
  `overlap`, `tolerance` and `searchRate`.

  What it is not: an attack-then-loop sampler (one region is both what plays and
  what cycles), sample-accurate at region edges, a formant shifter, or
  transparent on transients — WSOLA is a time-domain method, very good on
  monophonic and rhythmic material and merely acceptable on the hardest.

  The engine is re-derived from published descriptions of WSOLA — principally
  Driedger & Müller's 2016 review, and Verhelst & Roelands' original 1993 papers
  — with the pitch stage from Julius O. Smith's _Digital Audio Resampling Home
  Page_. `src/wsola.ts` records which equation each step implements and the
  seven things it does that the sources do not.
