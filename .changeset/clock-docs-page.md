---
"@synthlet/clock": patch
---

Rewrite the README and the docs page against the finished module.

Six tickets each updated the docs for their own change, which kept the package
from being described wrongly but did not produce a page that describes it well.
The README is now What it is / Usage / Outputs / Parameters / Timing / Sync, with
an outputs table, the measured timing figures and the test that holds each one,
and an answer to "how do I make two patterns start together?".

Corrects three sentences the incremental edits left behind: "Both are rendered
from one accumulator" (there are four), "the gate is a second output" (there are
four), and "what repairs it is an alignment inlet, which this module does not
have yet" — it has had one since `reset` landed.
