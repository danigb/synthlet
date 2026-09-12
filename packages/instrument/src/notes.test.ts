import { toFrequency, toMidi } from "./notes";

describe("toMidi", () => {
  it("passes a number through", () => {
    expect(toMidi(60)).toBe(60);
    // A host with its own tuning writes the pitch it means.
    expect(toMidi(60.5)).toBe(60.5);
  });

  it("reads the naturals from middle C", () => {
    expect(toMidi("C4")).toBe(60);
    expect(toMidi("A4")).toBe(69);
    expect(toMidi("C0")).toBe(12);
    expect(toMidi("G9")).toBe(127);
  });

  it("reads sharps and flats", () => {
    expect(toMidi("C#4")).toBe(61);
    expect(toMidi("Db4")).toBe(61);
    expect(toMidi("F#3")).toBe(54);
    expect(toMidi("Bb2")).toBe(46);
    expect(toMidi("B#3")).toBe(60); // the enharmonic of C4
  });

  it("reads double accidentals", () => {
    expect(toMidi("C##4")).toBe(62);
    expect(toMidi("Ebb4")).toBe(62);
    expect(toMidi("C♯4")).toBe(61);
    expect(toMidi("D♭4")).toBe(61);
  });

  it("reads negative octaves", () => {
    expect(toMidi("C-1")).toBe(0);
    expect(toMidi("A-1")).toBe(9);
  });

  it("is case-insensitive about the letter and tolerant of space", () => {
    expect(toMidi("c4")).toBe(60);
    expect(toMidi(" eb3 ")).toBe(51);
  });

  it("throws on anything else, naming it", () => {
    // A note that silently becomes NaN is a note that silently does not sound.
    expect(() => toMidi("H4")).toThrow('Not a note name: "H4"');
    expect(() => toMidi("C")).toThrow('Not a note name: "C"');
    expect(() => toMidi("")).toThrow('Not a note name: ""');
    expect(() => toMidi("60")).toThrow('Not a note name: "60"');
    expect(() => toMidi(NaN)).toThrow("Not a note: NaN");
  });
});

describe("toFrequency", () => {
  it("is equal temperament from A4 = 440", () => {
    expect(toFrequency(69)).toBeCloseTo(440, 10);
    expect(toFrequency(57)).toBeCloseTo(220, 10);
    expect(toFrequency(81)).toBeCloseTo(880, 10);
    expect(toFrequency(60)).toBeCloseTo(261.6255653, 6);
  });
});
