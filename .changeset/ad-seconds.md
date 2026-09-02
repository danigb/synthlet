---
"@synthlet/ad": minor
---

`attack` and `decay` are now seconds, the same seconds `@synthlet/adsr` uses.
**This changes the sound of every patch that uses the AD.**

They were labelled seconds but converted with two empirical factors
(`tau = attack x 0.05`, `tau = decay x 0.1`), so `AdEnv({ attack: 1 })` was
audibly over in 150 ms where `AdsrEnv({ attack: 1 })` takes a full second - and
`attack` was not even proportional to the time it produced, because the stage
ended when the per-sample increment fell below a fixed epsilon.

Now `attack` is the time to reach the peak and `decay` the time to fall to
silence (-60 dB), both exact and both linear in the parameter:

```ts
AdEnv(ac, { attack: 0.5, decay: 2 }); // peaks at 0.5 s, silent 2 s later
```

To keep an existing patch sounding as it does, convert your numbers:

```ts
attack * 0.05 * Math.log(100); // 0.2303
decay * 0.1 * Math.log(1000); // 0.6908
```

Those factors preserve the envelope's time constants exactly - the rise is
identical sample for sample, and the decay ends at the same moment. The one
difference is at the top of the attack: the old stage kept crawling from 0.99
toward 1.0 for another 0.6-8 ms before the decay started, and that plateau is
gone.
