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

One exception is `packages/chorus/dsp/chorus.dsp`, which contains hand-copied
Faust *example* source rather than compiler output. See its entry below.

---

## Derivations

### @synthlet/virtual-analog-filter

Generated from the Faust virtual analog filter library,
[`vaeffects.lib`](https://github.com/grame-cncm/faustlibraries/blob/master/vaeffects.lib).

| Faust function | Declared author | Declared licence | synthlet source |
| --- | --- | --- | --- |
| `ve.moogLadder` | Dario Sanfilippo | `LicenseRef-STK-4.3` | `src/moog.ts` |
| `ve.moogHalfLadder` | Eric Tarr | `LicenseRef-STK-4.3` | `src/moog-half.ts` |
| `ve.korg35LPF` | Eric Tarr | `LicenseRef-STK-4.3` | `src/korg35.ts` |
| `ve.korg35HPF` | Eric Tarr | `LicenseRef-STK-4.3` | `src/korg35.ts` |
| `ve.diodeLadder` | Eric Tarr | `LicenseRef-STK-4.3` | `src/diode.ts` |
| `ve.oberheim` | Eric Tarr | `LicenseRef-STK-4.3` | `src/oberheim.ts` |

`vaeffects.lib` states: "Except where noted otherwise, the Faust functions below
in this section are Copyright (C) 2003-2017 by Julius O. Smith III
&lt;jos@ccrma.stanford.edu&gt; and released under the (MIT-style) STK-4.3
license."

Notice required. See [STK-4.3](#stk-43) below.

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

### @synthlet/chorus

The compiled DSP in `src/` is Faust compiler output and is covered by the note
above.

`packages/chorus/dsp/chorus.dsp` is different: its `chorus_mono` definition is
copied verbatim from the Faust distribution's
`examples/SAM/chorus/chorusForBrowser.dsp`. The Faust distribution is licensed
under the GNU Lesser General Public License, version 2.1 or later:

```
FAUST compiler
Copyright (C) 2003-2024 GRAME, Centre National de Creation Musicale
Copyright (C) 2023-2024 INRIA
```

That one file is therefore **not** covered by synthlet's MIT licence. It is not
published to npm — the package ships `dist` only — so this is a repository-level
notice. The `chorus_mono` function has no equivalent in `faustlibraries`
(`phaflangers.lib` declares only `flanger_mono`, `flanger_stereo`,
`vibrato2_mono`, `phaser2_mono` and `phaser2_stereo`), so the copy cannot simply
be replaced with a library reference.

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

The PolyBLEP correction follows
[sndkit](https://paulbatchelor.github.io/sndkit/blep/) by Paul Batchelor, under
The Unlicense. No notice required.

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
| `@synthlet/arp` | Original. Scale bitmasks use the standard pitch-class-set numbering (bit 0 = root), a convention, not code |
| `@synthlet/clip-amp` | Original. `tanh` and hard-clip shapers |
| `@synthlet/clock` | Original |
| `@synthlet/euclid` | Original. Implements the Euclidean rhythm algorithm of Godfried Toussaint, *The Euclidean Algorithm Generates Traditional Musical Rhythms* (2005) |
| `@synthlet/flex-audio-buffer-source` | Original, re-derived from published algorithm descriptions: J. Driedger and M. Müller, [*A Review of Time-Scale Modification of Music Signals*](https://doi.org/10.3390/app6020057), Applied Sciences 6(2):57, 2016, §4.1 (equations 6-11) and §7.2 (pitch-shifting as resampling plus TSM); W. Verhelst and M. Roelands, [*An Overlap-Add Technique Based on Waveform Similarity (WSOLA) for High Quality Time-Scale Modification of Speech*](https://doi.org/10.1109/ICASSP.1993.319366), Proc. ICASSP-93; M. Roelands and W. Verhelst, [*WSOLA for Time-Scale Modification of Speech: Structures and Evaluation*](https://doi.org/10.21437/Eurospeech.1993-59), Proc. EUROSPEECH'93; and J. O. Smith III, [*Digital Audio Resampling Home Page*](https://ccrma.stanford.edu/~jos/resample/) for the windowed-sinc pitch stage. Which published equation each step implements is recorded in the header of `src/wsola.ts`, along with the seven things it does that the sources do not |
| `@synthlet/granite` | Original granular engine |
| `@synthlet/impulse` | Original |
| `@synthlet/karplus-strong` | Original, from the published algorithm: Karplus & Strong, [*Digital Synthesis of Plucked String and Drum Timbres*](https://users.soe.ucsc.edu/~karplus/papers/digitar.pdf), CMJ 7(2), 1983 |
| `@synthlet/level-meter` | Original |
| `@synthlet/lookahead-limiter` | Original, re-derived from published algorithm descriptions: Hämäläinen, [*Smoothing of the Control Signal without Clipped Output in Digital Peak Limiters*](https://www.dafx.de/paper-archive/2002/papers/DAFX02_Hamalainen_smoothing_control_signal.pdf), DAFx-02, §3.5, and ITU-R BS.1770-4 Annex 2 (BS.1770-*style* 4× true-peak detection: the interpolator is a 48-tap Hann-windowed sinc, **not** the ITU reference coefficients). Rewritten from scratch in 2026; the earlier implementation, which cited `DanielRudrich/SimpleCompressor` (GPL-3.0), was removed in full |
| `@synthlet/param` | Original |
| `@synthlet/wavetable-oscillator` | Original. Wavetables are loaded at runtime from [WaveEdit Online](https://waveeditonline.com/), not bundled |
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

**On the strength of the flex-audio-buffer-source claim.** The same standard,
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

**Affirmative statement on the reading list.** The root README links a number of
open-source synthesis projects — Surge, VCV Rack, the Synthesis ToolKit, stmlib,
`timowest/analogue` and others. Those are reading and inspiration only. No code
in this repository derives from any of them. This matters most for
[`timowest/analogue`](https://github.com/timowest/analogue), which carries no
licence at all: nothing was taken from it.

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
