# @synthlet/impulse

> A single-sample impulse on every trigger, as an audio worklet

Part of [Synthlet](https://github.com/danigb/synthlet).

One parameter, one job: on each rising edge of `trigger` it writes a single
sample of `1` and is silent everywhere else. A gate turned into an event — the
excitation for a resonator, a click track, or the ping that starts a
`@synthlet/karplus-strong` string.

## Install

```bash
npm i @synthlet/impulse
```

Or `npm i synthlet` for every module at once.

## Usage

```ts
import { registerImpulseWorklet, Impulse } from "@synthlet/impulse";

const ac = new AudioContext();
await registerImpulseWorklet(ac);

const impulse = Impulse(ac, { trigger: clock.gate });
impulse.connect(ac.destination);
```

## Parameters

| Param     | Default | Range | Rate   | Meaning                       |
| --------- | ------- | ----- | ------ | ----------------------------- |
| `trigger` | 0       | 0 … 1 | a-rate | Rising edge emits one impulse |

`trigger` is `a-rate`, and here that changes what is _detectable_: at k-rate
the processor read one sample per block, so a pulse that rose **and** fell
inside a render quantum produced no impulse at all — not a late one, none. It
now fires, and a trigger arriving mid-block is seen in that block.

**The impulse is still written at index 0 of the block.** That is deliberate:
the spec samples a k-rate `AudioParam` at the first sample-frame of each
quantum, so an impulse written anywhere else would be invisible to a native
`AudioParam` a caller left k-rate. What stopped being quantised is the
detection, not the placement — so two rising edges inside one block still yield
one impulse.

## License

MIT © [Daniel Gómez Blasco](https://github.com/danigb)
