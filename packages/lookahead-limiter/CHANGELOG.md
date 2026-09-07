# @synthlet/lookahead-limiter

## 0.2.0

### Minor Changes

- 5aa2d2b: Add `Compound`, for declaring a group of modules that is itself a module:

  ```ts
  function Voice(ac: AudioContext) {
    const gate = Param(ac);
    const volume = Param.db(ac, -12);
    const osc = PolyblepOscillator(ac, { frequency: 440 });
    const amp = AdsrAmp(ac, { gate });
    const out = Gain(ac, { gain: volume });

    osc.connect(amp).connect(out);

    return Compound({
      output: out,
      owns: [osc, amp, gate, volume],
      exposes: { gate: gate.input, volume: volume.input, osc },
    });
  }
  ```

  `owns` is what `dispose()` tears down - anything passed to a factory is already
  owned by the module it was passed to, so it is the list of nodes you connected
  by hand, and listing extras is free. `exposes` is the compound's public
  surface. The result is `CompoundNode<GainNode, { gate: AudioParam; … }>`, also
  exported, so `voice.gate` and `voice.osc` are typed without an annotation.

  `disposable(node, owns?)` is unchanged: it is still the primitive that gives
  any node a cascading `dispose()`, and it is what `Compound` is built on. Use it
  when there is no public surface to declare - `Compound` when there is.

  `ConnectedUnit` (the element type of `owns`) is now exported too.

- 5aa2d2b: Export the module contract from every package: `disposable`, and the types
  `Disposable`, `Connector` and `ParamInput`.

  `Disposable<N>` is what every factory returns - a node with a cascading
  `dispose()` - and until now no package let you name it. `disposable(node, deps)`
  is the primitive behind that cascade: it gives `node` a `dispose()` that
  disconnects it and then disposes each of `deps`. It composes with any `dispose`
  the node already has and is idempotent. Use it to give hand-built graphs the
  same teardown the built-in modules have:

  ```ts
  import { AdsrAmp, disposable, type Disposable } from "@synthlet/adsr";

  const amp = AdsrAmp(ac, { gate });
  const out = new GainNode(ac);
  amp.connect(out);
  const synth: Disposable<GainNode> = disposable(out, [amp]);
  synth.dispose(); // disconnects out, then disposes amp
  ```

  `synthlet` previously exported only `ParamInput`; it now exports all four.

- aae5993: `LookaheadLimiter` is rewritten from scratch as a **true-peak brickwall
  limiter**, and now has parameters:

  ```ts
  const limiter = LookaheadLimiter(ac, {
    threshold: -1, // dBTP ceiling
    release: 168, // ms, 10-90% recovery
    gain: 6, // dB of drive, applied *before* the detector
    lookahead: 2, // ms - construction-time, sizes the delay line
  });

  limiter.threshold.value = -3; // an AudioParam, automatable
  limiter.latencySamples; // 102 at 48 kHz
  ```

  - **`threshold`, `release` and `gain` are real `AudioParam`s.** The package
    previously exposed none: all three were read from `processorOptions` in the
    constructor and fixed for the node's lifetime.
  - **Peaks are measured on a 4× oversampled reconstruction**, so inter-sample
    peaks - a signal that never exceeds full scale sample-by-sample but overshoots
    between samples - are caught. Below the threshold the output is a bit-exact
    copy of the input, delayed by `latencySamples`.
  - **`gain` is a drive, not a makeup gain**: it is applied before both the
    detector and the delay line. A makeup gain after the ceiling is enforced would
    break the guarantee.
  - **`release` is the 10-90% recovery span**, not a time constant.
  - **The node reports `latencySamples` and `latencyTime`** - the lookahead window
    plus the detector's group delay. Web Audio has no automatic delay
    compensation, so a parallel dry path must be delayed by hand.
  - **Output follows its input's channel count** instead of being forced to
    stereo, and one gain drives every channel so the stereo image cannot wander.

  Breaking: `lookahead` moved from `processorOptions` to a construction option,
  and the `thresholdDb` / `lookAheadSeconds` / `releaseSeconds` `processorOptions`
  are gone. The package has never been published, so nobody is passing them.

  The previous implementation cited `DanielRudrich/SimpleCompressor` (GPL-3.0) and
  has been removed in full. The replacement is re-derived from published algorithm
  descriptions - Hämäläinen, DAFx-02 §3.5, and ITU-R BS.1770-4 Annex 2 - with the
  chain recorded in `THIRD-PARTY-LICENSES.md` and in the header of `src/dsp.ts`.

- 5aa2d2b: Every module factory now carries the list of parameters its processor
  registers, as `X.descriptors`:

  ```ts
  import { AdsrEnv, type ParamDescriptor } from "@synthlet/adsr";

  for (const p of AdsrEnv.descriptors) {
    // { name, defaultValue, minValue, maxValue, automationRate }
    slider(p.name, p.minValue, p.maxValue, p.defaultValue);
  }
  ```

  Until now a module's ranges existed only inside the compiled processor string,
  where the main thread could not see them: building a slider meant guessing.
  The list is the same one the processor registers - there is exactly one per
  module now, where before the names were written twice (in the worklet and
  again in the factory) with nothing checking they agreed. `ParamDescriptor` is
  exported from every package, and the native wrappers `Gain`, `Oscillator` and
  `BiquadFilter` in `synthlet` carry `descriptors` too, so a compound author sees
  one shape for every node.

  Two consequences of the single list, both fixes:

  - **`DattorroReverb` exposes `dryWet` and `level`.** The processor has always
    declared and read them; the factory listed neither, so two working
    `AudioParam`s were unreachable. `dryWet` is -1 dry, 0 equal, 1 wet.
  - **`Euclid`'s `subdivision` is spelled correctly.** `EuclidInputs` and
    `EuclidWorkletNode` said `subdivison`, so `Euclid(ac, { subdivison: 4 })` was
    silently ignored and `node.subdivison` was `undefined`. Passing
    `subdivision` now works; the misspelled field is gone.

  No parameter's default, minimum or maximum changed.

### Patch Changes

- 75e8ac9: One spelling for reading an `AudioParam` array: the hoisted `length > 1` check, written
  down next to `ParamDescriptor` in the module contract every package carries.

  The library had three spellings of one rule and none of them written anywhere a package
  author would look. `length === blockLength` is the fragile one: it agrees with `length > 1`
  whenever the block being rendered is a whole render quantum, and is silently wrong the
  moment a DSP renders a **sub-block**. `karplus-strong` splits a block at each trigger edge
  and renders the segments between them, and `virtual-analog-filter` now renders one segment
  per distinct cutoff, so in a 40-sample segment a 128-sample parameter has
  `length !== blockLength` and would be read once and held.

  No behaviour changes in any shipped configuration. The two tests are the shape of the
  argument: `karplus-strong` renders correctly when a trigger edge splits a block and
  `frequency` arrives as a single value, and the same when it arrives per sample.

  `wavetable-oscillator` gains one real improvement from the change. Its stochastic barriers
  were tested for presence rather than substituted with a stand-in, partly because under
  `length === n` a one-element stand-in _was_ a-rate whenever the block was one sample long,
  and the stage would engage on an input nobody supplied. `length > 1` is never true of a
  stand-in, so that hazard is gone.

## 0.1.0

Initial release
