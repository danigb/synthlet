---
"@synthlet/noise": patch
---

Stop warning on an unrecognised `type`. Because `type` is an AudioParam, a
modulated value could log from the audio render path on every block. Unknown
values still fall back to white noise.
