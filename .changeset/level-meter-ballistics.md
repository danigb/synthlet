---
"@synthlet/level-meter": minor
---

Give the meter ballistics a peak meter can use: instant attack, a release in
dB per second, a hold marker and a clip latch. **This changes every number the
meter reports.**

One one-pole, `peak*0.9 + block*0.1`, used to serve as both attack and release —
so it was slow in the direction that must be instant and fast in the direction
that must be slow, and because the coefficient was applied per _block_ rather
than per sample it was a different meter at every sample rate:

|                                 | before               | now      |
| ------------------------------- | -------------------- | -------- |
| one-block full-scale transient  | −20.00 dB            | 0 dB     |
| time to settle on a steady tone | 117 ms               | instant  |
| fall rate                       | 343 dB/s at 48 kHz   | 8.7 dB/s |
| fall rate at 44.1 / 48 / 96 kHz | 315 / 343 / 686 dB/s | 8.7 dB/s |

A kick drum read 20 dB low and clip detection was impossible: a signal could hit
+3 dBFS and the bar never leave the green.

The numbers are [K-Meter's](https://github.com/mzuther/K-Meter/blob/master/Source/meter_ballistics.cpp),
an open-source implementation of Bob Katz's published K-System spec — 26 dB in
3 s, instantaneous rise. The "20 dB in 1.7 s" figure that circulates in forums
could not be traced to IEC/TR 60268-18, which is paywalled and was not obtained,
so it is not cited.

Four new construction options, all overridable and none of them `AudioParam`s —
ballistics are a property of the instrument, not a signal:

| Option               | Default | Meaning                                     |
| -------------------- | ------- | ------------------------------------------- |
| `releaseDbPerSecond` | 8.7     | peak fall rate (K-Meter, 26 dB / 3 s)       |
| `holdMs`             | 1500    | how long the hold marker parks at a maximum |
| `clipHoldMs`         | 1500    | how long the clip latch stays lit           |
| `clipThreshold`      | 1       | linear magnitude that counts as a clip      |

A silent channel now reads exactly `-Infinity` dB. The peak is flushed to zero
below 1e-10 so `20*log10(peak)` cannot print −200 dB where the user expects −∞ —
a correctness fix, not a performance one: V8's denormal penalty was measured at
1.00× in the state-variable-filter audit.

The hold marker and the clip latch are computed here and published through the
buffer in the release that adds the levels accessor.
