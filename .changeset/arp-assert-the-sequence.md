---
"@synthlet/arp": patch
---

`createArpeggiator` takes its source of randomness as an argument.

```ts
export function createArpeggiator(random: () => number = Math.random);
```

That is the whole of the shipped change: the worklet never passes an argument,
so the module behaves exactly as it did. There is no `seed` parameter and there
will not be one — an `AudioParam` carrying an integer nobody can interpret would
be the only parameter in the library with no musical meaning.

What it buys is that the package can now assert a _sequence_ instead of a
distribution. Every test in it was previously written around `Math.random`: one
looped forty times because "two random notes can repeat", another collected a
`Set` over 400 cycles and could only assert membership. The next four tickets
give the module an order, and none of them could have been proved right.

Alongside it, `dsp.test.ts` records what a memoryless pick costs, as a baseline
to be broken rather than a contract to keep: 33 % of steps on a major triad
repeat the previous note, 20 % on a pentatonic minor, 14 % on a major scale, and
twelve triggers over a seven-note scale fail to sound all seven in 77 % of runs.
Two more tests record that at the declared parameter maxima the module emits
MIDI 246 — 12.1 MHz — with 92 % of its steps above Nyquist.

`benchmarks/arp-rate/` measures both of `worklet.ts`'s paths, so the three
tickets that add state to the engine can show what they cost. Today: 0.03 µs per
block k-rate, 0.79 µs a-rate — three hundredths of one per cent of a block.
