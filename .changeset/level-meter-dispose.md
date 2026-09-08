---
"@synthlet/level-meter": patch
---

Honour `DISPOSE`, so a disposed `LevelMeter` actually stops.

`process()` returned the literal `true`. `this.r` was set in the constructor, set to
`false` when the `DISPOSE` message arrived, and then never read — so `dispose()`
disconnected the node on the main thread and the processor kept being scheduled for the
lifetime of the `AudioContext`. Every other one of the 23 packages returns `this.r`;
this one did not.

The consequence is worse here than anywhere else. A filter or an oscillator is created
once per voice and lives as long as the note; a meter is the module most likely to be
created and destroyed repeatedly — one per voice in a preview, one per channel strip a
user adds and removes, one per node while debugging a graph. Each of them stayed in the
render graph scanning and copying its input forever.
