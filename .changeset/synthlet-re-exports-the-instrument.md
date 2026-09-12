---
"synthlet": minor
---

Re-exports `@synthlet/instrument`.

`import { Instrument, monoVoice } from "synthlet"` works. `StealMode` and
`NotePriority` are named explicitly next to the other enum re-exports, for the
reason that block already documents: tsup's dts bundler drops enums from an
`export *`, so without the explicit line they exist at runtime and not in the
published types. `registerAllWorklets` is unchanged — the instrument registers
nothing of its own; the definition's `register` does.

`index.test.ts` checks the re-export by identity rather than by name: the
umbrella's `StealMode` must _be_ the package's, and every name the package
exports must reach the umbrella as the same object. A name exported by two
packages, or a narrowed re-export that silently drops one, is invisible to
`tsc` and to every other test in the repo, because nothing breaks — the name is
simply gone, or is the wrong thing.
