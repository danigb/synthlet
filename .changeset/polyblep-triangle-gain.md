---
"@synthlet/polyblep-oscillator": patch
---

Fix the triangle and make the oscillator total over its declared parameter range.

**The triangle's integrator gain was dimensionally inverted.** It read `4 / frequency`
where an integrated square needs `4 * increment`, so the triangle's amplitude was off by
`sampleRate / frequency²` — 17.7 at 20 Hz, 0.178 at 440 Hz, 0.0006 at 7 kHz, against a
nominal 1.0 — and it used the pre-detune frequency, so `detune` changed the pitch but not
the compensating gain. The triangle now peaks at 0.978 at 440 Hz. **This is a large,
audible amplitude change**: a patched triangle will be much louder above ~250 Hz and
quieter below it. The residual low-end roll-off (0.20 at 20 Hz, 0.80 at 110 Hz) is the DC
blocker and is not addressed here.

**`frequency = 0` no longer kills the node.** `4 / 0` was `Infinity`, which drove the
accumulator to `-Infinity` and the output to `NaN` — permanently, for the life of the
node. Because `connectParams` sets an `AudioParam` to 0 before connecting a node to it,
every `MonoSynth` hit this on its first render quantum. Zero frequency now simply holds.

Also: the phase wraps with `floor` so it survives an increment of 1 or more, the
increment is clamped to 0.25 cycles/sample so `polyblep()`'s two branches cannot overlap,
a fractional `type` selects the nearest waveform instead of falling back to a sawtooth,
the integrator state resets when the waveform changes, and the square no longer emits an
occasional `-2` sample caused by a rounding disagreement in its half-cycle phase
(reachable at 2205 Hz at a 44.1 kHz sample rate).
