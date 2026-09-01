---
"@synthlet/state-variable-filter": patch
---

`Svf` now filters every channel of its input instead of only the first: a
stereo signal into it came out with the right channel silent. Each channel
gets its own filter state, so a hard-panned signal stays panned rather than
ringing out of the other channel.

If you compensated for the missing channel with a `Gain`, the result is now
about 3 dB hot.
