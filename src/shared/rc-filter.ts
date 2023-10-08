/**
 * RcFilter is the digital version of a RC Filter.
 *
 * A RC Filter is a circuit composed of a resistor and a capacitor and has exponential
 * voltage change when subjected to sudden voltage changes.
 *
 * It's a simple low-pass filter.
 *
 * @see https://en.wikipedia.org/wiki/RC_circuit
 * @param sampleRate
 */
export function RcFilter(sampleRate: number) {
  let $yn = 0;
  let $yn1 = 0;
  let $a = 0;

  return {
    setTau(tau: number) {
      $a = tau / (tau + sampleRate);
    },
    setCutoff(fc: number) {
      $a = 1 - fc / sampleRate;
    },
    process(x: number) {
      $yn = $a * $yn1 + (1 - $a) * x;
      $yn1 = $yn;
      return $yn;
    },
  };
}
