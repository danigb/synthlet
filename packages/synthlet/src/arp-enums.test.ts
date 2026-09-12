import * as arp from "@synthlet/arp";
import * as instrument from "@synthlet/instrument";

import * as umbrella from "./index";

// There are two arpeggiators in the library, and this file is the guard on the
// one thing they must not share.
//
// The ticket asked for `ArpMode` to be a single enum shared by both packages,
// with `AsPlayed`, `Chord` and `Off` added to it. Neither half of that
// survives contact with the code:
//
// - `@synthlet/arp`'s mode is an `AudioParam`, and `params.ts` declares
//   `maxValue: 5`. An exported `Chord = 6` would be **clamped to
//   `RandomOther`, silently** - the exact failure `docs.test.ts` was written
//   for, where "the example failed by doing nothing... It was wrong for the
//   life of the package."
// - `"Chord"` is not a mode a single-frequency output can have at all, and
//   `order` is not a direction - only a *held* set has a press order.
//
// So the instrument's mode is a **string union** and the arp keeps its enum.
// The payoff is that the umbrella needed no change for this ticket: with no
// second `ArpMode`, `export *` from both packages has nothing to collide over.
//
// Criterion 13 asked that the two enums be member-identical so they cannot
// drift. They cannot drift because there is only one. These are the tests that
// keep that true - and `worklet-copies.test.ts` keeps the *math* they do share
// identical, which is the half that actually matters.

describe("the library's arp modes", () => {
  it("has exactly one ArpMode, and it is the arp's", () => {
    // Re-introducing an enum in `@synthlet/instrument` would collide under the
    // umbrella's `export *` (TS2308), and an ambiguous name is *excluded* from
    // the namespace rather than picked - so `umbrella.ArpMode` would be
    // `undefined` rather than wrong. This is the test that would say so.
    expect("ArpMode" in instrument).toBe(false);
    expect("ArpOctaveMode" in instrument).toBe(false);
    expect(umbrella.ArpMode).toBe(arp.ArpMode);
    expect(umbrella.ArpOctaveMode).toBe(arp.ArpOctaveMode);
  });

  it("carries the instrument's config factory through the umbrella", () => {
    expect(umbrella.ArpConfig).toBe(instrument.ArpConfig);
    // A function and a type rather than an enum, which is why tsup's dts
    // bundler keeps it across the `export *` without the umbrella naming it.
    expect(typeof umbrella.ArpConfig).toBe("function");
  });

  it("builds a pattern whose mode is a name", () => {
    expect(umbrella.ArpConfig("UpDownExclusive", { octaves: 2 })).toEqual({
      mode: "UpDownExclusive",
      order: "pitch",
      octaves: 2,
      octaveMode: "serial",
    });
  });

  it("keeps Chord out of the worklet's enum", () => {
    // The concrete reason the two are separate: `@synthlet/arp` would clamp a
    // seventh member to `RandomOther` and say nothing.
    expect(Object.keys(arp.ArpMode)).not.toContain("Chord");
    expect(umbrella.ArpConfig("Chord").mode).toBe("Chord");
  });

  it("still exports the DSP-zone enums the public allocator takes", () => {
    // `createVoiceAllocator` and `createNoteStack` are deliberately public and
    // take members, so both spellings coexist in one package - along the zone
    // boundary `names.ts` describes, not by accident.
    expect(umbrella.NotePriority).toBe(instrument.NotePriority);
    expect(umbrella.StealMode).toBe(instrument.StealMode);
  });
});
