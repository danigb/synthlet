---
"@synthlet/level-meter": patch
---

A tap disposed after its source no longer throws.

`LevelMeter.tap(source)` undid its edge with `source.disconnect(node, output)`,
a **targeted** disconnect — and a targeted disconnect of an edge that is
already gone throws `InvalidAccessError`. It regularly is gone: `disposable()`
calls `source.disconnect()` with no argument, which drops every edge out of the
source, this one included, so anything that disposes a compound before the
meter watching it hit this.

In a React tree that is the ordinary order rather than an unusual one — a
cleanup runs parent-first, so the compound goes and then the meter does — and a
throw out of an effect cleanup is an error in the commit: React unmounts the
rest of the tree and re-renders the document. The page blinks and loses what
was on it.

Both teardowns now tolerate an edge that has already gone, the worklet's and
the script-processor fallback's. Nothing else changes: the rest of each
cascade still runs, and a tap disposed while its source is still connected
still removes exactly the one edge it added.
