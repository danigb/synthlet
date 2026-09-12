---
"@synthlet/instrument": minor
---

README, docs and the demo.

The README had accreted one paragraph per ticket. It is now written in the order
a reader needs it, and it says the three things that were decisions and would
otherwise be re-litigated by the first issue.

**What the surface is, and where it differs from smplr.** The parity table,
row by row — every smplr 1.0 call against ours, with the reason for each
difference. There are two, and they are the same one: smplr wraps its output in
a channel object with its own methods, and this returns a node, so `volume` is
an `AudioParam` on the output gain rather than a 0–127 setter and there is no
`addEffect`. Under the table, the velocity curve (`(v / 127)²`, from the DLS
spec, so a MIDI keyboard sounds the same in both libraries) and the note-name
rule.

**What eight voices cost.** 56 worklet nodes, plus a `ConstantSourceNode` per
declared parameter — sixteen for `monoVoice` — and a gain per voice. The
automation-rate benchmark measured that pool at ~180 µs per render block, 6.8 %
of one core at 48 kHz, before any DSP runs. It is the honest cost of a design
where every voice is a patchable graph, and it is the sentence that explains why
a native single-worklet synth is still on the roadmap: it takes this same
definition, with the same `params` and the same presets, and changes only
`create`.

**What a voice definition is.** A paragraph per field, the per-note versus
per-instrument distinction, the third kind of parameter that belongs to the
module rather than the voice (`glide`, `hold`, `priority`, `legato`), and the
"keys are the schema" rule that makes an unknown preset key throw and an
out-of-range value clamp.

`package.json` gains the keywords and the description; the homepage already
pointed at the docs page that now exists.

The arpeggiator over the held notes is named as not shipped, with a pointer to
the deferred list, rather than described.
