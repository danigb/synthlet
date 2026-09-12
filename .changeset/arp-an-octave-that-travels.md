---
"@synthlet/arp": minor
---

`octaveMode`: how the octave travels. Additive — the default is what the module
already did.

```ts
export enum ArpOctaveMode {
  Serial = 0, // the whole set, then up an octave
  Repeat = 1, // each note in every octave, then the next note
}
```

A minor triad over three octaves, `mode: Up`:

| `octaveMode` | plays                          |
| ------------ | ------------------------------ |
| `Serial`     | 60 63 67 · 72 75 79 · 84 87 91 |
| `Repeat`     | 60 72 84 · 63 75 87 · 67 79 91 |

Same chord, same direction, same `octaves: 3` — three stacked arpeggios, or a
rising sequence of octave leaps on each chord tone. `octaves` used to say how far
the pattern reached and nothing said how it got there; every product in the
survey behind this module hardcodes `Serial`, Mutable included, and u-he's Hive
is the only one that exposes the choice.

Six modes × two octave modes is **twelve traversals** from two small enums, and
both are `AudioParam`s, so either can be modulated.

It costs one branch per trigger, because the traversal walks a flat index and
the octave lives in the mapping rather than in the wrap logic: `Serial` is
note-fast and `Repeat` is octave-fast, they are transposes of the same
`len × octaves` rectangle, and the advance does not know the parameter exists.
That is asserted rather than assumed — a full cycle of either visits every
(note, octave) pair exactly once, over all 120 combinations.

**Inert at `octaves: 1`**, where the two mappings agree.

Two of Hive's four orders are deliberately absent. `leap` only enumerates the
full rectangle when the set size and the octave count are coprime — at 3 × 3 it
collapses to a 3-step cycle covering 3 of 9 pairs, and a mode that silently plays
a third of the notes you asked for is worse than no mode. `round` needs the
octave axis to carry its own sequence rather than a positional mapping, and it is
close to what `UpDownExclusive` already does at the whole-range level.
