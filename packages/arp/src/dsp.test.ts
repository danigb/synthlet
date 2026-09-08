import { ArpScale, createArpeggiator } from "./dsp";
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

// Both of these are ticket 02's, recorded here as measurements of the defect.
describe("baseline: the note range at the declared maxima", () => {
  const NYQUIST = 22050;
  const toHz = (note: number) => 440 * Math.pow(2, (note - 69) / 12);

  it.failing("never emits a note above MIDI 127", () => {
    // Fails on purpose: `nextRandom` adds `baseNote + pitchClass + 12*octave`
    // with no ceiling, so both declared maxima together reach MIDI 246 -
    // 12.1 MHz. Ticket 02 folds octaves back down under 127 and deletes the
    // `.failing`.
    const notes = play(createArpeggiator(), 20_000, {
      baseNote: 127,
      octaves: 10,
    });
    expect(Math.max(...notes)).toBeLessThanOrEqual(127);
  });

  it("puts most of its steps above Nyquist at baseNote 127, octaves 10", () => {
    // The measurement behind the ticket: 91.6% of steps are inaudible, and
    // every one of them collapses onto the same pitch, because
    // `polyblep-oscillator` caps `frequency` at 20000 and a native
    // `OscillatorNode` clamps to Nyquist. Delete this test in ticket 02; it
    // asserts the wrong behaviour on purpose.
    const notes = play(createArpeggiator(), 20_000, {
      baseNote: 127,
      octaves: 10,
    });
    const above = notes.filter((n) => toHz(n) > NYQUIST).length;
    // 91.6% measured; asserted as a band because it is a proportion of 20 000
    // draws and a tighter one flakes.
    expect(above / notes.length).toBeGreaterThan(0.905);
    expect(above / notes.length).toBeLessThan(0.93);
  });

  it("puts one step in seven above Nyquist at a musically plausible setting", () => {
    // C7 with a four-octave range is a setting somebody would dial, not an
    // abuse of the range: 14.7%.
    const notes = play(createArpeggiator(), 20_000, {
      baseNote: 96,
      octaves: 4,
    });
    const above = notes.filter((n) => toHz(n) > NYQUIST).length;
    // 14.7% measured, same band reasoning as above.
    expect(above / notes.length).toBeGreaterThan(0.135);
    expect(above / notes.length).toBeLessThan(0.16);
  });
});
