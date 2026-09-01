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

Export the module contract from every package: `disposable`, and the types
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
