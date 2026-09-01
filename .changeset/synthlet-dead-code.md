---
"synthlet": minor
---

Remove the exported `Synthlet()` function. It had an empty body and returned
`undefined`.

`MonoSynthInputs.vibrato` and `MonoSynthInputs.filter` are now actually applied
— both were declared and documented but never read, so passing them did nothing.

Also deletes the unused `connectors.ts` and `operators.ts` modules, superseded
by the `conn` operators on `getSynthlet()`.
