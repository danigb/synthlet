# @synthlet/state-variable-filter

## 0.3.0

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

- 5aa2d2b: Fix parameter ranges. Now that `X.descriptors` is public, every `minValue` and
  `maxValue` is a hint to whoever builds a UI, and several were wrong.

  **Enum-typed parameters no longer advertise values their enum doesn't have.**
  A slider built from `Lfo.type`'s range offered 0…100 for an 11-member enum.
  Each maximum is now the enum's highest member: `Noise.type` 1, `Lfo.type` 10,
  `ClipAmp.type` 1, `Svf.type` 6, `Param.scale` 3. Values above those were never
  valid enum members - the processors already fell back to the first type - so
  this only stops you setting a number that did nothing.

  **`PolyblepOscillator`'s `detune` is bipolar**: `-1200…1200` cents (±1 octave),
  where it was `0…10000`. Detuning _down_ was impossible: the `AudioParam`
  clamped every negative value to 0, so an LFO patched into `detune` produced an
  upward-only half-wave instead of vibrato. **Breaking** if you set a detune
  above 1200 cents; use `frequency` for intervals wider than an octave.

  **`AdEnv`/`AdAmp` and `AdsrEnv`/`AdsrAmp` share one range for `gain` and
  `offset`**, both `-20000…20000`. The two packages compute the same
  `value * gain + offset` and disagreed on its bounds: `AdEnv` could not invert
  an envelope (`gain` was `0…10000`) and neither could offset one downwards.
  Both are widenings.

  **`AdsrEnv`/`AdsrAmp`'s `release` maximum is 10 seconds**, matching `attack`
  and `decay`, where it was 100. **Breaking** for a release longer than 10 s.

  **`Arp`'s `baseNote` maximum is 127**, the MIDI note range, where it was 200.

  `Param`'s `input`, `offset`, `min`, `max`, `gain` and `mod` keep `±20000`: a
  `Param` carries whatever value its destination needs and has no natural range.
  Its README now says so.

- 4caf430: Fix `SvfType.AllPass`: a missing `break` made it fall through to the bypass coefficients, so all-pass mode passed the input unchanged. It now has unit gain with a 180° phase shift at the cutoff frequency.
- 792d627: `Svf` now filters every channel of its input instead of only the first: a
  stereo signal into it came out with the right channel silent. Each channel
  gets its own filter state, so a hard-panned signal stays panned rather than
  ringing out of the other channel.

  If you compensated for the missing channel with a `Gain`, the result is now
  about 3 dB hot.

## 0.2.0

- State Variable Filter improvements:

- It uses a better algorithm (by Andrew Simper and Freq Anton Corvest)
- `frequency` is now a a-rate parameter suitable for modulation
- Renamed `resonance` to `Q` to match Web Audio API standard

## 0.1.0

- Initial release

## 0.1.0

- Initial implementation
