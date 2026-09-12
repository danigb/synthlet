# Third-party licences and attribution

Synthlet is MIT licensed — see [LICENSE.md](LICENSE.md).

Some packages contain DSP that was ported from, or generated from, third-party
work. This file collects the notices those upstreams require, plus a credit for
every derivation whether or not a notice is owed.

Packages whose upstream licence requires the notice to accompany copies of the
software also carry that notice in their own `packages/<name>/LICENSE.md`, which
is what ships in the npm tarball. This file is the complete register.

## A note on Faust-generated code

Several packages are Faust programs compiled to Rust and hand-translated to
TypeScript, or compiled directly. The Faust compiler is LGPL, and GRAME
[state](https://faustdoc.grame.fr/manual/faq/) that its licence does not
propagate to the code the compiler generates.

What does carry through is the licence of the *library functions* used. Every
Faust function used here declares either `LicenseRef-STK-4.3` or `MIT`, both of
which are permissive and both of which require the copyright and permission
notice to be preserved. That preservation — not copyleft — is what this file is
for. No synthlet package needs to change its own licence.

---

## Derivations

### @synthlet/virtual-analog-filter

Generated from the Faust virtual analog filter library,
[`vaeffects.lib`](https://github.com/grame-cncm/faustlibraries/blob/master/vaeffects.lib),
version 1.5.0 - see `packages/virtual-analog-filter/dsp/compile.txt` for the
pinned blob.

| Faust function | Declared author | Declared licence | synthlet source |
| --- | --- | --- | --- |
| `ve.moogLadder` | Dario Sanfilippo | `LicenseRef-STK-4.3` | `src/moog.ts` (see below) |
| `ve.moogHalfLadder` | Eric Tarr | `LicenseRef-STK-4.3` | `src/moog-half.ts` (see below) |
| `ve.korg35LPF` | Eric Tarr | `LicenseRef-STK-4.3` | `src/korg35.ts` |
| `ve.korg35HPF` | Eric Tarr | `LicenseRef-STK-4.3` | `src/korg35.ts` |
| `ve.diodeLadder` | Eric Tarr | `LicenseRef-STK-4.3` | `src/diode.ts` |
| `ve.oberheim` | Eric Tarr | `LicenseRef-STK-4.3` | `src/oberheim.ts` |

`vaeffects.lib` states: "Except where noted otherwise, the Faust functions below
in this section are Copyright (C) 2003-2017 by Julius O. Smith III
&lt;jos@ccrma.stanford.edu&gt; and released under the (MIT-style) STK-4.3
license."

Notice required. See [STK-4.3](#stk-43) below.

**The two ladders are no longer purely upstream's.** `src/moog.ts` and
`src/moog-half.ts` still carry `ve.moogLadder`'s and `ve.moogHalfLadder`'s
linear TPT cores, unchanged, and the attribution above stands for those. What
is not upstream's is the saturating feedback path and the delay-free-loop
solver that resolves it: `vaeffects.lib` says of these functions that they have
"no nonlinearities", and that is accurate about the code it ships. The
nonlinearity here is our transcription of Huovilainen's differential-pair
analysis (*Non-linear Digital Implementation of the Moog Ladder Filter*, DAFx
2004, eq. 1-6) resolved by the discrete-time method in Chowdhury's *A Review of
Methods for Resolving Delay-Free Loops* (§4). Both are papers rather than code;
no third-party source was copied for it, and it is MIT like the rest of
synthlet. See `packages/virtual-analog-filter/src/saturate.ts`.

### @synthlet/dattorro-reverb

Generated from
[`reverbs.lib`](https://github.com/grame-cncm/faustlibraries/blob/master/reverbs.lib):

```
declare dattorro_rev author "Jakob Zerbian";
declare dattorro_rev licence "LicenseRef-STK-4.3";
```

Implements the reverb topology described in Jon Dattorro, *Effect Design Part 1:
Reverberator and Other Filters*, JAES 45(9), 1997.

Notice required. See [STK-4.3](#stk-43) below.

### @synthlet/reverb-delay

Generated from
[`reverbs.lib`](https://github.com/grame-cncm/faustlibraries/blob/master/reverbs.lib):

```
declare greyhole author "Julian Parker, bug fixes and minor interface changes by Till Bovermann";
declare greyhole license "MIT";
```

Notice required. See [Greyhole (MIT)](#greyhole-mit) below.

### @synthlet/state-variable-filter

Ported from
[`SvfLinearTrapOptimised2.hpp`](https://github.com/FredAntonCorvest/Common-DSP/blob/master/Filter/SvfLinearTrapOptimised2.hpp)
in `FredAntonCorvest/Common-DSP`, MIT licensed, "Copyright (c) 2016 Fred Anton
Corvest (FAC)".

The underlying algorithm is Andrew Simper (Cytomic), [*Solving the continuous SVF
equations using trapezoidal integration and equivalent
currents*](https://www.cytomic.com/files/dsp/SvfLinearTrapOptimised2.pdf).

Notice required. See [Common-DSP (MIT)](#common-dsp-mit) below.

### @synthlet/noise

The pink noise generator implements Larry Trammell's "A New Shade of Pink"
stochastic Voss-McCartney variant.

- Author: Larry Trammell
- Copyright: © Larry Trammell, 2016-2020
- Licence: [Creative Commons Attribution 4.0 International](https://creativecommons.org/licenses/by/4.0/)
- Source: <https://www.ridgerat-tech.us/pink/newpink.htm>

CC BY 4.0 requires that the author, the licence and a link to the licence are
given. That is this entry, and the block comment in `src/dsp.ts`.

The white noise generator is `Math.random()` and is original.

A second pink-noise algorithm attributed to Cooper Baker was removed — see
[Notes](#notes).

### @synthlet/ad

The attack-decay envelope follows the approach described in
[sndkit](https://paulbatchelor.github.io/sndkit/env/) by Paul Batchelor, which
is released under [The Unlicense](https://unlicense.org/) (a public domain
dedication). No notice is required; the credit is a courtesy.

### @synthlet/polyblep-oscillator

This package derives **structure** from one third-party source and **ideas** from
five papers. The two are recorded separately because they carry different
obligations: the first owes a notice, the second owes a citation.

**What it cites.** The literature the design follows, and what each paper is
responsible for:

| What | Citation |
| --- | --- |
| The 2-point quadratic PolyBLEP residual | V. Välimäki and A. Huovilainen, *Antialiasing Oscillators in Subtractive Synthesis*, IEEE Signal Process. Mag. 24(2), pp. 116–125, 2007 |
| The 4-point B-spline order, and the cost/benefit argument | V. Välimäki, J. Pekonen and J. Nam, *Perceptually Informed Synthesis of Bandlimited Classical Waveforms Using Integrated Polynomial Interpolation*, J. Acoust. Soc. Am. 131(1), pp. 974–986, 2012 (Tables VII–IX) |
| BLAMP — correcting slope discontinuities | J. Kleimola and V. Välimäki, *Reducing Aliasing from Synthetic Audio Signals Using Polynomial Transition Regions*, IEEE Signal Process. Lett. 19(2), pp. 67–70, 2012; F. Esqueda, V. Välimäki and S. Bilbao, *Rounding Corners with BLAMP*, Proc. DAFx-16, pp. 121–128, 2016 |
| The two rules that make polynomial hard sync work | Kleimola and Välimäki 2012, §IV |
| The C¹ caution for a synced triangle, and MinBLEP | E. Brandt, *Hard Sync Without Aliasing*, Proc. ICMC, 2001 |

**The residuals were derived, not transcribed.** `src/_blep.ts` obtains its BLEP
and BLAMP residuals by integrating the centred cardinal B-spline once and twice,
from the spline's definition; the derivation is in that file's header and
`src/blep.test.ts` asserts its three characteristic properties (continuity at the
segment joins, the value at the origin, and zero area). **No coefficient table
was copied out of any paper.** Välimäki, Pekonen & Nam's own Tables VII–IX were
deliberately not transcribed: an earlier attempt to implement them from a
PDF→markdown conversion produced worse-than-naive aliasing, while the same
framework reproduced a hand-derived residual to the decimal. The
table above is therefore **intellectual credit, not the provenance of code** — the
same standing as the `@synthlet/timestretch-audio-source` row under
[Provenance of every other package](#provenance-of-every-other-package). Brandt
2001 in particular contains no polynomial at all; it is a windowed-sinc table BLEP
plus MinBLEP, and it is cited here for hard sync, not for the residual.

**Retired: the sndkit credit.** This entry used to read, in full: "The PolyBLEP
correction follows sndkit by Paul Batchelor, under The Unlicense. No notice
required." The 2-point correction it described was deleted when the oscillator was
rewritten on a discontinuity scheduler with 4-point B-spline residuals, so there is
no longer any code the credit could attach to. sndkit is released under The
Unlicense, a public domain dedication, so no notice was ever owed and none lapses
with the removal.

**What it derives from source** is below, and it is the only part of this entry
that carries a licence obligation.

The oscillator's **scheduling structure** derives from
[stmlib / eurorack](https://github.com/pichenettes/eurorack) by Mutable
Instruments — specifically `stages/oscillator.h`, © 2017 Emilie Gillet, under
the MIT licence. Notice required. See
[stmlib / eurorack (MIT)](#stmlib--eurorack-mit) below.

What was taken, and it is structure rather than mathematics:

- the `this_sample` / `next_sample` scheme, in which a discontinuity detected on
  one sample writes a correction into samples already computed but not yet
  emitted, so the correction is placed from where the phase actually landed
  rather than predicted from the increment. `src/dsp.ts` generalises the one
  pending sample to a four-slot ring, because the 4-point kernel's support is
  ±2 samples rather than ±1;
- the `high_ ^ (phase_ < pw)` edge test for the discontinuity that does not sit
  at the cycle boundary (`oscillator.h:187`, `:217`);
- the `discontinuity = (slope_up + slope_down) * frequency` recipe for scaling a
  corner correction by the slope change per sample (`oscillator.h:180-215`);
- the increment cap `kMaxFrequency = 0.25f` (`oscillator.h:53`).

What was **not** taken: the kernels. stmlib's `ThisBlepSample`,
`NextBlepSample`, `ThisIntegratedBlepSample` and `NextIntegratedBlepSample` are
not used and are not present. `src/_blep.ts` carries B-spline residuals derived
by integration, from the definition of the cardinal B-spline — the derivation is
in that file's header and `src/blep.test.ts` asserts its three characteristic
properties. The choice is measured, not stylistic: at 2-point order stmlib's
integrated kernel scores 3–7 dB better than the cubic B-spline, and at 4-point
order the B-spline beats both by a further 10–20 dB.

### @synthlet/instrument

The package contains no DSP. What it derives is the **algorithm** in
`src/_voices.ts` — which voice plays a note, and which note a monophonic
instrument sounds — from three sources with three different obligations.

**Notice required.** The voice allocator and the note stack follow
[stmlib / eurorack](https://github.com/pichenettes/eurorack) by Mutable
Instruments — `algorithms/voice_allocator.h` and `algorithms/note_stack.h`,
© 2012 Emilie Gillet, under the MIT licence. See
[stmlib / eurorack (MIT)](#stmlib--eurorack-mit) below.

What was taken is the algorithm, and it is stated in prose in that file's
header:

- `NoteOn`'s three ordered rules — reuse the voice already sounding this note,
  else the least recently *touched* released voice, else steal — and `NoteOff`
  clearing the active bit and *touching* the slot, which is what makes "least
  recently touched" mean "released longest ago";
- the decision **not** to ask whether a voice is silent, which is what makes
  the algorithm portable to Web Audio at all: no envelope here reports its end;
- the note stack's two simultaneous orderings, press order and pitch order, and
  eviction of the least recently played note on overflow.

**The data structure was not copied.** stmlib's LRU permutation array, its
intrusive linked list with base-1 indices and its dummy node at slot 0 are all
absent: `_voices.ts` keeps a touch counter and four flat typed arrays, because
the shuffling loop and the pointer chasing exist to avoid comparisons and
allocations that JavaScript gives away free at a capacity of 16. Both files are
read from a gitignored `refs/eurorack` checkout; no stmlib source is present in
this repository, vendored or bundled.

**Described from documentation, not from source.** `StealMode.Protect` is
JUCE's `Synthesiser::findVoiceToSteal` rule — the lowest and the highest
sounding note are protected unless already releasing, and the oldest of the
rest is taken. JUCE is **not** MIT-licensed, its source was **not** read, and
nothing here is derived from it: the rule is described in JUCE's published API
documentation, and one sentence of behaviour is not a work. The implementation
is this repository's own.

**Cited, not derived.** The four note priorities — last, low, high, first — and
the claim that they are not reducible to each other come from Gordon Reid,
*Synth Secrets* Part 18, "Priorities & Triggers", *Sound On Sound*, October
2000. `src/_voices.test.ts` transcribes the article's three example lines as
its reference. A taxonomy is not code; the citation is intellectual credit, and
Yarns, Surge and rune06 independently agree on the same four names.

### @synthlet/adsr

The envelope is based on Nigel Redmon's ADSR code
([earlevel.com](https://www.earlevel.com/main/2013/06/01/EG-generators/)) and
uses two TCO constants from Will Pirkle's
[SynthLab](https://github.com/willpirkleaudio/SynthLab) `analogegcore.h`
(Tritone Systems). Both are permissive but neither publishes a standard licence
text, so this credit — repeated in `src/dsp.ts` and the package README — is the
attribution.

### @synthlet/lfo

`concaveTransform` in `src/dsp.ts` is the MMA concave transform as presented by
Will Pirkle (Tritone Systems) in *Designing Software Synthesizer Plug-Ins in C++*
and SynthLab, including the 5.0/12.0 correction coefficient. Same situation as
`adsr`: permissive, no standard licence text, so the credit is the attribution.

---

## Provenance of every other package

Recorded so that the provenance of the catalogue is complete rather than
inferred. Nothing below derives from third-party source.

| Package | Origin |
| --- | --- |
| `@synthlet/analog-delay` | Original, written from datasheets, service manuals and published papers; no third-party source was copied. **Papers:** V. Zavalishin and J. D. Parker, *Tape-like Delay Modulation*, Proc. DAFx-18 (the glide-based read that resamples the line, which is the pitch bend this package exists for); C. Raffel and J. O. Smith, *Practical Modeling of Bucket-Brigade Device Circuits*, Proc. DAFx-10 (the BBD chain and its compander); M. Holters and J. D. Parker, *A Combined Model for a Bucket Brigade Device and its Input and Output Filters*, Proc. DAFx-18 (the variable-rate formulation, which is what couples bandwidth to `time`); O. Niemitalo, *Polynomial Interpolators for High-Quality Resampling of Oversampled Audio*, 2001 (the Hermite kernel). **Hardware documentation**, read directly rather than through secondary sources: the Panasonic MN3005 and MN3011 datasheets for the stage counts and the MN3011's six tap positions, and Roland's RE-202 manual for the head ratios. **Mutable Instruments Clouds** (Copyright 2014 Emilie Gillet, MIT) was read as a worked example for two pieces of arithmetic, each documented at its use site in `src/dsp.ts`: the one-pole glide coefficient of `LoopingSamplePlayer`, and the feedback high-pass at `20 + 100·feedback²` Hz together with the cubic soft clipper `x(27 + x²)/(27 + 9x²)` — the same two `digital-delay` uses. **No Clouds source is present, and none was copied:** it is not vendored, not bundled and not in the repository, on the same terms set out for `granite` below. **In-repo reuse:** `scripts/_delay.ts` for the circular buffer and its Hermite read. The wow and flutter depths, the flutter rate, the tape gap-loss constant, the `age` curve and the compander's reference level and time constants are **chosen by ear and labelled as chosen** in `src/dsp.ts`: no sourced wow/flutter figure exists for the RE-201, EP-3 or Echorec, and studio-deck standards are explicitly not applicable |
| `@synthlet/arp` | Original. Scale bitmasks use the standard pitch-class-set numbering (bit 0 = root), a convention, not code |
| `@synthlet/clip-amp` | Original. `tanh` and hard-clip shapers |
| `@synthlet/clock` | Original |
| `@synthlet/digital-delay` | Original, re-derived from published descriptions. **Papers:** S. J. Schlecht and E. A. P. Habets, *On Lossless Feedback Delay Networks*, IEEE Trans. Signal Process. 65(6), 2017 — the rotation feedback matrix is the N = 2 case of their characterisation; J. Dattorro, *Effect Design Part 1: Reverberator and Other Filters*, JAES 45(9), 1997 (the allpass diffusion); O. Niemitalo, *Polynomial Interpolators for High-Quality Resampling of Oversampled Audio*, 2001 (the Hermite fractional read). **Mutable Instruments Clouds** (Copyright 2014 Emilie Gillet, MIT) was read as a worked example for two pieces of arithmetic, each documented at its use site in `src/dsp.ts`: the feedback high-pass at `20 + 100·feedback²` Hz (`granular_processor.cc:190-203`), and the cubic soft clipper `x(27 + x²)/(27 + 9x²)` used in the blend form `x + fb·(tanh(x) − x)`, which is what makes `feedback = 0` store the input exactly. **No Clouds source is present, and none was copied**, on the same terms set out for `granite` below. **In-repo reuse:** `scripts/_delay.ts` for the circular buffer and its Hermite read. The dual-read-head handover that makes a `time` change pitch-preserving, the stability high-pass's role in the loop and the tap/diffusion structure are this module's own |
| `@synthlet/euclid` | Original. Implements the Euclidean rhythm algorithm of Godfried Toussaint, *The Euclidean Algorithm Generates Traditional Musical Rhythms* (2005) |
| `@synthlet/timestretch-audio-source` | Original, re-derived from published algorithm descriptions: J. Driedger and M. Müller, [*A Review of Time-Scale Modification of Music Signals*](https://doi.org/10.3390/app6020057), Applied Sciences 6(2):57, 2016, §4.1 (equations 6-11) and §7.2 (pitch-shifting as resampling plus TSM); W. Verhelst and M. Roelands, [*An Overlap-Add Technique Based on Waveform Similarity (WSOLA) for High Quality Time-Scale Modification of Speech*](https://doi.org/10.1109/ICASSP.1993.319366), Proc. ICASSP-93; M. Roelands and W. Verhelst, [*WSOLA for Time-Scale Modification of Speech: Structures and Evaluation*](https://doi.org/10.21437/Eurospeech.1993-59), Proc. EUROSPEECH'93; and J. O. Smith III, [*Digital Audio Resampling Home Page*](https://ccrma.stanford.edu/~jos/resample/) for the windowed-sinc pitch stage. Which published equation each step implements is recorded in the header of `src/wsola.ts`, along with the seven things it does that the sources do not |
| `@synthlet/granite` | Original, re-derived from published algorithm descriptions and from one MIT-licensed reference implementation read as a worked example. **Papers:** R. Bencina, [*Implementing Real-Time Granular Synthesis*](https://www.rossbencina.com/static/writings/gs_ap2004.pdf), in *Audio Anecdotes III*, 2001 — the Delay Line Granulator architecture, the `nextOnset` grain scheduler, its Direct Interonset Specification and its preemption clause; B. Truax, *Real-Time Granular Synthesis with a Digital Signal Processor*, CMJ 12(2), 1988, *Real-Time Granulation of Sampled Sound with the DMX-1000*, Proc. ICMC 1986, and *Discovering Inner Complexity*, CMJ 18(2), 1994 — the `(centre, range)` stochastic control model, the `[0, 2·mean]` interonset range and freeze; C. Roads, J. Kilgore and J. DuPlessis, *Emission Control*, Proc. ICMC 2021 — the parameter surface and the per-grain integrity invariant; C. Roads, *Microsound*, MIT Press, 2001 — stochastic masking, which is `intermittency`. **Mutable Instruments Clouds** (Copyright 2014 Emilie Gillet, MIT) was read as a worked example for five specific pieces of arithmetic, each re-derived in this module's own terms and each documented at its use site in `src/dsp.ts`: the causality clamp (`granular_sample_player.h:205-224`), the mono/stereo pan split (`:186-204`), the smoothed `1/√(n−1)` gain normalisation with its `activeCount > 2` clause (`:152-165`), the grain pre-delay (`grain.h:120-127`), and the feedback high-pass at `20 + 100·feedback²` Hz (`granular_processor.cc:190-203`). **No Clouds source is present, and none was copied:** it is not vendored, not bundled and not in the repository — it is read from a gitignored `refs/eurorack` checkout. MIT's notice-preservation clause therefore does not bite, since there is no copy or substantial portion to attach it to; the credit here stands in its place. **In-repo reuse:** `clip-amp`'s `tanh` shaper, `digital-delay`'s saturator-blend form `x + fb·(tanh(x) − x)` (which is what makes `feedback: 0` store the input exactly) and its Clouds-derived feedback high-pass, and `scripts/_delay.ts` for the circular buffer and its Hermite read. The envelope family, the unit-RMS window gain, the three spread conventions, the scheduler's second generator and the freeze fade are this module's own and are marked as such in `src/params.ts` and `src/dsp.ts` |
| `@synthlet/impulse` | Original |
| `@synthlet/karplus-strong` | Original, from the published algorithm: Karplus & Strong, [*Digital Synthesis of Plucked String and Drum Timbres*](https://users.soe.ucsc.edu/~karplus/papers/digitar.pdf), CMJ 7(2), 1983 |
| `@synthlet/level-meter` | Original |
| `@synthlet/lookahead-limiter` | Original, re-derived from published algorithm descriptions: Hämäläinen, [*Smoothing of the Control Signal without Clipped Output in Digital Peak Limiters*](https://www.dafx.de/paper-archive/2002/papers/DAFX02_Hamalainen_smoothing_control_signal.pdf), DAFx-02, §3.5, and ITU-R BS.1770-4 Annex 2 (BS.1770-*style* 4× true-peak detection: the interpolator is a 48-tap Hann-windowed sinc, **not** the ITU reference coefficients). Rewritten from scratch in 2026; the earlier implementation, which cited `DanielRudrich/SimpleCompressor` (GPL-3.0), was removed in full |
| `@synthlet/param` | Original |
| `@synthlet/wavetable-oscillator` | Original, re-derived from published algorithm descriptions: M-H. Serra, D. Rubine and R. Dannenberg, *Analysis and Synthesis of Tones by Spectral Interpolation*, JAES 38(3), 1990 (the morph crossfade/swap discipline and the in-phase-harmonics constraint on table authoring, §1.1–1.2), also published as *The Analysis and Resynthesis of Tones via Spectral Interpolation*, Proc. ICMC 1988; A. Horner, J. Beauchamp and L. Haken, *Wavetable and FM Matching Synthesis of Musical Instrument Tones*, Proc. ICMC, 1992, and J. Mohr, *Wavetable Interpolation of Multiple Instrument Tones*, Proc. ICMC, 2005 (independent confirmation of the same phase constraint); R. Trausmuth and A. Huovilainen, *POWERWAVE*, Proc. DAFx-05, 2005 (mip-level interpolation); and R. Radna, *Dynamic Stochastic Wavetable Synthesis*, Proc. DAFx-23, 2023 (the stochastic mode). No code from any of these is present — each is a from-scratch implementation. Optionally loads third-party wavetables at runtime from [WaveEdit Online](https://waveeditonline.com/); none are bundled |
| `synthlet` | Original. Umbrella package |

**On the strength of the lookahead-limiter claim.** This is re-derivation from
published, permissively-citable sources with the chain recorded — not
clean-room. Clean-room is a two-team protocol (a specification team that has
read the original and an implementation team that has not), and this was
written by one person who had read the prior implementation. What is recorded
is which published equations each step implements, in the header of
`packages/lookahead-limiter/src/dsp.ts`. No code from `SimpleCompressor`, and
none from any other third-party limiter, is present.

Two parts of it are not in the sources at all, and are marked as such in that
header rather than being allowed to borrow the sources' authority. The release
cascade is derived from five stated requirements. The true-peak interpolator is
in the family BS.1770-4 Annex 2 describes but is not its coefficient table:
Attachment 1 of that annex publishes a specific 48-coefficient 4-phase filter,
and this package designs its own 48-tap Hann-windowed sinc instead. What the
package claims about that filter is therefore measured, not inherited — a
full-scale sine reads within ±0.1 dB from 60 Hz to 10 kHz at 48 kHz, and within
±0.35 dB from there to 20 kHz, asserted by `dsp.test.ts`.

**On the strength of the timestretch-audio-source claim.** The same standard,
and the same caveat. This package was written after reading a description of an
internal InVideo WSOLA implementation — its frame length, overlap, tolerance,
decimated search rate and semitone cap — so it is re-derivation with the chain
recorded, **not** clean-room, for exactly the reason set out above: clean-room
is a two-team protocol and this was not one. No code from that implementation,
or from any other third-party time-stretch library, is present. SoundTouch
(LGPL) and Rubber Band (GPL) were deliberately not read, and neither were the
patents covering decimation-based SOLA search.

Seven parts of it are not in the sources at all, and are marked as such in the
header of `src/wsola.ts` rather than being allowed to borrow the sources'
authority: the normalised similarity measure (the papers use an unnormalised
cross-correlation), normalisation by the running window sum rather than the
constant of eq. 11, the rise-free first window, the coarse-to-fine decimated
search, the rule that ties in the search are broken towards the smallest
shift, the loop seam, and reverse as a coordinate mirror. Each of those claims is measured, not inherited: `wsola.test.ts`
asserts them against `src/wsola-oracle.ts`, an independently written
brute-force full-rate implementation that exists only for the tests.

**On the strength of the granite claim.** The same standard again, and the same
caveat stated plainly. Mutable Instruments Clouds was read as a worked example
for five specific pieces of arithmetic and each was re-derived in granite's own
terms — this is re-derivation with the chain recorded, **not** clean-room, for
the reason set out above. What was taken is small, closed-form and enumerated: a
causality inequality, a pan split by input channel count, a `1/√(n−1)` power law
with a smoothing coefficient and an `activeCount > 2` clause, a pre-delay, and a
high-pass corner as a function of a feedback setting. Each is documented at its
use site in `packages/granite/src/dsp.ts` with the file and line it was read
from, and each is derived rather than transliterated — granite's grain
representation, scheduler, envelope family, window gain, spread conventions,
generators and freeze fade have no counterpart in Clouds. **No Clouds source is
present in this repository:** it is not vendored, not bundled and not committed.
`refs/eurorack` is a local, gitignored checkout.

**On Clouds' licence, because the repository said the wrong thing.** The granite
ticket folder recorded `refs/eurorack` as GPL-3.0. It is not. Every file read
here — `clouds/dsp/granular_sample_player.h`, `clouds/dsp/grain.h` and
`clouds/dsp/granular_processor.cc` — carries Emilie Gillet's standard MIT
notice, and there is no GPL text anywhere under `clouds/`. The granite research
document had it right. Recorded here because an attribution file that overstates
an upstream's terms is as wrong as one that understates them, and because the
correction makes the position simpler rather than harder: MIT is permissive, and
no notice-preservation duty arises where nothing was copied.

Five things in granite are not in any of its sources and are marked as such in
`src/params.ts` and `src/dsp.ts` rather than being allowed to borrow their
authority: the moving-peak raised-cosine envelope with `p = 0.05 + 0.9·shape`
(EC2 names the asymmetry axis but no curve; this family was chosen because its
mean square is 3/8 at every `p`, so `shape` is level-neutral by construction),
the unit-RMS window gain `1/√(3/8)`, the three different spread conventions and
why each is forced, the scheduler's second generator at `seed ^ 0x5bf03635`, and
the 100-sample raised-cosine fade on freeze's leaving edge. Each of the five is
measured by `dsp.test.ts` rather than asserted.

**Affirmative statement on the reading list.** The root README links a number of
open-source synthesis projects — Surge, VCV Rack, the Synthesis ToolKit, stmlib,
`timowest/analogue` and others. **With one exception, recorded above**, those
are reading and inspiration only, and no code in this repository derives from
them. The exception is stmlib, in two places, both listed under Derivations
with the MIT notice that requires:
[`@synthlet/polyblep-oscillator`](#synthletpolyblep-oscillator) takes the
scheduling structure of `stages/oscillator.h`, and
[`@synthlet/instrument`](#synthletinstrument) follows the algorithm of
`algorithms/voice_allocator.h` and `algorithms/note_stack.h`.
Nothing derives from Surge, VCV Rack or the Synthesis ToolKit. This matters most
for [`timowest/analogue`](https://github.com/timowest/analogue), which carries
no licence at all: nothing was taken from it.

---

## Licence texts

### STK-4.3

Applies to the Faust functions used by `virtual-analog-filter` and
`dattorro-reverb`. Copyright is held by each function's declared author, listed
above; the licence text originates with the Synthesis ToolKit in C++ (STK) by
Perry R. Cook and Gary P. Scavone.

```
Permission is hereby granted, free of charge, to any person obtaining a copy of
this software and associated documentation files (the "Software"), to deal in
the Software without restriction, including without limitation the rights to
use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies
of the Software, and to permit persons to whom the Software is furnished to do
so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

Any person wishing to distribute modifications to the Software is asked to send
the modifications to the original developer so that they can be incorporated
into the canonical version. This is, however, not a binding provision of this
license.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

### Greyhole (MIT)

Applies to `reverb-delay`. `re.greyhole` is declared MIT in `faustlibraries` and
authored by Julian Parker, with bug fixes and minor interface changes by Till
Bovermann.

```
Permission is hereby granted, free of charge, to any person obtaining a copy of
this software and associated documentation files (the "Software"), to deal in
the Software without restriction, including without limitation the rights to
use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies
of the Software, and to permit persons to whom the Software is furnished to do
so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

### stmlib / eurorack (MIT)

Applies to `polyblep-oscillator`, whose discontinuity scheduler derives from
`stages/oscillator.h`, copyright 2017 Emilie Gillet
(emilie.o.gillet@gmail.com); and to `instrument`, whose `scripts/_voices.ts`
follows the algorithm of `algorithms/voice_allocator.h` and
`algorithms/note_stack.h`, copyright 2012 Emilie Gillet, without copying
either data structure.

**It does not apply to `scripts/_delay.ts`**, the circular buffer shared by
`analog-delay`, `digital-delay` and `granite`, and that distinction is worth
stating rather than leaving to be inferred. Its fractional read uses the same
4-point Hermite kernel as `stmlib::DelayLine::ReadHermite`, but both implement
Niemitalo's published kernel and neither is the source of the other; its
header records the three decisions it takes differently, starting with an
incrementing write pointer where stmlib's decrements. Correspondence noted, not
a derivation, and so no notice is owed.

```
Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in
all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
THE SOFTWARE.
```

### Common-DSP (MIT)

Applies to `state-variable-filter`.

```
MIT License

Copyright (c) 2016 Fred Anton Corvest (FAC)

Permission is hereby granted, free of charge, to any person obtaining a copy of
this software and associated documentation files (the "Software"), to deal in
the Software without restriction, including without limitation the rights to
use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies
of the Software, and to permit persons to whom the Software is furnished to do
so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

### CC BY 4.0

Applies to the Trammell pink noise algorithm in `noise`. Full text:
<https://creativecommons.org/licenses/by/4.0/legalcode>. The attribution it
requires is given in the `@synthlet/noise` entry above.

---

## Notes

**Removed: Cooper Baker pink noise.** `@synthlet/noise` previously routed the
undocumented raw parameter value `2` to a second pink-noise algorithm carrying
only the bare URL `http://www.cooperbaker.com/home/code/pink%20noise/`. Its
terms could not be established — the site serves a self-signed certificate and
the Internet Archive copy is unreachable. Rather than ship code of unknown
provenance for a path that was not reachable through the public API
(`getNoiseTypes()` never listed it) and was not documented, the algorithm was
removed.

**`re.greyhole` licence discrepancy.** `faustlibraries` declares `greyhole` as
MIT. Julian Parker's original SuperCollider implementation carries GPL2+
metadata. Relying on the declaration in the library actually used is the normal
downstream position, and it is what synthlet does; recorded here so the
discrepancy is not lost.

**STK-4.3 is not quite MIT.** It is MIT-style, but it explicitly requires the
copyright and permission notice to be preserved, and adds a non-binding request
that modifications be sent upstream. The preservation requirement is why this
file and the per-package `LICENSE.md` files exist.
