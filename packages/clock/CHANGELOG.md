# @synthlet/clock

## 0.2.0

### Minor Changes

- 792d627: `Clock` emits a real gate, and `Euclid` pulses its hits.

  A clock's phase ramp is not a gate. It rises from 0 to 1 over each beat - which
  is what `Euclid` needs, because subdividing a clock means multiplying its phase

  - but as a gate it is positive from the first beat onward and never falls back.
    Under the new `> 0` contract it would fire once and latch. `Clock` now has a
    second output for it:

  ```ts
  const clock = Clock(ac, { bpm: 120 });
  Euclid(ac, { clock }); // the phase ramp, unchanged
  KickDrum(ac, { trigger: clock.gate }); // the gate
  ```

  `clock.gate` is high for `pulseWidth` of each beat (new parameter, default
  `0.5`), and its rising edge lands on the same block the phase output reaches
  `1` - the block the AD has always fired on. The phase output itself is
  untouched.

  `Euclid` gets the same treatment and the same `pulseWidth`: each hit is a pulse
  over the first fraction of its step instead of the step's level held to the next
  step. **This fixes a real bug**: held levels merge adjacent hits, because there
  is no falling edge between them and so no rising edge for the second. A `4/4`
  pattern fired exactly once, ever; `8/5` lost 2 hits of 5 and `8/7` lost 6 of 7.
  Only patterns with no adjacent hits (`16/5`, `16/7`) worked.

  Widths are fractions of a beat or step rather than milliseconds on purpose: a
  render quantum is ~2.9 ms at 44.1 kHz, so a fixed short pulse can fall inside
  one block and be invisible to a k-rate consumer.

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

## 0.1.0

- Initial release
