---
"@synthlet/state-variable-filter": minor
---

**Breaking, twice.** The bandpass is unity-gain, and `Q` defaults to 0.7071.

Two defaults that were defensible in isolation and surprising to anyone arriving from
`BiquadFilterNode`, which this package's README positions itself against. They ship
together because they are one apology to one user.

**The bandpass had a peak gain of exactly `Q`** — −6.02 dB at Q=0.5, +32.04 dB at Q=40 — so
sweeping resonance swept 38 dB of level with it, and now that `Q` tracks a modulator a
resonance envelope was also a volume envelope. It is now normalized: 0.000 dB at the centre
frequency at every `Q`, with the −3 dB bandwidth it always had. Only the level moved.
Simper never flags this; Lazzarini & Timoney (§3.5) say it outright, and Zavalishin treats
the normalized bandpass as the primary one throughout Chapter 4.

**`Q` defaulted to 0.5**, which measures as a −0.09 dB peak: over-damped, with no −3 dB
point at the cutoff at all. It is not Butterworth, not `BiquadFilterNode`'s default of 1,
and not a decision recorded anywhere in this repository's history. 0.7071 is Butterworth and
measures as exactly 0.000 dB with −3 dB at the cutoff.

**To get the old behaviour back:** put a `GainNode` with `gain = Q` after a bandpass, and
pass `Q: 0.5` explicitly. Nothing else changes — `Notch`, `Peak` and `AllPass` all set `m1`
against the _raw_ `v1` and are bit-identical; the change is one arm of one switch.

No eighth type: seven responses is this package's shape, and an eighth differing from the
second only in level is how a type enum becomes a junk drawer.
