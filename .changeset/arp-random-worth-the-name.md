---
"@synthlet/arp": minor
---

Random modes that are worth the name. **`Random`'s output distribution changes**,
which is a behaviour break even though it is the point.

```ts
export enum ArpMode {
  …
  Random = 4, //      uniform, but never the note just played
  RandomOther = 5, // every note once per pass, reshuffled each pass
}
```

The old `Random` picked uniformly with no memory, so it repeated the note it had
just played 1/n of the time — **33 % on a major triad**, which is the input an
arpeggiator is for. Under a fixed envelope a repeated note is a step that did not
happen, so the pattern audibly dropped one step in three. It also failed to cover
its own set: twelve triggers over a seven-note scale sounded all seven notes in
fewer than a quarter of runs.

Both are now zero repeats. `Random` draws until the position differs, which is
what Plaits does; `RandomOther` is a Fisher-Yates bag over the whole sequence,
drained one entry per trigger and reshuffled when empty, which is Ableton's
_Random Other_ — "won't repeat a note until all others are used".

**Which to pick: `Random` wanders, `RandomOther` covers.** `Random` can dwell on
a region of the set, which is what people reach for when they want an
arpeggiator to sound unpredictable. `RandomOther` is a permutation — every pass
is a complete statement of the chord, in a different order each time. They are
not substitutes, which is why both are here.

The bag is a preallocated `Int32Array(120)` — twelve pitch classes over ten
octaves is the largest sequence the parameters can declare — written in place, so
nothing allocates on a trigger. It is reshuffled when `scale` or `octaves`
changes, in the same place the position is clamped, and its first entry is
swapped away from the note just played, because a plain Fisher-Yates repeats
across a pass boundary once every `size` passes.

There is still no `seed` parameter. The problem one was proposed for — a pattern
you liked and cannot get back — is what `RandomOther` answers: every pass is the
whole chord, so there is nothing to recover.
