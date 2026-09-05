---
"@synthlet/wavetable-oscillator": minor
---

`morph` selects a wavetable frame, and `morphFrequency` is gone. **Breaking.**

The only morph control was `morphFrequency`, the speed of a free-running internal
sawtooth phasor. `morphFrequency = 0` pinned the output to plane 0 forever, so
there was no way to choose _which_ frame to sit on — which made this a wavetable
scanner rather than a wavetable oscillator.

```ts
const osc = WavetableOscillator(ac, { morph: 0.5 }); // halfway through the table
osc.morph.value = 1; // the last plane
Lfo(ac, { frequency: 0.05 }).connect(osc.morph); // what morphFrequency used to do
```

`morph` is **a-rate** and normalized to `[0, 1]`: 0 is the first plane, 1 the
last, and everything between crossfades the two planes either side. Normalized
rather than a plane index, so a modulator patched into it does not have to know
how many planes `setHarmonics` or `loadWavetable` produced. a-rate because
scanning a table at audio rate is one of the format's signature sounds and a
k-rate position quantises it to 2.9 ms steps.

Reading the position by indexing is what makes the crossfade correct, not just
convenient. Serra, Rubine & Dannenberg (JAES 38(3) 1990 §1.1) require that "only
one of the two waveforms is changed at any one time, and the change occurs when
the scaling factor associated with the wave table being changed is zero". As the
position crosses an integer, the fraction passes through zero and the plane being
exchanged has a coefficient of exactly zero at that moment — their swap
discipline, obtained by arithmetic rather than by bookkeeping. `Phasor`,
`Trigger` and 45 lines of unreachable trigger-suppression logic left with it.

**Jumps are declicked.** A position that steps — a slider drag, an envelope
segment — and a `setWavetable` / `loadWavetable` during playback both ramp
linearly over 64 samples (1.45 ms at 44.1 kHz) from the last sample emitted onto
the new signal, instead of stepping. Measured: a one-sample 0 → 1 jump between
two planes a full scale apart steps by 0.03125 rather than 2.0, at 2, 4, 8 and 64
planes; loading a table mid-note steps by 0.0116 where it used to step by 0.744.
A position moving faster than half a plane per sample — the plane axis's Nyquist
rate, above which the position is skipping frames rather than crossing them —
counts as a jump; everything slower passes through untouched, which is every
scan rate the two-plane read can represent (11 kHz at two planes, 3.7 kHz at
four).

**What to do:** replace `morphFrequency: f` with `morph` plus an `Lfo`. The one
audible difference is at the loop point — the old phasor ping-ponged its plane
pair, so a wrap was seamless; an external ramp LFO wraps from the last plane back
to the first, which is a real move through the table and is declicked rather than
hidden. A triangle LFO scans back and forth with no wrap at all.
