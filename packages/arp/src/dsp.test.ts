import { ArpScale, createArpeggiator, getPitchClasses } from "./dsp";
import { xorshift32 } from "./test-random";

// The arpeggiator advances on the rising edge of its trigger. It picks a
// random note, so what is asserted is *that* it advanced, over enough tries
// that picking the same note twice cannot mask a missed advance.
describe("createArpeggiator trigger detection", () => {
  const CHROMATIC = 4095;
  const advances = (triggers: number[]) => {
    const arp = createArpeggiator();
    const notes = triggers.map((trigger) => arp(trigger, 60, CHROMATIC, 4));
    return notes;
  };

  const changed = (notes: number[]) =>
    notes.some((note, i) => i > 0 && note !== notes[i - 1]);

  it.each([1, 0.99, 0.5, 0.05])("advances on a trigger of %p", (trigger) => {
    // Alternating with 0 gives one rising edge per pair.
    const notes = advances([0, ...new Array(40).fill([trigger, 0]).flat()]);
    expect(changed(notes)).toBe(true);
  });

  it.each([0, -1])("does not advance on a trigger of %p", (trigger) => {
    expect(changed(advances(new Array(40).fill(trigger)))).toBe(false);
  });

  it("advances once while the trigger is held", () => {
    const arp = createArpeggiator();
    arp(0, 60, CHROMATIC, 4);
    const fired = arp(1, 60, CHROMATIC, 4);
    for (let i = 0; i < 40; i++) {
      expect(arp(1, 60, CHROMATIC, 4)).toBe(fired);
    }
  });
});

// The rest of this file is ticket 01 of the arp folder: the numeric net that
// the four tickets after it get to break. Nothing here changes the module -
// `createArpeggiator()` with no argument is still `Math.random`.

/** The output is a frequency; every assertion below is about the MIDI note. */
const freqToMidi = (freq: number) =>
  Math.round(69 + 12 * Math.log2(freq / 440));

/**
 * `count` notes, one per trigger. The arpeggiator advances on a rising edge,
 * so each step is a `1` followed by a `0`.
 */
function play(
  arp: ReturnType<typeof createArpeggiator>,
  count: number,
  { baseNote = 60, scale = ArpScale.Chromatic, octaves = 1 } = {},
) {
  const notes: number[] = [];
  for (let i = 0; i < count; i++) {
    notes.push(freqToMidi(arp(1, baseNote, scale, octaves)));
    arp(0, baseNote, scale, octaves);
  }
  return notes;
}

describe("the injected random source", () => {
  it("defaults to Math.random", () => {
    // Criterion 1: the default argument *is* `Math.random`, so the shipped
    // module is unchanged. Drive the same stream through both spellings and
    // compare note for note - if the default were anything else, or if the
    // draws were made in a different order, these diverge immediately.
    const spy = jest.spyOn(Math, "random").mockImplementation(xorshift32(7));
    const byDefault = play(createArpeggiator(), 200, {
      scale: ArpScale.Major,
      octaves: 3,
    });
    spy.mockRestore();

    const injected = play(createArpeggiator(xorshift32(7)), 200, {
      scale: ArpScale.Major,
      octaves: 3,
    });

    expect(byDefault).toEqual(injected);
  });

  it("makes a seeded run exactly reproducible", () => {
    // Criterion 2. Two arpeggiators, one seed, one sequence - which is what
    // lets ticket 03 write `expect(notes).toEqual([60, 64, 67, 60])` instead
    // of a set-membership check.
    const a = play(createArpeggiator(xorshift32(1)), 64, {
      scale: ArpScale.TriadMajor,
      octaves: 2,
    });
    const b = play(createArpeggiator(xorshift32(1)), 64, {
      scale: ArpScale.TriadMajor,
      octaves: 2,
    });
    expect(a).toEqual(b);

    // Pinned, so that changing the generator is a deliberate act rather than
    // a silent reshuffle of every seeded expectation in the package.
    expect(a.slice(0, 8)).toEqual([60, 72, 72, 60, 67, 76, 72, 67]);
  });
});

// A BASELINE, NOT A CONTRACT.
//
// Uniform selection with no memory repeats the previous note 1/n of the time
// and does not cover its own set. These numbers are here so ticket 04 - which
// replaces the strategy with a no-immediate-repeat draw and a shuffle bag -
// has to change them deliberately and can show what it moved. Every one of
// them should read 0% after that ticket.
describe("baseline: what a memoryless random pick costs", () => {
  function repeatRate(scale: ArpScale, triggers: number) {
    const notes = play(createArpeggiator(), triggers, { scale });
    let repeats = 0;
    for (let i = 1; i < notes.length; i++) {
      if (notes[i] === notes[i - 1]) repeats++;
    }
    return repeats / (notes.length - 1);
  }

  // A triad is the input an arpeggiator is *for*, and it is the worst case:
  // one step in three is a repeat, which under a fixed envelope is a step
  // that did not happen.
  it("repeats the previous note about 1/n of the time", () => {
    // 200 000 triggers rather than the 60 000 these were measured over:
    // `toBeCloseTo(x, 2)` allows 0.005, which at 60 000 draws is only two and a
    // half standard deviations of the proportion - i.e. a test that fails on
    // about one run in a hundred for no reason. At 200 000 it is five.
    expect(repeatRate(ArpScale.TriadMajor, 200_000)).toBeCloseTo(1 / 3, 2);
    expect(repeatRate(ArpScale.PentatonicMinor, 200_000)).toBeCloseTo(1 / 5, 2);
    expect(repeatRate(ArpScale.Major, 200_000)).toBeCloseTo(1 / 7, 2);
  });

  it("usually fails to sound all seven notes of a major scale in twelve triggers", () => {
    const RUNS = 5_000;
    let incomplete = 0;
    for (let run = 0; run < RUNS; run++) {
      const played = new Set(
        play(createArpeggiator(), 12, { scale: ArpScale.Major }),
      );
      if (played.size < 7) incomplete++;
    }
    // 77.3% measured over 60k runs; the tolerance is three points because
    // this is a proportion of 5000 Bernoulli trials, not a constant.
    expect(incomplete / RUNS).toBeGreaterThan(0.74);
    expect(incomplete / RUNS).toBeLessThan(0.81);
  });
});

// Ticket 02: three defects, all reachable from the declared parameter ranges.
describe("the note range", () => {
  const NYQUIST = 22050;
  const MAX_HZ = 440 * Math.pow(2, (127 - 69) / 12); // MIDI 127 = 12543.85 Hz

  // Numeric enums carry reverse mappings; keep the name -> value entries.
  const SCALES = Object.values(ArpScale).filter(
    (v) => typeof v === "number",
  ) as number[];

  it("never emits a note above MIDI 127", () => {
    // The sweep is exhaustive in *combinations* - all 128 baseNotes x 10
    // octaves x 28 scales - and short in triggers, because the failure mode is
    // a combination and not a rare draw: `nextRandom` added
    // `baseNote + pitchClass + 12 * octave` with no ceiling, so at both
    // declared maxima it reached MIDI 246, which is 12.1 MHz.
    let worst = 0;
    for (let baseNote = 0; baseNote <= 127; baseNote++) {
      for (let octaves = 1; octaves <= 10; octaves++) {
        for (const scale of SCALES) {
          const arp = createArpeggiator(xorshift32(baseNote * 31 + octaves));
          for (let i = 0; i < 60; i++) {
            const hz = arp(1, baseNote, scale, octaves);
            arp(0, baseNote, scale, octaves);
            if (hz > worst) worst = hz;
          }
        }
      }
    }
    expect(worst).toBeLessThanOrEqual(MAX_HZ);
    // Asserted in Hz as well as in notes, because Hz is what the module emits
    // and the defect was found in Hz.
    expect(worst).toBeLessThan(NYQUIST);
  });

  it("keeps the pitch class when it folds", () => {
    // The reason the fix is a fold and not a clamp: a clamped note is not a
    // member of the set the user chose. Read at the settings where the fold
    // actually fires, which is where a clamp would be indistinguishable.
    for (const scale of SCALES) {
      const pitchClasses = getPitchClasses(scale);
      for (const baseNote of [120, 124, 127]) {
        const arp = createArpeggiator(xorshift32(scale + baseNote));
        for (let i = 0; i < 200; i++) {
          const note = freqToMidi(arp(1, baseNote, scale, 10));
          arp(0, baseNote, scale, 10);
          expect(note).toBeLessThanOrEqual(127);
          expect(pitchClasses).toContain((((note - baseNote) % 12) + 12) % 12);
        }
      }
    }
  });

  it("spans exactly as many octaves as the floor of the count", () => {
    // `octaves` is a count, and `Math.floor(random() * 2.5)` yielded 0, 1 and
    // 2 - three octaves for a request of two and a half.
    const spanOf = (octaves: number) => {
      const notes = play(createArpeggiator(xorshift32(3)), 4_000, {
        scale: ArpScale.TriadMajor,
        octaves,
      });
      return Math.floor((Math.max(...notes) - 60) / 12) + 1;
    };
    expect(spanOf(2.5)).toBe(2);
    expect(spanOf(1.9)).toBe(1);
    expect(spanOf(3)).toBe(3);
  });

  it("holds the root before its first trigger, for every baseNote", () => {
    for (let baseNote = 0; baseNote <= 127; baseNote++) {
      const arp = createArpeggiator();
      const hz = arp(0, baseNote, ArpScale.Major, 4);
      expect(hz).toBeCloseTo(440 * Math.pow(2, (baseNote - 69) / 12), 6);
    }
    // 130.81 Hz is the number in the ticket: `Arp(ac, { baseNote: 48 })` used
    // to hold 261.63 Hz - MIDI 60 - because the closure was seeded with a
    // literal.
    const arp = createArpeggiator();
    expect(arp(0, 48, ArpScale.Major, 4)).toBeCloseTo(130.81, 2);
  });

  it("leaves the distribution alone where nothing can overflow", () => {
    // The fold must be inert where it is not needed. This is the same seeded
    // sequence pinned above, asserted again from the other side: if the fold
    // fired at `baseNote: 60, octaves: 2` it would not reproduce.
    const notes = play(createArpeggiator(xorshift32(1)), 8, {
      scale: ArpScale.TriadMajor,
      octaves: 2,
    });
    expect(notes).toEqual([60, 72, 72, 60, 67, 76, 72, 67]);
  });
});
