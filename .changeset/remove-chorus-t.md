---
"synthlet": minor
---

**BREAKING:** remove `@synthlet/chorus-t` from the umbrella package.

`@synthlet/chorus-t` was a port of GPLv2-only code (TAL-NoiseMaker) and cannot be distributed under MIT. It has been deleted from the repository and is no longer exported by `synthlet`; `registerAllWorklets` no longer registers it. Use `Chorus` from `@synthlet/chorus` instead.

The already-published `@synthlet/chorus-t@0.1.1` should be deprecated on npm with:

    npm deprecate @synthlet/chorus-t "Removed for licensing reasons; use @synthlet/chorus"
