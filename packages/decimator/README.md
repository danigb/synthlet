# @synthlet/decimator

> Sample-rate and bit-depth reduction, with the anti-alias and reconstruction
> filters as two switches

Part of [Synthlet](https://github.com/danigb/synthlet).

A sample-and-hold clocked fast, followed by a quantiser — which is to say, an
analogue-to-digital converter, which is what Synth Secrets Part 17 says an ADC
is. Drop the rate and a 10 kHz sine comes back as a 3.33 kHz one. Drop the bits
and you get the crunch. Turn either filter on and you get the half of the
chapter that explains why real converters have them.

## Install

```bash
npm i @synthlet/decimator
```

Or `npm i synthlet` for every module at once.

## Usage

```ts
import { registerDecimatorWorklet, Decimator } from "@synthlet/decimator";

const ac = new AudioContext();
await registerDecimatorWorklet(ac);

const crush = Decimator(ac, { rate: 8000, bits: 8 });
source.connect(crush).connect(ac.destination);
```

## Why this is not a WaveShaperNode

A `WaveShaperNode` with a staircase curve reduces **bit depth**, and that is the
easy half. It has no notion of time, so it cannot reduce a **sample rate** —
and nothing else in Web Audio can either. A `BaseAudioContext` has one rate,
fixed at construction; there is no node that holds a sample, and no way to run
part of a graph slower than the rest.

That is the gap this fills, and it is why the module is a `Decimator` rather
than a `Bitcrusher`: the sample rate is the headline and the bits are the
second parameter.

## Parameters

| Param         | Default | Range        | Rate   | Meaning                                                    |
| ------------- | ------- | ------------ | ------ | ---------------------------------------------------------- |
| `rate`        | 44100   | 100 … 192000 | k-rate | The new sample rate in Hz. At or above the context's, none |
| `bits`        | 24      | 1 … 24       | k-rate | Bit depth. 24 is transparent; fractional values allowed    |
| `antialias`   | 0       | 0 … 1        | k-rate | 1 puts the lowpass at `0.45 × rate` **before** the hold    |
| `reconstruct` | 0       | 0 … 1        | k-rate | 1 puts the same lowpass **after** the quantiser            |

### Why `rate` defaults to 44100

An `AudioParamDescriptor` cannot read the context it will be used in, so the
default cannot be "whatever this context runs at". 44100 is the common case, so
the default is **a bypass on a 44.1 kHz context and a 44.1 kHz hold on a 48 kHz
one**. Anything at or above the context's rate short-circuits the hold
entirely.

With `rate` at or above the context's, `bits: 24`, and both switches off, this
module is a **bit-exact wire** — not "transparent to 1e-6", equal sample for
sample. All three short-circuits are asserted.

### `rate` is a free-running clock, and the jitter is real

`13333 / 44100` is not an integer, so the hold period alternates between three
and four samples. That one-sample jitter is what a real free-running converter
clock does against a fixed one, and it shows up as low-level sidebands.

Snapping `rate` to integer divisors of the context's rate would remove it — and
would make the slider jump, and would put the book's own numbers (13.33 kHz,
11.11 kHz) out of reach, since they are divisors of nothing. So the jitter
stays, and this paragraph is the disclosure.

### `bits: 1` has three levels, not two

Quantisation is mid-tread: `round(x · q) / q` with `q = 2^(bits−1)`. Zero is a
**level** rather than a band edge, so silence stays silence and a signal
crossing zero does not chatter between two codes.

The price is one extra code at the top: `bits: 6` takes 65 distinct values
rather than Reid's 64, and `bits: 1` gives −1, 0 and 1 rather than just ±1. The
alternative — clamping the code the way two's complement does — buys exactly
2^bits levels and costs a half-band error at full scale. Keeping zero was
judged worth more.

`bits` is continuous, so a fractional value is a fractional number of levels
and a slider from 24 down to 2 is a smooth crush rather than 22 steps.

## The filters are switches, and that is the point

```
in → [antialias] → hold → quantise → [reconstruct] → out
```

Both are the same 8th-order Butterworth lowpass at `0.45 × rate` — four
cascaded biquads, 48 dB/octave, coefficients recomputed only when `rate`
changes. Both default to **off**, because aliasing is what this module is for
and what you should hear first.

They are separate switches because they demonstrate different claims:

| Patch                      | What you get                  | Part 17     |
| -------------------------- | ----------------------------- | ----------- |
| 10 kHz sine, `rate: 13333` | a 3.33 kHz tone               | Figure 17   |
| 10 kHz sine, `rate: 11111` | a 1.11 kHz tone               | Figure 18   |
| … and `antialias: 1`       | the fold is 44 dB down        | "filter it" |
| 1 kHz sine, `rate: 22050`  | a staircase, images at 21 kHz | Figure 19   |
| … and `reconstruct: 1`     | a 1 kHz sine again            | "bullshit"  |

The last row is the paragraph everyone remembers — _"'audio stored digitally
sounds horrible because it's a series of steps, not like real music' bullshit.
But that's exactly what it is: bullshit."_ One click turns the staircase back
into the sine it came from, with its RMS within 0.03 dB of the original.

Four sections rather than two because the lesson needs them: at `rate: 13333`
the corner is 6 kHz and the 10 kHz input sits 1.67× above it, where a
24 dB/octave filter takes only about 14 dB off and leaves a visible alias. This
cascade takes 44.5 dB off at 44.1 kHz.

The corner tracks `min(rate, sampleRate)`, so it is the same clock the hold
uses and can never be asked for a frequency above the host's Nyquist.

## Stereo

Every channel is held on **one clock** — a converter has two inputs and one
crystal — and each channel keeps its own filter state. So a stereo image
survives rather than being decorrelated by two accumulators drifting apart.

## Not in this module

**No noise, no wow, no `mix`.** This is not a lo-fi multi-effect. Tape hiss is
`Noise`, tape age is `AnalogDelay`'s `age`, and a dry path is a `GainNode`. One
module, one lesson.

**No dither, yet.** Dither and noise shaping are a second lesson — why 16 bits
is enough — and they need a listening pass of their own. `bits` is the seam they
will land on.

**`rate` is k-rate.** An LFO on the sample rate is a classic effect and worth
having; it is also eight biquads' coefficients recomputed per sample with the
filters on. Revisit if someone asks for it, with the filters documented as
block-rate.

## License

MIT © [danigb](https://github.com/danigb)
