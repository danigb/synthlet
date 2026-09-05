---
"@synthlet/karplus-strong": minor
---

The pluck has a level, a dynamic, a position and a pick angle. **This changes
the sound of every patch that uses the Karplus-Strong oscillator**, and it is
the second and last of the deliberate breaking changes in this round.

Every pluck used to be identical: the string was excited with **full-scale
white noise**, measured peak 0.96-0.99, with no level, no shaping and no
position. So a pluck was a 0 dBFS transient whatever the patch's gain staging,
soft and hard plucks were indistinguishable, and plucking at the bridge sounded
like plucking over the soundhole. What is there now is Smith's Extended
Karplus-Strong excitation chain,
`excitation : smooth(pickangle) : pickposfilter : levelfilter(L,freq)`, every
filter of it **outside** the feedback loop - so none of these four can change
the decay time or destabilise the string.

- **`level`** (0-1, default **0.5**) scales the burst before the filters. A
  default pluck now peaks at about -13 dBFS instead of 0.
- **`dynamics`** (0-1, default **0.5**) is the dynamic-level filter: "in real
  strings, the spectral centroid typically rises as plucking/striking becomes
  more energetic". Soft plucks are darker. It maps to Smith's level-at-Nyquist
  as `L = dynamics^(5/3)`, the exponent that puts his own default of -10 dB at
  the middle of the knob; 1 bypasses the filter. Sweeping it from 1 to 0 moves
  the attack's spectral centroid from 4208 Hz to 1395 Hz at A4 and leaves the
  decay time within 13%.
- **`position`** (0-0.5, default **0.13**, Smith's) is the pick-position comb,
  `1 - z^-floor(position*P)`, with 0 at the bridge. Its first notch lands at
  `frequency/position` - measured within 0.3% at 110 and 440 Hz. **0 bypasses
  it.** The comb delay is truncated to a whole sample rather than interpolated,
  which is Smith's own choice ("pick position accuracy is normally not
  critical"); the cost is up high, where the notch can land several percent off
  - 8.6% at 880 Hz with the default position.
- **`pickAngle`** (0-0.9, default **0**) is the pick-direction one-pole: "real
  up-picks may be at different angles than down-picks, thus resulting in
  different plucking stiffness". At 0.9 it takes 10.3 dB out of the first 5 ms
  above 5 kHz.

To get the old excitation back, set `level: 1, dynamics: 1, position: 0`. That
is not just approximately the old burst, it is the same burst.

The burst is also **zero-mean** now, and that fixes a real defect: the loop
filter's taps sum to 1 at every brightness, so a dc offset in the excitation
decayed at exactly the loop gain and outlived every partial. The audible effect
was small, but the decay time was not what it looked like - at 1760 Hz a
`decay` of 1 measured anywhere between 0.36 and 1.02 s depending on the draw,
because what rang last was the residue rather than the string. Notes now decay
as the loop says they should, which at 1760 Hz and the default `brightness`
means **0.33 s rather than the requested 1 s**: `rho` is derived for the loop's
gain at dc, and the damping filter takes its own bite at the fundamental, which
grows with pitch. At `brightness: 1`, where the damping filter is transparent,
`decay` is exact at every pitch. Making it exact at every brightness needs a
loop filter designed per note, which this package does not have yet.
