import { ArpScale, createArpeggiator, getPitchClasses } from "./dsp";

// Expected pitch classes (semitones above the root) for every scale.
const EXPECTED: Record<keyof typeof ArpScale, number[]> = {
  Augmented: [0, 3, 4, 7, 8, 11],
  Blues: [0, 3, 5, 6, 7, 10],
  Chromatic: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11],
  Dominant7th: [0, 4, 7, 10],
  Dorian: [0, 2, 3, 5, 7, 9, 10],
  HalfWholeDiminished: [0, 1, 3, 4, 6, 7, 9, 10],
  HarmonicMinor: [0, 2, 3, 5, 7, 8, 11],
  Locrian: [0, 1, 3, 5, 6, 8, 10],
  Lydian: [0, 2, 4, 6, 7, 9, 11],
  Major6th: [0, 4, 7, 9],
  Major7th: [0, 4, 7, 11],
  Major: [0, 2, 4, 5, 7, 9, 11],
  MelodicMinor: [0, 2, 3, 5, 7, 9, 11],
  Minor7th: [0, 3, 7, 10],
  Minor: [0, 2, 3, 5, 7, 8, 10],
  MinorMajor7th: [0, 3, 7, 11],
  Mixolydian: [0, 2, 4, 5, 7, 9, 10],
  PentatonicMajor: [0, 2, 4, 7, 9],
  PentatonicMinor: [0, 3, 5, 7, 10],
  Phrygian: [0, 1, 3, 5, 7, 8, 10],
  Sus2: [0, 2, 7],
  Sus4: [0, 5, 7],
  TriadAugmented: [0, 4, 8],
  TriadDiminished: [0, 3, 6],
  TriadMajor: [0, 4, 7],
  TriadMinor: [0, 3, 7],
  WholeHalfDiminished: [0, 2, 3, 5, 6, 8, 9, 11],
  WholeTone: [0, 2, 4, 6, 8, 10],
};

// Numeric enums have reverse mappings; keep only the name -> value entries.
const MEMBERS = Object.entries(ArpScale).filter(
  ([, value]) => typeof value === "number",
) as [keyof typeof ArpScale, number][];

const freqToMidi = (freq: number) =>
  Math.round(69 + 12 * Math.log2(freq / 440));

describe("ArpScale", () => {
  it("decodes every scale to its documented pitch classes", () => {
    expect(MEMBERS.length).toBe(Object.keys(EXPECTED).length);
    for (const [name, value] of MEMBERS) {
      expect({ [name]: getPitchClasses(value) }).toEqual({
        [name]: EXPECTED[name],
      });
    }
  });

  it("gives every scale a distinct note set", () => {
    const sets = new Set(
      MEMBERS.map(([, value]) => JSON.stringify(getPitchClasses(value))),
    );
    expect(sets.size).toBe(MEMBERS.length);
  });

  it("is selectable through the scale parameter of the worklet", async () => {
    createWorkletTestContext();
    const { ArpProcessor } = await import("./worklet");
    const descriptors: { name: string; minValue: number; maxValue: number }[] =
      ArpProcessor.parameterDescriptors as any;
    const scale = descriptors.find((d) => d.name === "scale")!;

    expect(scale).toBeDefined();
    for (const [, value] of MEMBERS) {
      expect(value).toBeGreaterThanOrEqual(scale.minValue);
      expect(value).toBeLessThanOrEqual(scale.maxValue);
    }
    expect(descriptors.find((d) => d.name === "type")).toBeUndefined();
  });

  it("falls back to the root for an empty mask", () => {
    expect(getPitchClasses(0)).toEqual([0]);
  });
});

describe("createArpeggiator", () => {
  // Since ticket 03 the traversal has an order, so this reads the sequence
  // rather than collecting a `Set` over 400 cycles: the old helper could
  // assert that a note belonged to the scale, but never that note 3 follows
  // note 2, which is the only interesting thing about an arpeggiator.
  function playNotes(scale: number, octaves: number, steps: number) {
    const arp = createArpeggiator();
    const notes: number[] = [];
    for (let i = 0; i < steps; i++) {
      notes.push(freqToMidi(arp(1, 60, scale, octaves)));
      arp(0, 60, scale, octaves);
    }
    return notes;
  }

  it("plays the scale in order, and nothing else", () => {
    const expected = EXPECTED.Major.map((pc) => 60 + pc);
    // Two full cycles: the pattern repeats, which is the claim.
    expect(playNotes(ArpScale.Major, 1, 14)).toEqual([
      ...expected,
      ...expected,
    ]);
  });

  it("spans the requested number of octaves, one after the other", () => {
    // Serial traversal: the whole set, then the same set an octave up.
    expect(playNotes(ArpScale.TriadMajor, 2, 7)).toEqual([
      60, 64, 67, 72, 76, 79, 60,
    ]);
  });

  it("holds the note until the trigger is released", () => {
    const arp = createArpeggiator();
    const first = arp(1, 60, ArpScale.Chromatic, 3);
    for (let i = 0; i < 20; i++) {
      expect(arp(1, 60, ArpScale.Chromatic, 3)).toBe(first);
    }
  });
});

function createWorkletTestContext(sampleRate = 44100) {
  // @ts-ignore
  global.sampleRate = sampleRate;
  // @ts-ignore
  global.AudioWorkletProcessor = class AudioWorkletNodeStub {
    port: {
      postMessage: jest.Mock<any, any, any>;
      onmessage: jest.Mock<any, any, any>;
    };

    constructor() {
      this.port = {
        postMessage: jest.fn(),
        onmessage: jest.fn(),
      };
    }
  };
  // @ts-ignore
  global.registerProcessor = jest.fn();
}
