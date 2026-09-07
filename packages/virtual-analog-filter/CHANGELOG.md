# @synthlet/virtual-analog-filter

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

- 75e8ac9: **`frequency`, `detune` and `resonance` are now `a-rate`**, so an envelope or an LFO on
  the cutoff produces a smooth sweep instead of a 344 Hz staircase.

  Filter cutoff is the canonical modulation target in subtractive synthesis. This library
  has two filters and they gave opposite answers: `state-variable-filter` has declared its
  cutoff a-rate from the start, so `MonoSynth` gets a smooth sweep through `Svf` — and the
  same patch built on `VirtualAnalogFilter` got one cutoff value per render quantum. There
  was no stated reason for the difference, and no cost reason either: with a node connected,
  the modulator is rendered and summed whether or not the samples are read.

  A 200 Hz modulator is now filter FM rather than aliasing. At one value per 128 samples the
  cutoff was sampled at 344.5 Hz, so anything above 172 Hz folded — a 200 Hz modulator
  arrived as 144 Hz.

  **Unautomated patches cost nothing extra, and slightly less.** The nine models compute
  their coefficients — a `Math.tan`, and in the Korg 35 a `Math.pow` too — at the top of
  `process()`, so the filter renders the block in _runs of constant coefficients_: one run
  whenever nothing is automated, which is exactly what it did before, and change detection
  now skips even the coefficient recompute when the values have not moved. A genuinely
  per-sample sweep is 128 runs, which is the per-sample recompute the smooth sweep needs.

  Each channel keeps its own change-detection state alongside its own filter bank, so a
  stereo sweep updates both channels rather than only the first.

  Internal: `Filter.process` takes a `from`/`to` range, so rendering a run needs no
  `subarray` and allocates nothing on the audio thread. The generated Faust bodies are
  otherwise untouched — the loop bounds are the whole edit.

  `type` stays `k-rate`. It is an index into a bank of nine circuits, and switching it
  mid-block is a discontinuity rather than a feature.

### Patch Changes

- 4caf430: Remove a `console.log` that fired in the audio render path on every filter-type
  change.
- 792d627: `VirtualAnalogFilter` now filters every channel of its input instead of only
  the first: a stereo signal into it came out with the right channel silent.
  Each channel gets its own bank of filters, so a hard-panned signal stays
  panned rather than ringing out of the other channel.

  If you compensated for the missing channel with a `Gain`, the result is now
  about 3 dB hot.

- 75e8ac9: Read `type` as `params.type[0]` rather than as the whole `Float32Array`.

  `Math.floor(params.type)` has been in this processor since it was written, and it has
  always produced the right answer: `Math.floor` coerces its argument, a `Float32Array`
  stringifies through `Array.prototype.join`, and a length-1 array stringifies to its single
  value. `type` is `k-rate`, so the array is always length 1.

  Correct by accident. Hand this parameter more than one value and it stringifies to
  `"3,3,3"`, `Number("3,3,3")` is `NaN`, and `bank[NaN] || bank[0]` selects the Moog ladder
  for every type — with no error, no warning, and audio that still sounds like a filter. No
  behaviour changes today; the filter stops being one line away from a silent bug.

## 0.1.0

### Minor Changes

- 87892ad: New `@syntlet/virtual-analog-filter` module
