---
"@synthlet/adsr": patch
---

Rewrite the package README. It documented `createVca`/`createAdsr`,
`gateOn`/`gateOff` and `audioContext.now` — none of which the package has ever
exported — gave the times in milliseconds instead of seconds, and printed
mangled parameter ranges. It now documents `AdsrEnv` and `AdsrAmp`, the `gate`
parameter, the real defaults and ranges, legato retrigger and instant sustain
changes. No code change.
