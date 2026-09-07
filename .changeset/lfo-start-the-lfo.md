---
"@synthlet/lfo": minor
---

Start the LFO: an a-rate `sync` param and a `phase` construction option.

Every `Lfo` in an `AudioContext` free-ran from context time zero, so two at the
same rate were the _same signal_ forever, a note-on could not restart a vibrato,
and there was no wire from a `Clock` to an LFO at all.

- **`sync`**, a-rate, `[0, 1]`. A rising edge — non-positive to positive,
  synthlet's one gate contract — restarts the phase at `phase`. Held high it
  fires once. Unconnected it is 0, so **every existing patch is bit-identical**.
- **`phase`**, a construction option taking a number or `"random"`, following
  both oscillators: it is a one-time initial condition, so it is not an
  `AudioParam`. `"random"` draws once per instance, which is what makes two
  0.3 Hz LFOs independent without detuning either.
- **`frequency` is now `[-200, 200]`.** A negative rate runs the phase
  backwards — the reverse ramp — and `frequency: 0` freezes the LFO on the value
  at `phase`.

Tempo sync is `clock.gate` into `lfo.sync`, and that is the whole mechanism:
there is no `bpm` parameter and no division enum, because a division is
`frequency` relative to a tempo the caller already knows.

The reset lands on the sample the edge was detected on. Unlike the two
oscillators this package does not interpolate the sub-sample crossing instant —
2.9 ms is nothing against a 5 Hz cycle.
