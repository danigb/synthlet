---
"synthlet": patch
---

Everything that takes a trigger now agrees on what one is - see the
[Gates and triggers](https://danigb.github.io/synthlet/docs/gates-and-triggers)
page, which is new.

The one call-site change: a drum wired straight to a `Clock` was being fed the
clock's phase ramp, which is not a gate. Use `clock.gate`:

```ts
const clock = Clock(ac, { bpm: 120 });
const kick = KickDrum(ac, { trigger: clock.gate });
```

Drums driven by `Euclid` need no change, and get every hit of a dense pattern
now rather than only the isolated ones.
