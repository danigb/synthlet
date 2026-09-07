/**
 * A cutoff in Hz as the normalised, logarithmic control every `vaeffects.lib`
 * filter actually takes.
 *
 * The library maps its `normFreq` argument back to Hz itself:
 *
 *     cf = 2 * 10^(3*normFreq + 1)          // 0..1  ->  20 Hz .. 20 kHz
 *
 * so this is that map inverted, and `cf` comes back out as the `frequency`
 * that went in, at any sample rate. `0.33333334` and the `- 1.0` are how Faust
 * folds `(log10(f/2) - 1) / 3`; they are written here the way the codegen
 * writes them so the generated bodies and this file read the same.
 *
 * The clamp is the library's own domain, not a safety net: `normFreq` outside
 * 0..1 is outside 20 Hz..20 kHz, which is the declared range of the
 * `frequency` parameter. It bounds `detune`'s +/-127 semitones too - see
 * ticket 04, which replaces this hard breakpoint with a continuous prewarp
 * because a discontinuity in dg/df is audible when a cutoff is swept through
 * it.
 */
export function normFreq(frequency: number) {
  return Math.max(
    0.0,
    Math.min(1.0, 0.33333334 * (Math.log10(0.5 * frequency) - 1.0)),
  );
}
