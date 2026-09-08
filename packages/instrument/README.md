# @synthlet/instrument

> A voice definition in, a playable instrument out

Part of [Synthlet](https://github.com/danigb/synthlet).

`Instrument` takes a **voice definition** — a function that builds one voice,
the parameters a preset addresses, the worklets it needs — and gives back a
polyphonic instrument: a pool of voice graphs, one fan-out node per
per-instrument parameter, and the allocator that decides which voice plays
which note. It contains no DSP of its own.

This package is under construction. Today it publishes the allocator and the
note stack the rest of it is built on; the playable surface arrives next.
