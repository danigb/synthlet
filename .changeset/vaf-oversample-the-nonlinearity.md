---
"@synthlet/virtual-analog-filter": minor
---

Oversample the seven models that saturate.

**This node now has 16 samples of latency.** It had none. See below.

A saturating nonlinearity generates harmonics without bound, and everything
above Nyquist folds back down as inharmonic aliasing — the "digital" sound
virtual-analog modelling exists to avoid. Huovilainen is explicit that his
ladder needs oversampling, and the two models that already saturated,
`DIODE_LADDER` and `OBERHEIM_*`, had the same problem since the package
shipped and nobody had measured it.

Measured with `aliasSnr` (higher is better), a 3.7 kHz probe — deliberately not
a sub-multiple of 48 kHz, or every alias folds onto a harmonic and the metric
reads a meaningless 97 dB:

| model                         | drive | resonance | before      | after       |
| ----------------------------- | ----- | --------- | ----------- | ----------- |
| `MOOG_LADDER`                 | 10    | 0.5       | 39.5 dB     | **51.0 dB** |
| `MOOG_LADDER` (7.9 kHz probe) | 10    | 0.9       | 26.6 dB     | **35.3 dB** |
| `MOOG_HALF_LADDER`            | 10    | 0.5       | 44.6 dB     | **54.4 dB** |
| `DIODE_LADDER`                | 10    | 0.9       | 14.8 dB     | **31.6 dB** |
| `DIODE_LADDER`                | 100   | 0.9       | 12.5 dB     | **23.4 dB** |
| `OBERHEIM_LPF`                | 10    | 0.9       | 7.3 dB      | **43.4 dB** |
| `OBERHEIM_LPF`                | 100   | 0.9       | **−9.3 dB** | **23.6 dB** |

**Two times, not four, and that is a measurement.** Four times buys another
10–13 dB and costs another doubling: `MOOG_LADDER` measures 0.78 % of realtime
for one voice at 48 kHz without oversampling, 1.96 % at 2×, and 3.91 % at 4×.
The ladder is the expensive one because its delay-free loop is solved per
sample. Trading 2 % of a core for 12 dB is what antiderivative antialiasing
exists to avoid, and that is the follow-up rather than this change.

`KORG35_LPF` and `KORG35_HPF` do not resample. They contain no clipper and no
`tanh` by the library's design, so there is nothing to band-limit, and they
measure above 90 dB either way.

**The latency.** A polyphase FIR resampler is two symmetric filters, one up and
one down, and a symmetric filter delays by half its length: 16 samples at the
base rate, 0.33 ms at 48 kHz, the same number at every sample rate. The Korg 35
pair is delayed to match, because a `type` change that also moved the output by
16 samples would be a click. A polyphase _IIR_ halfband would be near
zero-latency, but its allpass coefficients come out of an elliptic design and a
table of constants copied from a library nobody here owns is exactly the kind of
thing this package has already been bitten by. If you sum this node with a dry
path, compensate.

Coefficient updates still happen at the base rate: the resampling brackets the
block, the segment renderer's runs are rendered inside the oversampled domain,
and an a-rate sweep is still one coefficient update per output sample.
