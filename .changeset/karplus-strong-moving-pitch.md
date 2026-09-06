---
"@synthlet/karplus-strong": minor
---

The pitch can move while the string rings. `frequency` is now `a-rate`, and the
loop length follows it sample by sample.

`frequency` used to be read once, on the rising edge of `trigger`. Changing it
while a note rang did nothing - no glide, no bend, no vibrato, no portamento -
even though the parameter was being read every block, which invited exactly the
opposite assumption. A string whose pitch cannot move is not an instrument
anyone plays.

```ts
const frequency = Param(ac, 220);
const ks = KarplusStrong(ac, { trigger, frequency });

// a bend, while the note rings
frequency.linearRampToValueAtTime(440, ac.currentTime + 0.5);

// or vibrato, by patching an oscillator in
const vibrato = Lfo(ac, { frequency: 5, gain: 12 });
vibrato.connect(ks.frequency);
```

There is no `glide` or `vibrato` parameter and there will not be one: ramping a
param is the caller's job, `@synthlet/param` already does it, and an audio-rate
connection is what makes an `Lfo` work here.

A k-rate parameter steps once per 128-frame block, so the loop length is
interpolated across the block rather than stepped: the sample-to-sample
difference at a block boundary during a slide is the same as it is anywhere
else, which is measured rather than asserted. A slide of one octave in half a
second tracks the requested pitch within 2.1 cents and stays within 0.5 dB of
the same note held still.

Nothing changes for a patch that leaves `frequency` alone: with one value per
block the delay's target never moves, and a static note measures exactly as it
did before.
