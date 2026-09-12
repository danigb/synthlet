---
"@synthlet/slew-limiter": minor
"@synthlet/envelope-follower": patch
"synthlet": minor
---

`SlewLimiter`: rate-limit a control signal. Portamento, and the smoother the
book puts after both the S&H and the envelope follower.

```ts
const glide = SlewLimiter(ac, { rise: 0.2, fall: 0.2 });
pitchInCents.connect(glide).connect(osc.detune);
```

Synthlet had no portamento and no way to smooth a control signal at all.
`setTargetAtTime` is host-side automation on a single `AudioParam`: it cannot be
put in the middle of a signal path, and it cannot smooth a signal arriving from
another node.

**Both laws ship, and they are different modules wearing one name.**

| `type`        | `rise` / `fall` mean                | A step arrives?          |
| ------------- | ----------------------------------- | ------------------------ |
| `Exponential` | seconds to cover **99 % of a step** | asymptotically           |
| `Linear`      | seconds **per unit** of the signal  | exactly, at a known time |

Two meanings for one parameter is a real wart and a deliberate one: a rate
limiter has no notion of a step, so there is no honest step time to give it, and
a second parameter that is inert in the other mode would be worse.

**Exponential is the default**, for a reason about units rather than taste: a
linear rate is per unit of the signal, so 1 unit/second is a lifetime on a
`[0,1]` CV and imperceptible on a frequency in hertz. A proportional move takes
the same time whatever the step and whatever the unit.

`rise` and `fall` are separate, so an S&H staircase through `rise: 0.5,
fall: 0.01` gets Part 16's shark's tooth. Both at zero is a **bit-exact
bypass**, asserted through a full-scale square wave.

**Linear reaches exactly zero**, so a gate through one still closes — the one
safe way to slew a gate line, and the test drives `createGateDetector` over the
output to prove it. There is deliberately no matching assertion for exponential:
that is the documented warning, not a supported use.

**The pitch caveat**, in the README and on the docs page: synthlet's
frequencies are in hertz, so a slew on one glides evenly in Hz and a fifth
downward takes longer than a fifth upward. Slew a `detune` in cents instead,
which is what the example does.

---

**The extract-or-copy decision, made here with two instances in hand.**
`scripts/_smooth.ts` now exists, holding one function and one constant: the
coefficient of a one-pole covering 99 % of a step, and `ln(100)`. It is copied
into `@synthlet/slew-limiter` and `@synthlet/envelope-follower`, added to
`copy_files.sh`, and asserted in `worklet-copies.test.ts`.

What is shared is not "a one-pole" — it is the library's **definition of a time
in seconds**. If the two files drifted, `0.1` would mean 99 % of a step in one
module and something else in the one next to it, and a caller moving a setting
between them would get a different move with no error and no clue why.

`karplus-strong` declined `_delay.ts` because adopting it would have changed its
behaviour. Nothing changed here: `envelope-follower`'s `followerCoefficient` was
renamed to `smoothCoefficient` and its body left alone — its twenty tests pass
untouched, which is this changeset's patch bump.

Not shared, deliberately: the direction choice, the follower's rectifier and RMS
stage, the linear branch, and `adsr`'s TCO machinery. `adsr` and `ad` are not
retrofitted, so the file covers two of the library's four smoothers.
