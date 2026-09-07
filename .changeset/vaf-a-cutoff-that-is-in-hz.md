---
"@synthlet/virtual-analog-filter": major
---

`frequency` is now a cutoff in Hz on all nine models.

**Breaking, and it will change every patch that does not use `MOOG_LADDER`.**
`frequency` is documented as "Cutoff in Hz", range 20…20000. It was Hz on one
of the nine models. On the other eight the wrappers handed `vaeffects.lib` a
linear fraction of Nyquist where it expects a normalised _logarithmic_ control,
and the library's own `cf = 2*(10^(3*normFreq+1))` map turned that into a
cutoff about two decades low.

Measured −3 dB corner, resonance 0.2, asking for `frequency: 1000` at 48 kHz:

| model              | before | after   |
| ------------------ | ------ | ------- |
| `MOOG_LADDER`      | 907 Hz | 907 Hz  |
| `MOOG_HALF_LADDER` | 30 Hz  | 1163 Hz |
| `KORG35_LPF`       | 24 Hz  | 870 Hz  |
| `DIODE_LADDER`     | 13 Hz  | 502 Hz  |
| `OBERHEIM_LPF`     | 41 Hz  | 1542 Hz |

The remaining spread from the request is the topology: a cascade of four
one-pole sections crosses −3 dB at 0.435 of its design cutoff, a 2-pole section
at or above it. That is a filter's character, not a tuning error, and it is now
asserted per model.

Two more things follow from the same fix:

- **The top of the range exists.** `frequency: 20000` reached a design cutoff
  of 3.2 kHz; it now reaches 20 kHz. The top two octaves of the parameter were
  unreachable on eight models.
- **The cutoff no longer moves with the sample rate.** The same patch was a
  different filter at 44.1 kHz and 96 kHz, because the quantity being mapped
  was a fraction of Nyquist. Measured drift across 44.1/48/96 kHz is now under
  0.1 % on four models and 1.9 % on the diode ladder.

There is no compatibility mode. The old behaviour is not a tuning choice anyone
could have made deliberately, and shipping it behind a flag would mean shipping
the bug twice.

`MOOG_LADDER` is unchanged, to the digit. Its transcription was stale — generated
from a `vaeffects.lib` revision whose `moogLadder` really did take a fraction of
Nyquist — so it was the one model whose wrapper matched its body. All six
wrappers now share one convention, and `dsp/compile.txt` records the Faust
version and the library blob that produced them, which is what would have caught
this: two circuit files generated from revisions with incompatible conventions
were checked in side by side.
