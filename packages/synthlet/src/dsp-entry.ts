/**
 * `synthlet/dsp` - the library's pure DSP, without a single Web Audio node.
 *
 * Everything here takes a sample rate and typed arrays and gives numbers back,
 * so it runs in node, in a worker and in a test. That is what makes offline
 * analysis possible at all: `analyze()` over a rendered buffer reports the same
 * peak, true peak and loudness the realtime meter would have shown, because it
 * is the same code rather than a second implementation of it.
 *
 * The subpath exists so an offline-only consumer does not pull twenty-three
 * minified worklet strings into their bundle for the sake of one function -
 * `packages/synthlet/src/dsp.test.ts` asserts that, rather than trusting it.
 */
export * from "@synthlet/level-meter/dsp";
export * from "@synthlet/lookahead-limiter/dsp";
