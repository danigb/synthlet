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

`disposable` takes a third argument: the properties the compound exposes.

```ts
// before
return Object.assign(disposable(out, [osc, filter, volume]), {
  osc,
  filter,
  volume: volume.input,
});

// after
return disposable(out, [osc, filter, volume], {
  osc,
  filter,
  volume: volume.input,
});
```

Building a compound is now one call instead of two nested ones: own what you
built, publish what you expose. The returned type is `Disposable<N> & E`, so
`synth.volume` and `synth.osc` are typed exactly as before.

The two-argument form is unchanged, and so is everything else: `disposable`
still composes with any `dispose` the node already has and is still idempotent.
The exposed properties are merged before `dispose`, so a stray `dispose` key
cannot replace the teardown cascade.
