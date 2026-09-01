---
"synthlet": major
---

**Breaking:** remove `getSynthlet`, the `Synthlet` type, `ConnSerial` and
`ConnMixInto`. Synthlet ships one way to compose, and it is the Web Audio API's:

```ts
// before
const s = getSynthlet(ac);
const synth = s.withParams(s.conn.serial(s.osc.sin(440), s.amp.adsr(gate)), {
  gate,
});

// after
const gate = Param(ac);
const osc = Oscillator(ac, { type: "sine", frequency: 440 });
const amp = AdsrAmp(ac, { gate });
osc.connect(amp);

const synth = Object.assign(disposable(amp, [osc, gate]), {
  gate: gate.input,
});
```

Four rules, now written up as "Composing modules" in the guide: wire with
`connect()`, end in a `Gain`, own what you built with `disposable(out, [...])`,
and expose the inlets with `Object.assign`. `disposable` is exported from every
package since 0.10, and the built-in compounds are written this way.

The deleted operators were documented as "very likely to change" and kept their
state on the AudioContext, so two bundled copies of `synthlet` silently
produced two operator sets. The native wrappers `Gain`, `Oscillator`,
`BiquadFilter` and `ConstantSource` are unaffected.
