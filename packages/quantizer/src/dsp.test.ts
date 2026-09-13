import { createQuantizer, QuantizerOutput } from "./dsp";
import { Scale } from "./_scales";

/**
 * The engine, in node. Every assertion here is about one of three things: the
 * rule that decides which note an input lands on, the zone that keeps it there,
 * and the fact that neither costs anything per sample.
 *
 * The rule is Reid's Table 1 generalised to a non-uniform scale: **the nearest
 * allowed note, with ties going up**, so the boundary between two allowed notes
 * is their midpoint. In C major the C/D boundary is therefore 61.0, not 60.5 -
 * D is two semitones up, not one - which is what makes the `60.9` row below
 * a C and the `61.0` row a D.
 */

const Hz = QuantizerOutput.Hz;
const Note = QuantizerOutput.Note;

/** Middle C and its neighbours, to two decimal places. */
const C4 = 261.63;
const CS4 = 277.18;
const D4 = 293.66;

/** A quantizer, and a reader that fixes everything but the input. */
function quantizer({
  scale = Scale.Chromatic,
  root = 0,
  hysteresis = 0,
  output = Hz,
} = {}) {
  const update = createQuantizer();
  const read = (input: number) =>
    update(input, scale, root, hysteresis, output);
  return Object.assign(read, { update });
}

describe("it snaps", () => {
  it("takes the nearer of the two neighbouring semitones", () => {
    const q = quantizer();
    expect(q(60.4)).toBeCloseTo(C4, 2);
    expect(q(60.6)).toBeCloseTo(CS4, 2);
  });

  it("leaves a note that is already a note exactly where it is", () => {
    // A440 is the one number in the library that has to be exact: it is the
    // definition the whole conversion is written against.
    expect(quantizer()(69)).toBe(440);
  });

  it("is a plain note-to-hertz converter with Chromatic and no hysteresis", () => {
    // The module the README promises for "I only want to convert a note
    // number". Every semitone from C-1 to G9 comes back as itself.
    const q = quantizer();
    for (let note = 0; note <= 127; note++) {
      expect(q(note)).toBeCloseTo(440 * Math.pow(2, (note - 69) / 12), 6);
    }
  });
});

describe("ties go up", () => {
  const major = () => quantizer({ scale: Scale.Major });

  it("sends the midpoint of two allowed notes to the upper one", () => {
    // C major allows 60 and 62 and nothing between them, so 61 is equidistant.
    expect(major()(61)).toBeCloseTo(D4, 2);
  });

  it("keeps everything below that midpoint on the lower note", () => {
    // 60.9 is 0.9 from C and 1.1 from D. The ticket's success criteria call
    // this one D, which is the answer to a different rule - "round to the
    // nearest semitone, then snap" - and contradicts both its own pseudocode
    // and its own hysteresis criterion, which only reads as "switches at 61.2,
    // not 61.0" if the un-widened boundary is 61.0.
    const q = major();
    expect(q(60.4)).toBeCloseTo(C4, 2);
    expect(q(60.9)).toBeCloseTo(C4, 2);
    expect(q(60.99)).toBeCloseTo(C4, 2);
    // And the sample either side of the boundary, which is `[lo, hi)`.
    expect(q(61.0)).toBeCloseTo(D4, 2);
  });
});

describe("root transposes the mask", () => {
  // D major: D E F# G A B C#, so C# is in and C is not.
  const dMajor = () => quantizer({ scale: Scale.Major, root: 2 });

  it("leaves a note the transposed scale allows alone", () => {
    expect(dMajor()(61)).toBeCloseTo(CS4, 2);
  });

  it("sends a note it forbids to the nearer neighbour, ties up", () => {
    // C4 sits between B3 and C#4, one semitone from each: the tie goes up.
    expect(dMajor()(60)).toBeCloseTo(CS4, 2);
  });

  it("is floored, because a root between two pitch classes is not a key", () => {
    const update = createQuantizer();
    const read = (root: number) => update(60, Scale.Major, root, 0, Note);
    expect(read(2)).toBe(61);
    expect(read(2.9)).toBe(61);
  });
});

describe("hysteresis holds", () => {
  const RAMP = Array.from({ length: 201 }, (_, i) => 60 + i / 100);

  /** The first input on a 60...62 ramp whose output is no longer C4. */
  const switchesAt = (hysteresis: number) => {
    const q = quantizer({ scale: Scale.Major, hysteresis, output: Note });
    return RAMP.find((note) => q(note) !== 60);
  };

  it("moves the boundary by its own width", () => {
    // The un-widened boundary is 61.0, so 0.2 of hysteresis puts the switch at
    // 61.2 - and the zone is still half-open there, so 61.2 itself is the D.
    expect(switchesAt(0.2)).toBeCloseTo(61.2, 10);
  });

  it("switches at the midpoint with none", () => {
    expect(switchesAt(0)).toBeCloseTo(61.0, 10);
  });

  it("never changes note on a signal wavering across the boundary", () => {
    const q = quantizer({
      scale: Scale.Major,
      hysteresis: 0.2,
      output: Note,
    });
    q(60);
    for (let i = 0; i < 1000; i++) {
      expect(q(i % 2 ? 61.1 : 60.9)).toBe(60);
    }
  });

  it("changes on every crossing without it, which is the flicker", () => {
    const q = quantizer({ scale: Scale.Major, hysteresis: 0, output: Note });
    const notes = [60.9, 61.1, 60.9, 61.1].map(q);
    expect(notes).toEqual([60, 62, 60, 62]);
  });

  it("comes back down through the widened boundary too", () => {
    // Asymmetry would be a bug: a glide up and the same glide down have to
    // change note at the same two places, or a vibrato drifts.
    const q = quantizer({ scale: Scale.Major, hysteresis: 0.2, output: Note });
    expect([61.3, 61.0, 60.81, 60.79].map(q)).toEqual([62, 62, 62, 60]);
  });
});

describe("Note is the note", () => {
  it("emits the MIDI number as a plain value", () => {
    const q = quantizer({ scale: Scale.Major, output: Note });
    expect([60.4, 60.9, 61, 69, 200, -5].map(q)).toEqual([
      60, 60, 62, 69, 127, 0,
    ]);
  });

  it("emits the same note the Hz output is the frequency of", () => {
    // The two outputs are one decision read twice; if they could disagree,
    // `Param.mul(ac, q, 100)` into a `detune` would be a different pitch from
    // the same module into a `frequency`.
    const update = createQuantizer();
    for (const input of [48.2, 55.5, 60.9, 61, 73.4, 100.7]) {
      const note = update(input, Scale.PentatonicMinor, 3, 0, Note);
      const hz = update(input, Scale.PentatonicMinor, 3, 0, Hz);
      expect(hz).toBeCloseTo(440 * Math.pow(2, (note - 69) / 12), 9);
    }
  });
});

describe("out of range clamps", () => {
  it("holds the bottom and the top of the MIDI range", () => {
    const q = quantizer();
    expect(q(-5)).toBeCloseTo(8.1758, 4); // C-1
    expect(q(200)).toBeCloseTo(12543.85, 2); // G9
  });

  it("turns a NaN into MIDI 0 rather than putting one in the graph", () => {
    // An unconnected or half-built patch is where this arrives from, and a NaN
    // reaching an `OscillatorNode.frequency` silences the rest of the session.
    expect(quantizer({ output: Note })(NaN)).toBe(0);
    expect(Number.isFinite(quantizer()(NaN))).toBe(true);
  });

  it("still lands on an allowed note at both ends", () => {
    // The clamp happens before the search, so the top of the range is the
    // highest note the *scale* allows and not MIDI 127 regardless.
    const q = quantizer({ scale: Scale.Major, root: 0, output: Note });
    expect(q(200)).toBe(127); // B9 is in C major
    expect(q(-5)).toBe(0); // and so is C-1
    // And a scale whose top note is not MIDI 127: the whole-tone scale from C
    // allows every even note, so the clamp lands on 127 and the search walks
    // back down to the highest note there actually is.
    const wholeTone = quantizer({ scale: Scale.WholeTone, output: Note });
    expect(wholeTone(200)).toBe(126);
  });
});

describe("it is quiet", () => {
  it("holds a constant input bit-identical, and searches once", () => {
    // 60 s at 44.1 kHz is 2.6 M calls: the thing being asserted is that the
    // 2,645,999 of them after the first cost two comparisons and nothing else.
    const q = quantizer({ scale: Scale.Major, hysteresis: 0.1 });
    const first = q(60.4);
    for (let i = 1; i < 44100 * 60; i++) {
      if (q(60.4) !== first) throw Error(`drifted at sample ${i}`);
    }
    expect(q.update.searches).toBe(1);
  });

  it("does not search while a wavering input stays in its zone", () => {
    const q = quantizer({ scale: Scale.Major, hysteresis: 0.2 });
    q(60);
    const after = q.update.searches;
    // C major's zone around 60 is [59.5, 61), widened to [59.3, 61.2): half a
    // semitone of wobble either way never leaves it.
    for (let i = 0; i < 1000; i++) q(60 + Math.sin(i) * 0.5);
    expect(q.update.searches).toBe(after);
  });

  it("searches exactly once per note change", () => {
    const q = quantizer({ scale: Scale.Chromatic, hysteresis: 0 });
    q(60);
    const after = q.update.searches;
    // Up a chromatic octave, one semitone at a time, ten samples each.
    for (let note = 61; note <= 72; note++) {
      for (let i = 0; i < 10; i++) q(note);
    }
    expect(q.update.searches).toBe(after + 12);
  });
});

describe("the allowed-note table", () => {
  it("is rebuilt when the scale changes, under the same input", () => {
    const update = createQuantizer();
    // 61 in C major is the tie that goes up to D; in chromatic it is itself.
    expect(update(61, Scale.Major, 0, 0, Note)).toBe(62);
    expect(update(61, Scale.Chromatic, 0, 0, Note)).toBe(61);
    expect(update(61, Scale.Major, 0, 0, Note)).toBe(62);
  });

  it("is rebuilt when the root changes, under the same input", () => {
    const update = createQuantizer();
    expect(update(61, Scale.Major, 0, 0, Note)).toBe(62); // C major: C# is out
    expect(update(61, Scale.Major, 2, 0, Note)).toBe(61); // D major: C# is in
  });

  it("is not rebuilt when neither does", () => {
    // The proof is the search counter: a rebuild drops the cached zone, so a
    // spurious one would show up as a second search on an unchanged input.
    const update = createQuantizer();
    for (let i = 0; i < 100; i++) update(60.4, Scale.Major, 0.5, 0.1, Hz);
    expect(update.searches).toBe(1);
  });

  it("treats an empty mask as the root alone", () => {
    // `minValue: 1` keeps a 0 off the parameter, but this function is called
    // directly - and the fallback is `getPitchClasses`', so the two agree.
    const update = createQuantizer();
    expect(update(64, 0, 0, 0, Note)).toBe(60);
    expect(update(67, 0, 0, 0, Note)).toBe(72);
  });
});

describe("allocation", () => {
  it("allocates nothing in the per-sample function", () => {
    // The table is a `new Int8Array(128)` in the factory and is filled in
    // place; nothing below it may allocate, including the rebuild branch,
    // which runs whenever a scale picker moves. Reading the source is a blunt
    // check, but it is the one that keeps working when the shape changes.
    expect(String(createQuantizer())).not.toMatch(/\bnew\b|\[\s*\]|\{\s*\}/);
  });
});
