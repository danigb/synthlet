---
"@synthlet/polyblep-oscillator": minor
---

`frequency` goes bipolar: through-zero FM.

The declared range is now `-20000…20000` Hz, the increment clamps to
`[-0.25, 0.25]`, and a negative frequency **runs the phase backwards**. A
modulator connected to `frequency` is no longer half-wave rectified at the
bottom — and rectifying it did not merely limit the sound, it produced a
different, wrong spectrum, because a rectified modulator is not the modulator
that was patched. `AudioParam` sums its inputs with the intrinsic value, so
connecting a node to `frequency` is _linear_ FM by construction, which is the FM
that has a through-zero behaviour worth having.

**A backward wrap is band-limited.** The discontinuity scheduler does not care
which direction a boundary was crossed from: it takes an age and a signed
height, so a backward crossing is the same call to the same primitive with its
signed quantities negated. Measured alias SNR at a negative frequency equals the
positive figure **to the decimal** in every cell of the existing table — the
sawtooth 45.5 / 42.3 / 40.1 / 34.5 / 26.8 dB and the square 46.8 / 43.2 / 45.1 /
43.8 / 26.6 dB at 440 / 1000 / 2000 / 4000 / 8000 Hz — and peaks match to four
decimals. The tests assert the negative side against the _same_ floors and
bounds the positive side promises rather than against a second table.

**The mirror identities hold.** The sine at `-f` is the negation of the sine at
`+f` to 2.1e-13, the sawtooth and square to 3.0e-8 and 3.3e-12, and the
symmetric triangle at `-f` equals the triangle at `+f` **exactly** — zero
difference, not a tolerance — because at `width = 0.5` its naive function is
even about phase 0 and both of its corners keep their sign under time reversal.

**Through zero stays in range.** A linear sweep from +2000 to -2000 Hz across a
block and an audio-rate `200 + 3000·sin(2π·220·t)` — 440 sign changes a second —
both peak at exactly 1.0000 for every waveform and width, with no first
difference larger than the square's own edge. `frequency = 0` still holds, and
so does `-0`.

**Nothing that does not use a negative frequency changes.** A positive-frequency
render is bit-for-bit what the previous version produced, verified across 452
fingerprinted renders covering every waveform, seventeen frequencies, five
widths, the cold degenerate grid and a-rate `frequency` and `width` arrays.
