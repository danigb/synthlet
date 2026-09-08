---
"@synthlet/euclid": patch
---

`pulseWidth` is reachable from TypeScript, and the step phase wraps in one
subtraction.

Two independent fixes. `pulseWidth` has been in the parameter list since 0.2.0 —
the factory wires it, the processor reads it, the README documents it — but
`EuclidInputs` and `EuclidWorkletNode` never gained the field, so
`Euclid(ac, { pulseWidth: 0.1 })` was a type error and `node.pulseWidth` was
untyped. That is the class of bug the 0.2.0 changeset announced was fixed: the
single descriptor list settled the processor and the factory, and the input type
was a third hand-maintained copy nothing checked. It is now checked — the
descriptor names are literal types and two compile-time assertions hold the input
type and the node type to them, so a parameter added without a matching field
fails the build naming the field it is missing.

And the phase of the current step is now `p - Math.floor(p)` rather than up to
`subdivision` repeated subtractions per sample: measured 7.9x faster at
`subdivision: 20` (2e7 iterations, median of five, Node 24 on Apple silicon).
The loop also left a scaled phase of exactly 1 standing, which reads as a closed
gate — the one value in `clock`'s declared range that behaved unlike its
neighbours, since a phase held anywhere below `pulseWidth` holds the gate open.
It now reads as 0, the top of the ramp being the bottom of the next step.
`Clock` emits `[0, 1)` and never produces it; a hand-patched `clock` can. Step
boundaries are otherwise unmoved, sample for sample.
