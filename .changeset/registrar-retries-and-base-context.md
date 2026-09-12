---
"@synthlet/ad": patch
"@synthlet/adsr": patch
"@synthlet/analog-delay": patch
"@synthlet/arp": patch
"@synthlet/chorus": patch
"@synthlet/clip-amp": patch
"@synthlet/clock": patch
"@synthlet/dattorro-reverb": patch
"@synthlet/digital-delay": patch
"@synthlet/euclid": patch
"@synthlet/granite": patch
"@synthlet/impulse": patch
"@synthlet/karplus-strong": patch
"@synthlet/level-meter": patch
"@synthlet/lfo": patch
"@synthlet/lookahead-limiter": patch
"@synthlet/noise": patch
"@synthlet/param": patch
"@synthlet/polyblep-oscillator": patch
"@synthlet/reverb-delay": patch
"@synthlet/state-variable-filter": patch
"@synthlet/timestretch-audio-source": patch
"@synthlet/virtual-analog-filter": patch
"@synthlet/wavetable-oscillator": patch
"synthlet": patch
---

The worklet registrar no longer caches a failure, and accepts any
`BaseAudioContext`.

`createRegistrar` stores its `addModule` promise on the context before it
settles, so that concurrent callers share one registration. It stored the
_rejection_ too: a Content-Security-Policy that blocks `blob:` scripts, a
context that was closed, a dev-server hiccup — and every later
`register*Worklet(ctx)` on that context returned the same failure forever, with
no way to retry.

That was tolerable while registration was an explicit call a developer could
watch fail. It stops being tolerable the moment registration is implicit, as it
now is behind `LevelMeter.tap(source)`, where a cached failure is invisible. The
promise is dropped from the cache on rejection, so the next call tries again; a
success is still cached exactly as before.

The context parameter widens from `AudioContext` to `BaseAudioContext`.
`audioWorklet` is declared on the base, an `OfflineAudioContext` registers the
same way, and a module that takes its context from a node it was handed — a tap
reading `source.context` — only has the base type to give. A widening, so every
existing call still compiles.

No other behaviour changes, and no API is added or removed.
