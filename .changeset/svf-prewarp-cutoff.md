---
"@synthlet/state-variable-filter": patch
---

Prewarp the cutoff, so the filter no longer diverges below a 40 kHz sample rate.

`frequency.maxValue` is a compile-time `20000` and Nyquist is not. `AudioParam` clamps to
the descriptor's constants and has never known the sample rate, so at any sample rate below
40 kHz the parameter's own declared maximum sits past the pole of `tan`: `g` went negative,
the poles left the unit circle and the state reached ±1e198 within 512 samples. At 22.05 kHz
and 32 kHz the output was `Infinity`; at 8 kHz a cutoff of 6 kHz diverged while 20 kHz gave
`tan(2.5π) = 3.3e15` and silently turned the lowpass into a bypass. `new AudioContext({
sampleRate: 22050 })` is legal, and `OfflineAudioContext` is routinely built at low rates.

The fix is Zavalishin's continuous-speed bounded cutoff prewarping (_The Art of VA Filter
Design_, §3.8 eq. 3.23), not a `Math.min`: a hard breakpoint puts a jump in the rate of
change of the cutoff, which he describes as "a sudden change of the perceived modulation
speed as the cutoff traverses through the prewarping breakpoint" — and an LFO on
`frequency` is what this package is for. The ceiling is 0.72 of Nyquist, which is 15876 Hz
at 44.1 kHz and scales; the fraction is ours, not his.

**This also fixes a tuning error that exists at 48 kHz today.** Plain cutoff prewarping is
increasingly detuned toward Nyquist (§3.8, Fig. 3.18), which is why Zavalishin bounds it at
around 16 kHz in the first place. Below the ceiling `g` is bit-identical to what it was, so
nothing changes for a cutoff under ~15.9 kHz at 44.1 kHz or ~17.3 kHz at 48 kHz; above it,
the top of the range is now positioned better than it was.
