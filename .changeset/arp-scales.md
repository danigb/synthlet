---
"@synthlet/arp": minor
---

Fix arpeggiator scales:

- Scale bitmasks are now decoded with bit 0 as the root (the convention the `ArpScale` values already used). Previously the mask was read back to front, so e.g. `ArpScale.Major` played Lydian and `TriadMajor` played a minor triad.
- The `scale` parameter range is now 1–4095, so `ArpScale.Chromatic` (4095) is reachable instead of being clamped.
- `octaves: 2` now actually spans two octaves (off-by-one).
- **Breaking:** removed the `type` parameter and the `ArpType` enum — there was only one mode (random) and the parameter did nothing. Removed the duplicate enum members `ArpScale.Diminished` (use `WholeHalfDiminished`) and `ArpScale.Pentatonic` (use `PentatonicMinor`).
