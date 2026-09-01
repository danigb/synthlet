---
"@synthlet/level-meter": minor
---

Remove `getRms()`. It allocated and shared a buffer the processor never wrote,
so it returned an all-zero `Float32Array` forever. Use `getPeaks()`. Whether the
meter keeps `SharedArrayBuffer` at all is still open.

Also removes the debug logging that ran in the constructor and on the first
render block.
