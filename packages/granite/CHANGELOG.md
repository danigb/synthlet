# @synthlet/granite

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

- de70c97: The engine is rewritten. granite was a stutter effect wearing a granular name —
  four parameters, no grain duration, no pitch, no freeze, a 16-slot pool of fixed
  200 ms buffers, and a phasor advanced once per render quantum, so at most one
  grain could start per 128 samples. It is now a granular **delay**: a
  tapped-delay-line granulator over `scripts/_delay.ts`, the third delay in the
  library alongside `digital-delay` and `analog-delay`, split from them on what the
  read head does.

  ### Breaking Changes
  - **`speed`, `density` and `spread` are removed.** Nothing maps onto them.
    `speed` and `density` conflated the emission rate with the grain length, which
    are now the two independent parameters `rate` (0–2000 grains/s, against an old
    structural ceiling of 30) and `duration` (1–1000 ms, against a hard-coded 200).
    `spread` was a smear of the read position and is now three separate controls:
    `position`, `spray` and `panSpread`.
  - **`wet` now defaults to 1**, where it defaulted to 0.5, so the module's own
    sound is what you hear first. 0 is an exact bypass, sample for sample.
  - **No existing patch reproduces, and there is no compatibility mode.** This is
    not a conservative rewrite that kept the sound: the old module's defining
    characteristics were defects. Its Hann window was normalised by `length/sum`,
    which is ×2, so every grain was +6 dB before sixteen of them overlap-added; its
    per-grain high-pass state was never reset, so grain _n_'s tail leaked into
    grain _n+16_; and playback picked a random slot from the pool that might hold
    silence or arbitrarily stale audio. There is nothing there to preserve.

  ### Minor Changes
  - **Eighteen parameters**, every one an `AudioParam` and every one k-rate. The
    new ones are `duration`, `durationSpread`, `position`, `spray`, `pitch`
    (±24 semitones), `pitchSpread`, `reverse`, `shape`, `pan`, `panSpread`,
    `level`, `levelSpread`, `jitter`, `intermittency`, `freeze` and `feedback`.
  - **Truax's `(centre, spread)` control model.** Every per-grain quantity is a
    pair, drawn once at the grain's activation and never re-read. Every spread
    defaults to 0, where the module is deterministic and bit-identical to the
    module without that feature in it.
  - **A real scheduler and a real pool.** A per-sample interonset counter sustains
    the full 2,000 grains/s, against a previous structural ceiling of
    `sampleRate/128`. 64 preallocated grains, a free-list, and a documented
    overflow policy: no free grain, no grain — never steal one that is playing.
  - **`freeze` stops the write head**, so the last few seconds become a playable
    object, with a 100-sample raised-cosine fade on the release so the splice does
    not click.
  - **`feedback` up to 0.95**, through a `tanh` saturator blended in by the setting
    and a one-pole high-pass whose corner rises with it. With `pitch` up it stacks
    transpositions.
  - **Three construction options**: `maxGrains` (64), `bufferSeconds` (4) and
    `seed` (`0x9e3779b9`). Two nodes given the same seed produce the same cloud.
  - **The first tests this package has had** — 70 of them, every threshold from a
    ticket's Success Criterion with the measured value beside it, and the three
    that could not be met as written recorded with their reason. See the README's
    "Measured quality".
  - **Attribution.** `THIRD-PARTY-LICENSES.md` now records what this engine drew on
    — Bencina 2001, Truax 1986/1988/1994, Roads 2001 and Roads et al. 2021, and
    Mutable Instruments Clouds read as a worked example and re-derived. No
    third-party source was copied.

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

# 0.1.0

Initial release
