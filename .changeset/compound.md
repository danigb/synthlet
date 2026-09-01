---
"@synthlet/ad": minor
"@synthlet/adsr": minor
"@synthlet/arp": minor
"@synthlet/chorus": minor
"@synthlet/clip-amp": minor
"@synthlet/clock": minor
"@synthlet/dattorro-reverb": minor
"@synthlet/euclid": minor
"@synthlet/granite": minor
"@synthlet/impulse": minor
"@synthlet/karplus-strong": minor
"@synthlet/level-meter": minor
"@synthlet/lfo": minor
"@synthlet/lookahead-limiter": minor
"@synthlet/noise": minor
"@synthlet/param": minor
"@synthlet/polyblep-oscillator": minor
"@synthlet/reverb-delay": minor
"@synthlet/state-variable-filter": minor
"@synthlet/virtual-analog-filter": minor
"@synthlet/wavetable-oscillator": minor
"synthlet": minor
---

Add `Compound`, for declaring a group of modules that is itself a module:

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
