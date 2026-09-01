---
"synthlet": minor
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

const synth = Compound({
  output: amp,
  owns: [osc, gate],
  exposes: { gate: gate.input },
});
```

Three rules, now written up as "Composing modules" in the guide: wire with
`connect()`, end in a `Gain`, and declare the result with
`Compound({ output, owns, exposes })`. The built-in compounds are written this
way.

This is a breaking change released as a minor: synthlet is pre-1.0, where a
minor is the breaking boundary - `^0.12.0` will not resolve to `0.13.0`. The
1.0.0 version number is reserved for the 1.0 release itself.

The deleted operators were documented as "very likely to change" and kept their
state on the AudioContext, so two bundled copies of `synthlet` silently
produced two operator sets. The native wrappers `Gain`, `Oscillator`,
`BiquadFilter` and `ConstantSource` are unaffected.
