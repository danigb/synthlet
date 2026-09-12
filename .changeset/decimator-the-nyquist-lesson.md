---
"@synthlet/decimator": minor
"synthlet": minor
---

`Decimator`: sample-rate and bit-depth reduction, with the anti-alias and
reconstruction filters as two switches.

```ts
const crush = Decimator(ac, { rate: 13333, bits: 8 });
source.connect(crush).connect(ac.destination);
```

**Web Audio cannot lower a sample rate inside a graph, and this is the gap.** A
`BaseAudioContext` has one rate, fixed at construction; a `WaveShaperNode` with
a staircase curve reduces _bit depth_ but has no notion of time; no node holds a
sample. The engine here is `@synthlet/sample-hold`'s latch driven by an internal
phase accumulator instead of a trigger, which is what Synth Secrets Part 17 says
an analogue-to-digital converter is — the chapter opens by returning to Part 16
for exactly that reason.

So it is a `Decimator` and not a `Bitcrusher`: the chapter is about the sample
rate, and `bits` is the second parameter.

**The filters are switches, not a topology.** Part 17 makes three claims and
two of them are claims about the filters, so a module with them baked in could
not make either point:

| Patch                      | Reads                 | Part 17     |
| -------------------------- | --------------------- | ----------- |
| 10 kHz sine, `rate: 13333` | a **3.33 kHz** tone   | Figure 17   |
| 10 kHz sine, `rate: 11111` | a **1.11 kHz** tone   | Figure 18   |
| … and `antialias: 1`       | the fold 44.5 dB down | "filter it" |
| 1 kHz sine, `rate: 22050`  | a staircase, images   | Figure 19   |
| … and `reconstruct: 1`     | a 1 kHz sine again    | Table 2     |

Both default to **off**, because aliasing is what the module is for and what you
should hear first — the same call `granite` made for `wet: 1`. Every row above
is a test, measured on the real processor at both 44.1 and 48 kHz.

The last row is the paragraph everyone remembers — _"'audio stored digitally
sounds horrible because it's a series of steps, not like real music' bullshit.
But that's exactly what it is: bullshit."_ One click turns the staircase back
into the sine it came from, RMS within 0.03 dB of the original.

**Both filters are one 8th-order Butterworth at `0.45 × rate`**, four cascaded
biquads, coefficients recomputed only when `rate` changes — so a block costs
eight biquads with both on and none with both off. Four sections rather than
two because the lesson needs them: at `rate: 13333` the 10 kHz input sits 1.67×
above the 6 kHz corner, where 24 dB/octave takes only ~14 dB off and leaves a
visible alias. The corner tracks `min(rate, sampleRate)`, so it is the same
clock the hold uses and is never asked for a frequency above the host's Nyquist.

**Three exact short-circuits**, and the bypass is bit-identical rather than
merely close: `rate` at or above the context's skips the hold, `bits: 24` skips
the quantiser, and each switch off skips its cascade.

**Two things that look like defects and are documented instead.** `13333/44100`
is not an integer, so the hold period alternates between three and four samples
— real free-running-clock jitter, and snapping `rate` to integer divisors would
make the slider jump and put the book's own numbers out of reach. And `bits: 1`
has three levels, −1, 0 and 1: quantisation is mid-tread so zero is a level
rather than a band edge, which keeps silence silent at the price of one extra
code at the top (`bits: 6` takes 65 values rather than Reid's 64).

**Silence is exactly zero, not nearly.** The cascades decay into denormals —
measured, the reconstruction filter's state reaches `5e-324` a second after the
signal stops — so they flush their state to zero rather than using the library's
usual injected alternating `DENORMAL`. That constant is the right answer in
`digital-delay` and `chorus` and the wrong one here: a ±1e-20 injection is a
tone at Nyquist 400 dB down, and this module has to be _silent_ on silence.
Sixty seconds of it, both filters on, asserted as equality with zero.

**`rate` defaults to 44100** rather than to the context's rate, because an
`AudioParamDescriptor` cannot read the context it will be used in. So the
default is a bypass on a 44.1 kHz context and a 44.1 kHz hold on a 48 kHz one,
and both documents say so.

One clock across every channel — a converter has two inputs and one crystal —
and per-channel filter state, so a stereo image survives.

`decimator` joins `scripts/_spectrum.ts`'s copy list, the first package whose
_subject_ is aliasing rather than one that has to avoid it: its readings have to
be the readings `ring-mod` and `lfo` are calibrated against. Its parameter table
joins `docs.test.ts`, checked against the descriptors in both directions and in
both documents.

Deliberately not here: noise, wow and `mix` (`Noise`, `AnalogDelay`'s `age`, a
`GainNode`); dither and noise shaping, which are a second lesson that needs a
listening pass of its own; and an a-rate `rate`, which is eight biquads'
coefficients per sample with the filters on.
