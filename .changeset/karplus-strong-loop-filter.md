---
"@synthlet/karplus-strong": minor
---

There is a lowpass in the feedback loop, `decay` is a decay time in seconds,
and `brightness` controls the tone. **This changes the sound of every patch
that uses the Karplus-Strong oscillator.**

The loop filter was a bare scalar - it had been one since the first commit, so
nothing was removed - which is why the module never sounded like a plucked
string: high partials have to die before low ones, and here nothing made them.
What damping there was came from the two-point interpolator used for the
fractional delay, whose loss is `|1 - 2*frac(sampleRate/frequency)|`, so the
timbre was a near-arbitrary function of the pitch: at 441 Hz the band above
5 kHz never decayed at all, and one semitone away it was gone in 250 ms.

The loop now runs Smith's Extended Karplus-Strong two-zero damping filter,
`rho * (h0*x' + h1*(x + x''))` with `h0 = (1+brightness)/2` and
`h1 = (1-brightness)/4`. Its impulse response is symmetric, so its delay is
exactly one sample at every frequency and `brightness` changes the tone without
detuning the string.

**`decay` is now seconds** - the time the note takes to fall 60 dB - and means
the same thing at every pitch. It used to be a count of periods, so one knob
position rang for 3.2 s at 110 Hz and 0.22 s at 1760 Hz. To keep an existing
patch ringing for the same time, convert at the pitch you wrote it for:

```ts
decay * 0.1 * (sampleRate / frequency); // old knob -> seconds
// e.g. decay: 0.1 at A4 and 44.1 kHz was about 1.0 s
```

`decay`'s default moves from 0.1 to 1 second accordingly; its declared range,
0.01 to 5, is unchanged and now reads as what it always looked like.

**`brightness` is new**: 0 to 1, default 0.5. 1 is the brightest the loop can
be - the damping filter degenerates to a plain delay and only `decay` remains -
and 0 is the most a three-tap symmetric filter can damp, a zero at Nyquist. It
does not change the decay time: the filter's DC gain is `rho` whatever
`brightness` is.
