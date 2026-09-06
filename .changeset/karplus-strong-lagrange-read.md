---
"@synthlet/karplus-strong": minor
---

The string's timbre no longer depends on its tuning, and `frequency.maxValue`
is now a number that is true.

The fractional delay was read with two-point linear interpolation, which is a
lowpass whose loss at Nyquist is `|1 - 2*frac(sampleRate/frequency)|` applied
once per trip round the loop. That made the timbre a near-arbitrary function of
the pitch: five pitches within 20 cents of A4 spanned 52.7 dB of high-band
decay, and at 441 Hz - exactly `44100/100` - nothing above 5 kHz decayed at
all. Smith describes the artifact by name: certain notes "jump out as 'buzzy'
when they correspond to a nearly integer delay-line length".

The read is now a five-tap, fourth-order Lagrange interpolation, which is what
Smith's own Extended Karplus-Strong listing uses (`fdelay4`) and what the
Helsinki group has historically used for digital-waveguide fine-tuning. The
same five pitches now span about 1 dB. Lagrange rather than allpass because it
is "robust under rapidly time-varying conditions", which is what a pitch glide
needs.

**`frequency.maxValue` drops from 20000 to 5000.** The old number was never
playable: 20 kHz is 2.2 samples of delay, which is not a string. 5 kHz is 8.8
samples, and it is the highest round number whose measured pitch stays inside 5
cents on every pluck - at 5500 Hz the worst pluck is 8.3 cents out, at 6000 Hz
21 cents. An `AudioParam` whose value is set above the new maximum is clamped
to it by the browser, as it always was; what changes is that the clamp is now
at a frequency the module can actually play.

Notes ring slightly longer as a result, since the interpolator is no longer
adding loss the decay model did not know about: measured t60 at `decay = 1`
moves from 0.83/0.85/0.89 to 0.84/0.85/0.90 seconds at 110/440/1760 Hz, and
from 0.87 to 0.95 at `brightness = 1`, where the damping filter is transparent
and only `decay` is left.
