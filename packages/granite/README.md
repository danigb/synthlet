# @synthlet/granite

> A granular delay: a cloud of overlapping, windowed, pitch-shifted reads of the
> last few seconds of whatever you patch into it

Part of [Synthlet](https://github.com/danigb/synthlet)

This is the third delay in the library, and the three are the same machine read
three different ways. All of them write their input into the circular buffer in
`scripts/_delay.ts` at exactly 1× and then read it back somewhere behind the
write head. [`DigitalDelay`](https://github.com/danigb/synthlet/tree/main/packages/digital-delay)
reads with a **tap** and hands over to a second tap when you move it.
[`AnalogDelay`](https://github.com/danigb/synthlet/tree/main/packages/analog-delay)
**glides** the one head towards where you asked, which is why moving its knob
bends pitch. `Granite` reads with a **cloud** — up to 64 short windowed
playheads, each with its own start point, its own playback rate, its own
direction and its own place in the stereo field, all reading the same buffer at
once. That is Bencina's Tapped Delay Line variant, the one he calls
_"appropriate for 'effects' processing of real-time input"_, and it is why this
module has a `feedback` knob and a `freeze` button rather than a file loader.

**Every per-grain quantity is a `(centre, spread)` pair**, drawn once per grain
at the moment it starts and never re-read — Truax's control model, and EC2's
grain-integrity invariant. `pitch` and `pitchSpread`, `duration` and
`durationSpread`, `position` and `spray`, `pan` and `panSpread`, `level` and
`levelSpread`.

**Every spread defaults to 0, so eighteen knobs is not eighteen decisions.** At
the defaults the module is deterministic and every grain is identical: a clean
quasi-synchronous stream you can hear the mechanism in. `rate`, `duration`,
`position` and `pitch` are the four that make a sound; the spreads are what turn
that stream into a cloud, and `jitter` and `intermittency` are what stop it
sounding like a machine.

## Install

```bash
npm install @synthlet/granite
```

## Usage

```ts
import { Granite, registerGraniteWorklet } from "@synthlet/granite";

await registerGraniteWorklet(audioContext);

const granite = Granite(audioContext, {
  rate: 40, // grains per second
  duration: 60, // ms each — so 2.4 grains of overlap
  position: 0.3, // how far back in the buffer they read
  pitch: 12, // an octave up
  wet: 1,
});

source.connect(granite).connect(audioContext.destination);
```

That is a stream. This is a cloud — the same engine with the draws turned on:

```ts
const cloud = Granite(audioContext, {
  rate: 80,
  duration: 40,
  durationSpread: 0.4, // grains from 32 to 48 ms
  spray: 0.3, // read origins smeared back through the buffer
  pitchSpread: 7, // a fifth of detune, grain to grain
  panSpread: 1, // across the whole field
  jitter: 0.8, // onsets off the grid, at the same density
  intermittency: 0.15, // and one in seven never fires
});
```

And the two knobs that need a write head:

```ts
// Stop recording. The last 4 seconds are now a playable object, and every
// parameter above still moves.
granite.freeze.value = 1;

// Or feed the cloud back into the buffer. With `pitch` up, this stacks
// transpositions — an octave, then two, then three.
granite.freeze.value = 0;
granite.feedback.value = 0.8;
granite.pitch.value = 12;
```

## Parameters

| Param            | Default | Min | Max  | Rate   | Meaning                                                                                                                           |
| ---------------- | ------- | --- | ---- | ------ | --------------------------------------------------------------------------------------------------------------------------------- |
| `rate`           | 20      | 0   | 2000 | k-rate | Grains per second, independent of `duration`. 0 emits none                                                                        |
| `jitter`         | 0       | 0   | 1    | k-rate | Onset scatter. Each interval is drawn from `mean · (1 ± jitter)`, so the **density does not change**                              |
| `intermittency`  | 0       | 0   | 1    | k-rate | Probability a scheduled grain is skipped. Unlike `jitter` this **does** lower the density. 0.1–0.2 is the erratic-contact texture |
| `duration`       | 60      | 1   | 1000 | k-rate | Grain length in ms. Below ~10–15 ms the envelope's own spectrum is audible, which is a feature                                    |
| `durationSpread` | 0       | 0   | 1    | k-rate | Per-grain length, a **total width**: 1 runs grains from half to one and a half times `duration`                                   |
| `position`       | 0       | 0   | 1    | k-rate | How far back grains read, as a fraction of the reachable buffer. 0 is the freshest audio causality allows                         |
| `spray`          | 0       | 0   | 1    | k-rate | Per-grain read origin, **one-sided**: grains reach further back than `position`, never nearer                                     |
| `pitch`          | 0       | −24 | 24   | k-rate | Transposition in semitones — the playback rate is `2^(pitch/12)`, so ±2 octaves                                                   |
| `pitchSpread`    | 0       | 0   | 24   | k-rate | Per-grain transposition, a **total width** in semitones: 12 spans **one** octave                                                  |
| `reverse`        | 0       | 0   | 1    | k-rate | Probability a grain plays backwards. Not a negative rate — rate 0 is freeze, a different feature                                  |
| `shape`          | 0.5     | 0   | 1    | k-rate | Envelope asymmetry: 0 expodec (percussive), 0.5 a symmetric bell, 1 reversed expodec (reverse-tape)                               |
| `pan`            | 0       | −1  | 1    | k-rate | Constant power for a mono input, L/R balance for a stereo one. 0 is an exact bypass                                               |
| `panSpread`      | 0       | 0   | 1    | k-rate | Per-grain pan, a **half width** — `pan` is already bipolar, so a total width could not reach the whole field                      |
| `level`          | 1       | 0   | 1    | k-rate | Per-grain gain, applied before the overlap sum. The ceiling `levelSpread` hangs from                                              |
| `levelSpread`    | 0       | 0   | 1    | k-rate | Per-grain gain, **downward** from `level`. Spraying upward would push grains past full scale                                      |
| `freeze`         | 0       | 0   | 1    | k-rate | Stops the write head while `> 0`. `feedback` is inert while it is on                                                              |
| `feedback`       | 0       | 0   | 0.95 | k-rate | The grain sum, summed back into the buffer through a saturator and a high-pass. With `pitch` up, stacked transpositions           |
| `wet`            | 1       | 0   | 1    | k-rate | Dry/wet. **1 by default**, where it used to be 0.5. 0 is an exact bypass, sample for sample                                       |

Three more controls are **not** `AudioParam`s, because a parameter cannot resize
an allocation or reseed a generator. They are construction options:

| Option          | Default      | What it does                                                                                                        |
| --------------- | ------------ | ------------------------------------------------------------------------------------------------------------------- |
| `maxGrains`     | 64           | The pool. A stream denser than the pool **drops** grains rather than stealing one that is playing                   |
| `bufferSeconds` | 4            | How far back `position` reaches — about 2 MB of delay line at 44.1 kHz                                              |
| `seed`          | `0x9e3779b9` | Seeds the per-grain draws. Two nodes with the same seed make the same cloud; give a stereo pair two different seeds |

## Three things the table cannot carry

- **`rate` and `duration` are independent, and their product is the sound.**
  `rate × duration / 1000` is the number of grains overlapping at any moment: at
  the defaults it is 1.2, audibly granular; at `rate: 800, duration: 60` it is
  48 and the grains fuse into a wash. Sweeping one against the other is the
  whole instrument, and it is the thing this module used to conflate.

- **The three spreads are three different shapes of range**, and the difference
  is forced rather than chosen. `durationSpread` and `pitchSpread` are **total
  widths** centred on their value — `pitchSpread: 12` spans one octave, not two.
  `panSpread` is a **half width**, because `pan` is already bipolar on ±1 and a
  total width would put the edges of the field out of reach. `spray` and
  `levelSpread` are **one-sided**, back and down respectively, which is Truax's
  "the average **or minimum** value": `position: 0` is an edge of the buffer, so
  a symmetric deviation from it could only ever cover half of one.

- **Reading faster than 1× costs grain length, and the module clamps rather than
  glitches.** A grain read at `2^(pitch/12) > 1` catches up with the write head —
  Bencina's _"non-causal case of trying to read 'future samples'"_ — so its
  length is clamped to `bufferSize · 0.25 / ratio`. `duration`'s 1000 ms ceiling
  is exactly a quarter of the default `bufferSeconds` for the same reason, and a
  smaller configured buffer clamps further. This happens after `durationSpread`
  and `pitchSpread` have been drawn, so it is per grain, and it is asserted at
  every corner of every range.

## Measured quality

Each of these is an assertion in `src/dsp.test.ts` — 70 tests — with the measured
value in a comment beside its threshold. **Three of the tickets' criteria were
not met as written**; all three are here, with the number and the reason, because
a section like this is worth nothing if it quietly restates a threshold it
missed.

| What                            | Measured                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| ------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Density                         | **2,000 grains/s** sustained at 20 ms, 0 dropped, 40 concurrent against a pool of 64. The old engine could not exceed 345/s by construction                                                                                                                                                                                                                                                                                                                                                                     |
| Cost                            | that same 2,000 grains/s renders in **0.0508× real time** — twenty times faster than it plays, single-threaded, with nothing allocated                                                                                                                                                                                                                                                                                                                                                                          |
| Transposition, one grain alone  | **0.00 cents** at −24, −12, 0, +12 and +24, by interpolated zero crossings — an oracle sharing nothing with the estimator below                                                                                                                                                                                                                                                                                                                                                                                 |
| Transposition, in the stream    | 0.80 / 0.21 / 3.25 cents at 0 / +12 / −12 by autocorrelation, against a ±5-cent threshold                                                                                                                                                                                                                                                                                                                                                                                                                       |
| Gain at one grain of overlap    | **−0.059 dB** of the input's RMS, against a ±1 dB threshold, and within **0.11 dB** at every `shape` — the envelope's mean square is 3/8 whatever its asymmetry                                                                                                                                                                                                                                                                                                                                                 |
| **Gain across a rate sweep**    | **3.30 dB against a "below 3 dB" threshold — not met, by 0.30 dB.** The whole excess is the `activeCount > 2` clause of Clouds' gain law: at exactly two grains of overlap the normalisation is switched off, and two decorrelated grains carry twice the power of one, which is **+3.01 dB by arithmetic**. From three overlaps upward the spread is 2.11 dB. `> 1` would meet the number and depart from the reference                                                                                        |
| Causality                       | **536 million** instrumented reads across every corner of `pitch` × `duration` × `position` × the five spreads, at two buffer sizes, every delay inside `[1, size − 4]` — measured span `[11.03, 176388.15]`. Asserted by wrapping the real read, not by algebra                                                                                                                                                                                                                                                |
| `wet: 0`                        | **bit-exact** bypass, sample for sample, with grains active                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| Neutral spreads                 | seven FNV-1a digests over both output channels, captured from `3726675`, `6aa2726` and `d410330` **before** each later ticket was written — all bit-identical                                                                                                                                                                                                                                                                                                                                                   |
| `pitchSpread: 12`               | ratios span **one octave ±5%**, uniform in semitones by decile occupancy (worst decile 14.0% off)                                                                                                                                                                                                                                                                                                                                                                                                               |
| `spray: 1`                      | read origins cover **[0.0013, 0.9996]** of the reachable buffer from the default `position: 0`                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `reverse: 0.5`                  | **50.90%** of grains backwards, against a ±3% threshold; exactly none at 0 and all at 1                                                                                                                                                                                                                                                                                                                                                                                                                         |
| `pan`                           | **6.021 dB of grain power at every one of nine settings** across the range for a mono source — constant to three decimals. L/R balance for a stereo one, and exactly `1/1` at the centre                                                                                                                                                                                                                                                                                                                        |
| `jitter` preserves density      | **+0.399%** at `jitter: 1` against a 2% threshold; interonset sd 505.70 samples against a predicted 509.22                                                                                                                                                                                                                                                                                                                                                                                                      |
| **`jitter` dissolves the comb** | **17.45 dB at one grain of overlap**, against the ticket's unweakened 15 dB — but **not at the `duration` the criterion implies**. At the default 60 ms, `rate: 100` is six overlaps, and a Hann window is COLA at every integer overlap: the output is a pure delay with **−70.82 dB** of modulation and nothing to dissolve. The 100 Hz tooth does not merely blur, it cancels — a uniform interonset density on `[0, 2μ]` has `\|φ(f)\| = \|sin(2πfμ)/(2πfμ)\|`, exactly zero at `f = 1/μ`                   |
| `intermittency`                 | **exactly 50.00%** of 2,000 grains emitted at 0.5; 0 grains and RMS exactly 0 at 1                                                                                                                                                                                                                                                                                                                                                                                                                              |
| The two are independent         | +0.60 / +0.41 / +1.01% change in emitted count at `intermittency` 0.3 / 0.5 / 0.8 across the whole `jitter` range                                                                                                                                                                                                                                                                                                                                                                                               |
| Freeze holds                    | **0.136 dB** of level drift over the 30 s after the input is gone, and 0.136 dB in the worst single second                                                                                                                                                                                                                                                                                                                                                                                                      |
| Freeze does not click           | entering ≤ **+0.07 dB** of peak first-difference over the unfrozen baseline, leaving ≤ **+2.37 dB**, over 4 signals × 4 settings against a 3 dB threshold. Without the 100-sample fade the leaving edge reaches **+9.82 dB** — which is what the fade is for                                                                                                                                                                                                                                                    |
| **Feedback is stable**          | finite over 60 s at `feedback: 0.95`; the last thirty one-second peak buckets are not monotonically rising; and **peak 3.3761 at 0.95, below 3.7074 at 0.5** — a linear loop cannot be quieter at its maximum than in its middle, so that is the saturator, measured. **The criterion's "peak below 0 dBFS" is not met and cannot be**: granite normalises _power_, so the peak carries the material's crest factor, and the same 60 s already peaks at **2.1824 at `feedback: 0`**, before any feedback exists |
| Feedback stacks transpositions  | **108.30 / 103.94 / 101.12 dB** above the noise floor at 440 / 880 / 1760 Hz from a 220 Hz sine at `feedback: 0.8, pitch: 12`, against 109.34 / 12.89 / **−19.32** at `feedback: 0`                                                                                                                                                                                                                                                                                                                             |
| **No DC accumulation**          | **−102.75 dBFS** after 60 s at `feedback: 0.95`, against −102.80 at 0 — **on a zero-mean input**, which is what "no accumulation" means. On the suite's own LCG noise it reads −31.03 dBFS at _every_ feedback setting, including 0, because that generator's own mean is −40.43 dBFS                                                                                                                                                                                                                           |
| Allocation                      | **nothing** allocated after construction, checked by proxying all four array constructors around a warmed-up render                                                                                                                                                                                                                                                                                                                                                                                             |
| Off the audio thread            | the whole suite runs with no `AudioWorkletProcessor` stub anywhere, and a source scan asserts `dsp.ts` names no worklet global                                                                                                                                                                                                                                                                                                                                                                                  |

## What it deliberately isn't

granite has principled non-features rather than missing ones, and almost all of
them are one decision: **its write head advances at exactly 1× and cannot be
argued with**, so grains can only ever reach _backward_ from now. That is the
seam with `strata`, the stored-sample granulator this module's parameter names
were fixed for. **granite: any source, one time. strata: one source, any time.**

- **There is no scanner.** You cannot drive a read position forward, hold it
  still against a moving file, or scrub it. A scanner is what makes the buffer a
  place rather than a past, and it is the whole of `strata`'s reason to exist.
- **There is no `setBuffer`.** To granulate a file, feed a
  [`TimestretchAudioSource`](https://github.com/danigb/synthlet/tree/main/packages/timestretch-audio-source)
  into granite's input — it will granulate whatever arrives, including a file
  already being time-stretched. Granting granite a buffer without a scanner
  would be all of the cost and none of the payoff.
- **There is no loop and no region.** Both are properties of a source with a
  length, and granite's input has neither; `TimestretchAudioSource` has both.
- **There is no start and no stop.** granite is an effect: it processes what it
  is given and outputs silence when there is nothing. `rate: 0` emits no grains,
  and `wet: 0` is an exact bypass.
- **There are no LFOs and no modulation matrix.** Every one of the eighteen
  parameters is an `AudioParam`, so
  [`@synthlet/lfo`](https://github.com/danigb/synthlet/tree/main/packages/lfo)
  connected to any of them is the modulation, at any rate and any shape. EC2
  spends six LFOs and a fifteen-slider panel on what synthlet gets from the
  graph.
- **There is no per-grain filter.** Roads' microfiltration — hundreds of
  independent band-passes a second — is the most interesting thing left out, and
  it is deferred rather than declined: it costs a biquad state per _active_
  grain, and it applies equally to `strata`, so it belongs to whichever ships
  second and gets backported.

## Sourced numbers, and the ones that are ours

The architecture, the control model and four specific pieces of arithmetic come
from the sources below. Everything marked ours is marked in `src/params.ts` and
`src/dsp.ts` too, so a reader of the code cannot mistake one for the other.

**Theirs.** Bencina's grain scheduler (`if (--nextOnset <= 0) { activate();
nextOnset += nextInteronset(); }`), his Direct Interonset Specification, his
preemption clause and his warning that a granular feedback loop needs a limiter
in it. Truax's `(centre, range)` model, his `[0, 2·mean]` interonset range — the
reason `jitter` preserves density — and freeze. Roads' stochastic masking, whose
polarity `intermittency` inverts. EC2's grain-integrity invariant and its
asymmetry axis for `shape`. From Clouds: the causality clamp, the smoothed
`1/√(n−1)` gain law with its `activeCount > 2` clause, the mono/stereo pan split,
and the `20 + 100·feedback²` Hz feedback high-pass.

**Ours.**

| Ours                         | What it is                                                                                                                                                                                                                      |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| The envelope family          | A moving-peak raised cosine, `p = 0.05 + 0.9·shape`. EC2 names the axis but not a curve; this one is chosen because `∫env² = 3/8` at **every** `p`, so `shape` changes asymmetry and nothing else — a property the tests assert |
| The window gain              | `1/√(3/8)` = 1.63299, normalising the envelope to unit **RMS** rather than unit peak. A unit-peak window puts an abutting stream 4.26 dB down by construction                                                                   |
| The three spread conventions | Total width, half width and one-sided. Truax names the model, not the shape of each range; each of the three is forced by the parameter it governs                                                                              |
| `seed ^ 0x5bf03635`          | The scheduler's generator, offset from the grain generator by murmur3's third finalizer constant — mulberry32's fixed odd increment means any two seeds share a cycle, and this offset has no small-integer structure           |
| `FADE_SAMPLES = 100`         | The raised-cosine ramp on the _leaving_ edge of freeze. Truax's number; the asymmetry — nothing on the entering edge — is derived here and measured                                                                             |

## References

- R. Bencina,
  [_Implementing Real-Time Granular Synthesis_](https://www.rossbencina.com/static/writings/gs_ap2004.pdf),
  in _Audio Anecdotes III_, 2001 — the Delay Line Granulator this module is, the
  scheduler, and both SequenceStrategies
- B. Truax, _Real-Time Granular Synthesis with a Digital Signal Processor_,
  Computer Music Journal 12(2), 1988, and _Real-Time Granulation of Sampled
  Sound with the DMX-1000_, Proc. ICMC 1986 — the `(centre, range)` control
  model, the `[0, 2·mean]` range, and freeze
- B. Truax, _Discovering Inner Complexity: Time Shifting and Transposition with
  a Real-Time Granulation Technique_, CMJ 18(2), 1994 — the continuous model,
  and the variable-rate time-shifting this module defers
- C. Roads, J. Kilgore and J. DuPlessis, _Emission Control_, Proc. ICMC 2021 —
  the parameter surface, the grain-integrity invariant, and the separation of
  `jitter` from `intermittency`
- C. Roads, _Microsound_, MIT Press, 2001 — stochastic masking, which is
  `intermittency`, and the pulsar synthesis this module is deliberately not
- Mutable Instruments Clouds — the causality clamp, the smoothed `1/√(n−1)` gain
  normalisation, the pan split and the feedback high-pass, all read as a worked
  example and re-derived here

Original work, implemented from the papers. No third-party source was copied;
see the repository's
[THIRD-PARTY-LICENSES.md](https://github.com/danigb/synthlet/blob/main/THIRD-PARTY-LICENSES.md).

## License

MIT © [Daniel Gómez Blasco](https://github.com/danigb)
