---
"@synthlet/virtual-analog-filter": patch
---

Fix the Oberheim models filtering one sample per block.

`oberheim.ts` read `input[0]` inside a loop indexed by `i`, so `OBERHEIM_LPF`,
`OBERHEIM_HPF`, `OBERHEIM_BPF` and `OBERHEIM_BSF` — four of the nine models —
filtered a DC value re-latched once per render quantum. They had never filtered
audio. The Faust Rust reference this was transcribed from reads the current
sample (`dsp/oberheim.rs:165`), and every other circuit in the package reads
`input[i]`.

Measured, `OBERHEIM_LPF` at `frequency: 16000`, resonance 0.2, magnitude in dB:

| probe Hz | 50   | 500   | 2000 | 3000     | 12000    |
| -------- | ---- | ----- | ---- | -------- | -------- |
| before   | −0.3 | −13.1 | −9.4 | **−180** | **−180** |
| after    | −0.0 | 0.5   | 15.5 | −2.3     | −35.1    |

3000 Hz and 12000 Hz are exactly 8 and 32 cycles per 128-sample block, so the
latched sample was zero on every block and the filter was handed silence. The
corrected column is an ordinary resonant lowpass.

The correctness argument for this change is the Rust codegen and the
measurement. `ve.oberheim` traces to Pirkle's _Designing Software Synthesizer
Plug-ins in C++_ §7.2, which is not on disk here, so no source was consulted
for the derivation and none is implied.

Also in the same file: the per-sample four-way branch on `type` is resolved
once at construction, and a `type = type;` transcription residue is gone.
