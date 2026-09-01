---
"@synthlet/ad": patch
---

`AdAmp` now processes every channel of its input instead of only the first: a
stereo signal into it came out with the right channel silent. The envelope
still advances once per sample and is applied to each channel, so a stereo
image (from `Chorus`, say) survives the amplifier.

If you compensated for the missing channel with a `Gain`, the result is now
about 3 dB hot.
