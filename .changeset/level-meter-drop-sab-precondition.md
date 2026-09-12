---
"@synthlet/level-meter": minor
---

Stop requiring a cross-origin isolated page. `SharedArrayBuffer` is an upgrade
now, never a precondition.

`new SharedArrayBuffer(...)` was unconditional, so off an isolated page the
factory threw `ReferenceError: SharedArrayBuffer is not defined` before any of
the caller's code ran, with no message that named the cause. **The package's own
documentation site could never be such a page**: `site/next.config.mjs` sets
`output: "export"`, a static GitHub Pages deploy, and static hosting serves no
custom headers — so COOP and COEP cannot be set there under any configuration.
That is why `site/examples/` has a demo component for every mature module and
none for this one. It was not a documentation oversight; it was structurally
impossible.

The transport is now feature-detected and the choice is invisible:

- cross-origin isolated → a `SharedArrayBuffer` the audio thread writes and the
  main thread reads, exactly as before;
- otherwise → the processor owns the buffer and posts a copy of it every
  `postIntervalMs` (default 16, i.e. about one animation frame).

`getLevels()` reads the same view and returns the same numbers either way.
`meter.transport` is `"shared"` or `"message"`, for diagnostics — not something
a UI should branch on. The performance argument for the precondition was ~20
floats at 60 Hz: 4.8 KB/s, against a requirement that excluded the package's own
site. `SharedArrayBuffer` is not removed; deleting it would trade one absolutism
for another.

No `Atomics`. A torn read of one float shows one wrong bar for one frame, which
is invisible to a human watching a meter; atomics belong on a ring-buffer index
if one ever appears, and never `Atomics.wait` on the audio thread.

Both transports carry the same **versioned buffer layout**, defined here and
filled in by the release that adds RMS and the levels accessor:

```
[0]                     layout version (1)
[1]                     channel count
[2]                     flags: clip latch, bit c for channel c
[3 + c*4 + 0..3]        peak, peak hold, rms, true peak
[3 + n*4 + 0..1]        LUFS momentary, LUFS short-term
```

The stride is fixed and the unused slots are reserved rather than appended, so a
page running an older bundle against a newer one fails the version check instead
of reading garbage.

This also unblocks `lookahead-limiter`'s gain-reduction meter, which was
deferred pending this decision.
