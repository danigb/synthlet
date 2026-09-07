---
"@synthlet/adsr": patch
"@synthlet/ad": patch
"@synthlet/karplus-strong": patch
"@synthlet/impulse": patch
"@synthlet/arp": patch
"@synthlet/euclid": patch
---

**Note placement moves. Every gate and trigger in the library is now `a-rate`, so a note
lands on the sample it was scheduled for.**

It used to land at the top of the next render quantum — up to **2.9 ms late at 44.1 kHz**,
and by a different amount for every event, so a repeated pattern did not even swing
consistently. Patches will sound different, and tighter. Pre-1.0 this is free to change;
after 1.0 it would not have been.

Six descriptors flipped: `adsr.gate`, `ad.trigger`, `karplus-strong.trigger`,
`impulse.trigger`, `arp.trigger`, `euclid.clock`. Three of them already read their
parameter rate-agnostically, behind an opt-in that was invisible in `X.descriptors`,
unreachable through a compound, and verified on one browser. The other three got the read.

Three capabilities that did not exist before:

- **Retrigger inside one block.** Two triggers within one render quantum are both seen.
  The second used to be silently dropped.
- **Short pulses.** `Impulse` read one sample per block, so a pulse that rose _and_ fell
  inside a quantum produced no impulse at all — not a late one, none. It now fires.
- **Sub-quantum step boundaries.** `Euclid`'s clock is a phase ramp, so its step boundary
  now lands on its own sample; `Arp`'s note changes at the trigger's sample rather than at
  the top of a block.

**Nothing costs more.** An unautomated parameter still arrives as a single value, so a
patch that sets `trigger.value` runs the same code it always did — every processor takes a
hoisted `length > 1` fast path. When a node _is_ connected the modulator is rendered
either way; `k-rate` was paying the same price and discarding the samples.

`Impulse` still writes its single sample at index 0. That is deliberate and unchanged: a
user may have connected it to a native `AudioParam` they left k-rate, which can only see
index 0. Its _detection_ is what stopped being quantised. One consequence: two rising
edges in one block still yield one impulse.

`Clock` and `Euclid` as producers are untouched — `gatePulse` still sizes pulses so a
k-rate consumer cannot miss them, and a wider pulse is still visible to an a-rate one.
