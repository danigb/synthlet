---
"@synthlet/instrument": minor
---

New package: the allocator and the note stack.

Nothing in the library assigns a note to a voice — `MonoSynth` has one `gate`
and cannot sound two notes. `@synthlet/instrument` is the module that makes an
instrument out of a voice definition, and this is the piece it is built on:
which voice plays a note, and which note a monophonic instrument sounds.

```ts
import {
  createVoiceAllocator,
  createNoteStack,
  NotePriority,
} from "@synthlet/instrument";

const voices = createVoiceAllocator(8);
voices.noteOn(60); // { index: 0, reused: false, stolen: false }

const held = createNoteStack();
held.push(60, 100);
held.push(64, 100);
held.top(NotePriority.Low); // { note: 60, velocity: 100 }
```

`createVoiceAllocator` follows stmlib's three ordered rules — reuse the voice
already sounding this note, else the voice released longest ago, else steal —
with four steal modes. The default, `Protect`, is JUCE's rule: the lowest and
the highest sounding notes survive a dense chord and the oldest of the rest is
taken. An allocation reports what a steal cost, because the pool has to fade
the losing voice before it writes the new note and cannot know what to fade
unless it is told.

`createNoteStack` keeps the held keys in press order and in pitch order at
once, which is what the four mono priorities of _Synth Secrets_ Part 18 read,
and what an arpeggiator will read after them. Overflow evicts the least
recently played note — the Juno-60 rule.

Both are pure: no imports, no nodes, no clock, and no allocation in the hot
path, so `scripts/_voices.ts` can be copied into a native poly worklet one day
and run on the audio thread unchanged. The playable `Instrument` surface is
next; nothing user-facing sounds yet.
