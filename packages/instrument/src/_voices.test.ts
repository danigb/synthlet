import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  Allocation,
  createNoteStack,
  createVoiceAllocator,
  NotePriority,
  StealMode,
} from "./_voices";

/**
 * The allocator and the note stack, which are the only real algorithm in this
 * package and the one piece a native poly worklet would reuse verbatim.
 *
 * Everything here runs in node: `_voices.ts` has no imports, no nodes and no
 * clock, which the last block of this file asserts by reading the source.
 */

/** The slot an allocation landed on, or -1 when nothing was allocated. */
const slot = (a: Allocation) => (a === null ? -1 : a.index);

describe("the voice allocator", () => {
  // stmlib's `NoteOn` is three ordered rules, and the order is the design.

  it("reuses the voice already sounding a note", () => {
    const voices = createVoiceAllocator(4);

    const first = voices.noteOn(60);
    const again = voices.noteOn(60);

    expect(first).toEqual({ index: 0, reused: false, stolen: false });
    expect(again).toEqual({ index: 0, reused: true, stolen: false });
  });

  it("takes the released voice that released longest ago, not the oldest note", () => {
    // Four voices held, then two released in an order that is not their
    // playing order: the next note goes to the one released *first*, because
    // `noteOff` touches the slot and rule 2 reads the touch, not the start.
    const voices = createVoiceAllocator(4);
    for (const note of [60, 62, 64, 65]) voices.noteOn(note);

    voices.noteOff(64); // slot 2, released first
    voices.noteOff(60); // slot 0, played first but released last

    const next = voices.noteOn(67);

    expect(next).toEqual({ index: 2, reused: false, stolen: false });
    expect(voices.activeNote(0)).toBe(-1);
  });

  it("prefers any released voice to stealing a held one", () => {
    const voices = createVoiceAllocator(4);
    voices.noteOn(60);
    voices.noteOn(60); // reuses slot 0
    voices.noteOff(60);
    // The three remaining slots are untouched, so they are taken first: rule 2
    // reads the touch counter and an untouched slot is older than a released
    // one.
    expect(slot(voices.noteOn(62))).toBe(1);
    expect(slot(voices.noteOn(64))).toBe(2);
    expect(slot(voices.noteOn(65))).toBe(3);

    const fifth = voices.noteOn(67);

    // Nothing was stolen: the slot 60 released was still free.
    expect(fifth).toEqual({ index: 0, reused: false, stolen: false });
  });

  it("gives a repeated note a fresh voice when sameNoteReuse is off", () => {
    // The plucked-string case, and the reason it is a flag: a second pluck is
    // a second string, not a retrigger of the first.
    const voices = createVoiceAllocator(4, { sameNoteReuse: false });

    expect(slot(voices.noteOn(60))).toBe(0);
    expect(slot(voices.noteOn(60))).toBe(1);
    expect(voices.activeNote(0)).toBe(60);
    expect(voices.activeNote(1)).toBe(60);
  });

  it("releases the most recent of two voices sounding the same note", () => {
    const voices = createVoiceAllocator(4, { sameNoteReuse: false });
    voices.noteOn(60);
    voices.noteOn(60);

    expect(voices.noteOff(60)).toBe(1);
    expect(voices.noteOff(60)).toBe(0);
    expect(voices.noteOff(60)).toBe(-1);
  });

  it("reports what a steal cost", () => {
    const voices = createVoiceAllocator(2, { steal: StealMode.Lru });
    voices.noteOn(60);
    voices.noteOn(62);

    // The pool has to fade the stolen slot before it writes the new note, and
    // it can only do that if it is told which note lost.
    expect(voices.noteOn(64)).toEqual({
      index: 0,
      reused: false,
      stolen: true,
      stolenNote: 60,
    });
  });

  describe("StealMode.Protect", () => {
    // JUCE's `findVoiceToSteal`: the lowest and the highest sounding note are
    // the two a listener is following, so a bass line and a melody both
    // survive a dense chord.
    const C2 = 36;
    const E4 = 64;
    const G4 = 67;
    const C6 = 84;
    const D4 = 62;

    it("keeps the outer voices and takes the older of the rest", () => {
      const voices = createVoiceAllocator(4);
      for (const note of [C2, E4, G4, C6]) voices.noteOn(note);

      expect(voices.noteOn(D4)).toEqual({
        index: 1,
        reused: false,
        stolen: true,
        stolenNote: E4, // the older of the two inner voices, never C2 or C6
      });
      expect(voices.activeNote(0)).toBe(C2);
      expect(voices.activeNote(3)).toBe(C6);
    });

    it("makes the bottom note available once it is released", () => {
      const voices = createVoiceAllocator(4);
      for (const note of [C2, E4, G4, C6]) voices.noteOn(note);
      voices.noteOn(D4); // takes E4's slot

      voices.noteOff(C2);
      const next = voices.noteOn(69);

      expect(next).toEqual({ index: 0, reused: false, stolen: false });
    });

    it("degrades to LRU rather than to a null", () => {
      // Two voices are both an extreme, so the exclusion leaves nothing. The
      // third note still has to sound.
      const voices = createVoiceAllocator(2);
      voices.noteOn(60);
      voices.noteOn(72);

      expect(voices.noteOn(65)).toEqual({
        index: 0,
        reused: false,
        stolen: true,
        stolenNote: 60,
      });
    });

    it("leaves exactly one candidate on three voices", () => {
      const voices = createVoiceAllocator(3);
      voices.noteOn(40);
      voices.noteOn(60); // neither lowest nor highest
      voices.noteOn(80);

      expect(slot(voices.noteOn(70))).toBe(1);
    });
  });

  it("steals the oldest under Lru and the newest under Mru", () => {
    const held = [60, 62, 64];

    const lru = createVoiceAllocator(3, { steal: StealMode.Lru });
    for (const note of held) lru.noteOn(note);
    expect(slot(lru.noteOn(65))).toBe(0);

    const mru = createVoiceAllocator(3, { steal: StealMode.Mru });
    for (const note of held) mru.noteOn(note);
    expect(slot(mru.noteOn(65))).toBe(2);
  });

  it("allocates nothing under Drop, and touches nothing either", () => {
    const voices = createVoiceAllocator(2, { steal: StealMode.Drop });
    voices.noteOn(60);
    voices.noteOn(62);

    expect(voices.noteOn(64)).toBeNull();
    expect(voices.activeNote(0)).toBe(60);
    expect(voices.activeNote(1)).toBe(62);

    // And the refusal left the touch order alone: freeing slot 0 makes it the
    // one the next note lands on.
    voices.noteOff(60);
    expect(slot(voices.noteOn(64))).toBe(0);
  });

  it("answers a note-off for a note nobody is holding with -1", () => {
    const voices = createVoiceAllocator(4);
    voices.noteOn(60);

    expect(voices.noteOff(62)).toBe(-1);
    expect(voices.noteOff(60)).toBe(0);
    expect(voices.noteOff(60)).toBe(-1);
  });

  it("reports what each slot is sounding", () => {
    const voices = createVoiceAllocator(2);
    voices.noteOn(60);

    expect(voices.isActive(0)).toBe(true);
    expect(voices.isActive(1)).toBe(false);
    expect(voices.activeNote(0)).toBe(60);
    expect(voices.activeNote(1)).toBe(-1);
    expect(voices.activeNote(-1)).toBe(-1);
    expect(voices.activeNote(9)).toBe(-1);
    expect(voices.isActive(9)).toBe(false);

    voices.noteOff(60);
    expect(voices.isActive(0)).toBe(false);
    expect(voices.activeNote(0)).toBe(-1);
  });

  it("forgets everything on clear", () => {
    const voices = createVoiceAllocator(3);
    voices.noteOn(60);
    voices.noteOn(62);
    voices.clear();

    expect(voices.isActive(0)).toBe(false);
    expect(voices.noteOff(60)).toBe(-1);
    expect(slot(voices.noteOn(64))).toBe(0);
  });

  it("allocates nothing at all with an empty pool", () => {
    const voices = createVoiceAllocator(0);

    expect(voices.noteOn(60)).toBeNull();
    expect(voices.noteOff(60)).toBe(-1);
  });
});

/**
 * Synth Secrets Part 18, "Priorities & Triggers" (Sound On Sound, October
 * 2000), transcribed as the reference for the four mono priorities.
 *
 * The article's figures are all the same shape: four notes, each held for four
 * beats, each starting one beat after the last. So the events are four presses
 * and then four releases in the same order, and after each one exactly one
 * note is sounding - the one this priority scheme picks out of the held set.
 */
const PART_18_EVENTS = 7; // the eighth release leaves nothing sounding

/** The note each priority sounds after each of the seven events. */
function sounded(line: number[], priority: NotePriority): number[] {
  const held = createNoteStack();
  const out: number[] = [];
  const events = [
    ...line.map((n) => [n, true] as const),
    ...line.map((n) => [n, false] as const),
  ];

  for (const [note, down] of events.slice(0, PART_18_EVENTS)) {
    if (down) held.push(note, 100);
    else held.remove(note);
    out.push(held.top(priority)!.note);
  }
  return out;
}

/** How many different notes ever spoke. Part 18: sometimes only three. */
const spoken = (line: number[], priority: NotePriority) =>
  new Set(sounded(line, priority)).size;

describe("the four note priorities", () => {
  const D4 = 62;
  const F4 = 65;
  const A4 = 69;
  const C5 = 72;

  // Figure 1: "a simple four-note sequence D-F-A-C".
  const RISING = [D4, F4, A4, C5];
  // Figure 3: "the converse of this ... a simple downward sequence".
  const FALLING = [C5, A4, F4, D4];
  // Figure 4: "a four-note sequence that changes direction", where "the
  // results are quite unexpected, and each is different from the other".
  const MIXED = [D4, A4, F4, C5];

  it("plays the rising line the way Figures 2(a)-2(d) do", () => {
    // "Because it's the lowest note, the first note is held for its entire
    // duration, and the following notes can only speak when they become the
    // lowest held notes."
    expect(sounded(RISING, NotePriority.Low)).toEqual([
      D4,
      D4,
      D4,
      D4,
      F4,
      A4,
      C5,
    ]);
    // "At least the notes speak at the right time with this approach, but they
    // are curtailed when you play the higher ones."
    expect(sounded(RISING, NotePriority.High)).toEqual([
      D4,
      F4,
      A4,
      C5,
      C5,
      C5,
      C5,
    ]);
    expect(sounded(RISING, NotePriority.Last)).toEqual([
      D4,
      F4,
      A4,
      C5,
      C5,
      C5,
      C5,
    ]);
    expect(sounded(RISING, NotePriority.First)).toEqual([
      D4,
      D4,
      D4,
      D4,
      F4,
      A4,
      C5,
    ]);
  });

  it("collapses to two answers on a rising line", () => {
    // "Of course, this looks identical to the results you get with
    // highest-note priority. But bear with me a moment."
    expect(sounded(RISING, NotePriority.Last)).toEqual(
      sounded(RISING, NotePriority.High),
    );
    expect(sounded(RISING, NotePriority.First)).toEqual(
      sounded(RISING, NotePriority.Low),
    );
  });

  it("inverts those pairings on a falling line", () => {
    // "With this sequence, lowest-note priority offers the same results as
    // last-note priority, while first-note priority imitates highest-note
    // priority. This is opposite to the result we achieved when playing up
    // the keyboard."
    expect(sounded(FALLING, NotePriority.Low)).toEqual([
      C5,
      A4,
      F4,
      D4,
      D4,
      D4,
      D4,
    ]);
    expect(sounded(FALLING, NotePriority.Last)).toEqual(
      sounded(FALLING, NotePriority.Low),
    );

    expect(sounded(FALLING, NotePriority.High)).toEqual([
      C5,
      C5,
      C5,
      C5,
      A4,
      F4,
      D4,
    ]);
    expect(sounded(FALLING, NotePriority.First)).toEqual(
      sounded(FALLING, NotePriority.High),
    );
  });

  it("separates all four on a line that changes direction", () => {
    const answers = [
      sounded(MIXED, NotePriority.Last),
      sounded(MIXED, NotePriority.Low),
      sounded(MIXED, NotePriority.High),
      sounded(MIXED, NotePriority.First),
    ];

    expect(answers).toEqual([
      [D4, A4, F4, C5, C5, C5, C5],
      [D4, D4, D4, D4, F4, F4, C5],
      [D4, A4, A4, C5, C5, C5, C5],
      [D4, D4, D4, D4, A4, F4, C5],
    ]);
    // "each is different from the other"
    expect(new Set(answers.map((a) => a.join(","))).size).toBe(4);
  });

  it("drops a note of the direction-changing line under two of the four", () => {
    // "Indeed, two of the sequences play just three notes." They are the two
    // pitch-ordered schemes: A4 is never the lowest note held, and F4 is never
    // the highest, so neither ever speaks.
    expect(spoken(MIXED, NotePriority.Low)).toBe(3);
    expect(spoken(MIXED, NotePriority.High)).toBe(3);
    expect(spoken(MIXED, NotePriority.Last)).toBe(4);
    expect(spoken(MIXED, NotePriority.First)).toBe(4);
  });

  it("sounds nothing when no key is down", () => {
    const held = createNoteStack();

    expect(held.top(NotePriority.Last)).toBeNull();
    expect(held.top(NotePriority.Low)).toBeNull();
    expect(held.top(NotePriority.High)).toBeNull();
    expect(held.top(NotePriority.First)).toBeNull();
  });
});

describe("the note stack", () => {
  it("keeps press order and pitch order at once", () => {
    const held = createNoteStack();
    for (const note of [67, 60, 64]) held.push(note, 100);

    expect([0, 1, 2].map((i) => held.played(i).note)).toEqual([67, 60, 64]);
    expect([0, 1, 2].map((i) => held.sorted(i).note)).toEqual([60, 64, 67]);
    expect(held.size).toBe(3);
  });

  it("moves a re-pressed note to the top and updates its velocity", () => {
    const held = createNoteStack();
    held.push(60, 40);
    held.push(64, 50);
    held.push(60, 127);

    expect([0, 1].map((i) => held.played(i).note)).toEqual([64, 60]);
    expect(held.size).toBe(2);
    expect(held.top(NotePriority.Last)).toEqual({ note: 60, velocity: 127 });
    // And the velocity rides along in the sorted order too.
    expect(held.sorted(0)).toEqual({ note: 60, velocity: 127 });
    expect(held.sorted(1)).toEqual({ note: 64, velocity: 50 });
  });

  it("carries each note's own velocity", () => {
    const held = createNoteStack();
    held.push(72, 20);
    held.push(48, 110);

    expect(held.sorted(0)).toEqual({ note: 48, velocity: 110 });
    expect(held.sorted(1)).toEqual({ note: 72, velocity: 20 });
    expect(held.top(NotePriority.Low)!.velocity).toBe(110);
    expect(held.top(NotePriority.High)!.velocity).toBe(20);
  });

  it("evicts the least recently played note on overflow", () => {
    // The Juno-60 manual: "if more than 6 keys have been played, the last six
    // keys will remain."
    const held = createNoteStack(16);
    for (let i = 0; i < 17; i++) held.push(40 + i, 100);

    expect(held.size).toBe(16);
    expect(held.played(0).note).toBe(41); // the second note pushed
    expect(held.has(40)).toBe(false);
    expect(held.played(15).note).toBe(56);
    expect(held.sorted(0).note).toBe(41);
  });

  it("ignores a release of a note nobody is holding", () => {
    const held = createNoteStack();
    held.push(60, 100);
    held.remove(62);

    expect(held.size).toBe(1);
    expect(held.has(60)).toBe(true);
    expect(held.has(62)).toBe(false);
  });

  it("answers an out-of-range read rather than throwing", () => {
    const held = createNoteStack();
    held.push(60, 100);

    expect(held.played(1)).toEqual({ note: -1, velocity: 0 });
    expect(held.sorted(-1)).toEqual({ note: -1, velocity: 0 });
  });

  it("releases everything on clear", () => {
    const held = createNoteStack();
    held.push(60, 100);
    held.push(64, 100);
    held.clear();

    expect(held.size).toBe(0);
    expect(held.has(60)).toBe(false);
    expect(held.top(NotePriority.Last)).toBeNull();
  });

  it("holds nothing at capacity zero", () => {
    const held = createNoteStack(0);
    held.push(60, 100);

    expect(held.size).toBe(0);
    expect(held.top(NotePriority.Last)).toBeNull();
  });

  it("keeps both orders exact under 10 000 random operations", () => {
    // The two orderings are maintained by two different loops in `push` and
    // `remove`, so the failure mode is that they drift apart under a sequence
    // nobody wrote a case for. A naive reference and a fuzz is what catches
    // that.
    const capacity = 16;
    const held = createNoteStack(capacity);
    let reference: { note: number; velocity: number }[] = [];

    // A fixed generator, so a failure is reproducible.
    let seed = 0x2f6e2b1;
    const random = () => {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      return seed / 0x7fffffff;
    };

    for (let step = 0; step < 10000; step++) {
      const note = 21 + Math.floor(random() * 88);
      if (random() < 0.6) {
        const velocity = 1 + Math.floor(random() * 127);
        held.push(note, velocity);
        reference = reference.filter((e) => e.note !== note);
        if (reference.length === capacity) reference.shift();
        reference.push({ note, velocity });
      } else {
        held.remove(note);
        reference = reference.filter((e) => e.note !== note);
      }

      const byPitch = [...reference].sort((a, b) => a.note - b.note);
      expect(held.size).toBe(reference.length);
      for (let i = 0; i < reference.length; i++) {
        expect(held.played(i)).toEqual(reference[i]);
        expect(held.sorted(i)).toEqual(byPitch[i]);
      }
    }

    expect(reference.length).toBeGreaterThan(0);
  });
});

describe("the source of _voices.ts", () => {
  const source = readFileSync(join(__dirname, "_voices.ts"), "utf8");
  /** The file with every comment removed: what it actually does. */
  const code = source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .filter((line) => !line.trim().startsWith("//"))
    .join("\n");

  it("has no imports", () => {
    // It is copied into packages by `scripts/copy_files.sh` precisely so that
    // no package has to depend on another to get it.
    expect(code).not.toMatch(/\b(?:import|require)\s*[({'"]/);
  });

  it("knows nothing about the audio graph or the clock", () => {
    // Pure decision-making: the caller owns every node and every instant.
    expect(code).not.toMatch(
      /AudioContext|AudioParam|AudioNode|currentTime|sampleRate|Date\.now|performance\.now/,
    );
  });

  it("allocates nothing in the hot path", () => {
    // Criterion 11 is a reading of the code, and this is that reading made
    // mechanical: every array is sized once at construction and every
    // insertion is a shift within it, so none of the growing or copying
    // spellings may appear.
    expect(code).not.toMatch(
      /\.(?:push|pop|shift|unshift|splice|slice|concat|map|filter|sort)\(|new Array|Array\.from|\[\s*\.\.\./,
    );
  });
});
