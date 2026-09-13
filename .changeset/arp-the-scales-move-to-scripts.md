---
"@synthlet/arp": patch
---

Internal: the scale mask table and `getPitchClasses` move from
`packages/arp/src/dsp.ts` to `scripts/_scales.ts`, copied into this package and
into the new `@synthlet/quantizer` by `scripts/copy_files.sh`.

**No surface change.** `ArpScale` and `getPitchClasses` are exported from the
same place under the same names, with the same 28 members and the same values;
`scales.test.ts`, which pins every member's decoded pitch classes, is untouched
and passing.

This is the repo's standing rule — a utility moves to `scripts/` when a _second_
package needs it, not before — and the same event that moved `_traversal.ts` out
of this same file when `@synthlet/instrument` arrived. What had to be shared is
not the nine-line decoder but the table: `Arp` walks the notes of a mask and
`Quantizer` snaps a signal to them, `scale` is an `AudioParam` on both, and a
value or a node is meant to move between them. Two tables that had drifted by
one bit would put an arpeggio and a quantiser in different keys, with no error
and nothing to say so. `worklet-copies.test.ts` asserts the file is
byte-identical across its copies.

The enum stays `ArpScale` here and is `Scale` in the new package: this package
named it first, and a shared file does not get to rename a published export.
