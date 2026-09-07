/**
 * A cutoff in Hz as the normalised, logarithmic control `vaeffects.lib` takes.
 *
 * The library maps it back to Hz itself:
 *
 *     cf = 2 * 10^(3*normFreq + 1)          // 0..1  ->  20 Hz .. 20 kHz
 *
 * so this is that map inverted. Which means the round trip is the identity:
 * `cf` comes back out as the `frequency` that went in, and every circuit's
 * prewarp argument is just the cutoff in Hz - see `prewarp.ts`, which is what
 * the generated `tan(2*PI/SR * 10^(3*normFreq+1))` collapses to.
 *
 * What survives is the *domain*. `ve.diodeLadder` scales its feedback by
 * `17 - 9.7*normFreq^10`, an interpolation designed over 0..1: past 1 the tenth
 * power runs away and flips the sign of the feedback coefficient, and that -
 * not the prewarp - is the term that returned `Infinity` for
 * `frequency: 1000, detune: 127`. So the clamp is the library's own domain, and
 * `diode.ts` is the only caller left.
 *
 * `0.33333334` and the `- 1.0` are how Faust folds `(log10(f/2) - 1) / 3`; they
 * are written the way the codegen writes them so the generated body and this
 * file read the same.
 */
export function normFreq(frequency: number) {
  return Math.max(
    0.0,
    Math.min(1.0, 0.33333334 * (Math.log10(0.5 * frequency) - 1.0)),
  );
}
