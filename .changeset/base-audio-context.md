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
---

Factories and registrars accept a `BaseAudioContext`.

`Connector`, `createWorkletConstructor`, `createRegistrar` and every module's
own factory and `register*Worklet` were typed `AudioContext`, and nothing in
this library needs one: a search for `resume`, `suspend`, `baseLatency` and
`outputLatency` across every package finds nothing, and `audioWorklet` is on
`BaseAudioContext` in the spec. The type was a habit, and it made an
`OfflineAudioContext` a compile error.

`AudioContext` is a subtype, so **no call site changes**: every existing use
still compiles and still means the same thing. What is new is that an
`OfflineAudioContext` can now build and render the same graph - the way a host
verifies audio without listening to it.
