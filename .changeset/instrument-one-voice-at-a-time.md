---
"@synthlet/instrument": minor
---

Mono: note priority, legato, glide and hold.

`voices: 1` was a pool of one, and that is not a monosynth. Play two keys and
the second stole the first — always, whatever the pitch or the order — and
releasing the second left silence rather than returning to the first, because a
pool has no memory of what else is held.

```ts
const lead = Instrument(ac, junoVoice, {
  voices: 1,
  priority: NotePriority.Low, // Last (default) | Low | High | First
  legato: true, // leave the envelopes running between notes
  glide: 0.08, // portamento, in seconds
});

lead.hold = true; // the sustain pedal: note-offs are remembered
lead.glide = 0.2; // live-settable, at any voice count
```

`voices: 1` now routes through the note stack instead of the allocator, so the
four priorities of _Synth Secrets_ Part 18 work as the article describes them —
including that on a line which changes direction all four differ and two of them
play only three of the four notes. The algorithm lives in `src/mono.ts` as pure
functions returning write descriptors, with no Web Audio in sight, so the
article's tables are asserted as data before they reach a node.

`legato` is the article's other axis, single versus multi triggering, which on
the gate contract is one decision: `false` (the default) dips the gate for one
sample on every note change, `true` leaves it high while any key is held.

`glide` is portamento in seconds and works at any voice count — an exponential
ramp in Hz is a linear ramp in pitch, so it needs no DSP. It is per voice, from
that voice's own last note, which is what a hardware poly with a portamento knob
does; a stolen voice glides from the note it was stolen from. Constant-time, not
constant-rate: a semitone and two octaves both take `glide` seconds.

`synth.hold` is the sustain pedal — a name rather than smplr's `setCC(64, on)`.
A key release under the pedal is remembered and applied when it lifts; pressing
the key again cancels the deferral; and the all-notes `stop()` ignores the pedal
entirely, because a panic is a panic.
