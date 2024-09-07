const noteToPitchClass = {
  C: 0,
  "C#": 1,
  Db: 1,
  D: 2,
  "D#": 3,
  Eb: 3,
  E: 4,
  F: 5,
  "F#": 6,
  Gb: 6,
  G: 7,
  "G#": 8,
  Ab: 8,
  A: 9,
  "A#": 10,
  Bb: 10,
  B: 11,
};

const parse = (chord) => {
  const notes = chord.split(" ");
  const pitchClasses = notes.map((note) => noteToPitchClass[note]);
  const binary = [];
  for (let i = 0; i < 12; i++) {
    binary.push(pitchClasses.includes(i) ? 1 : 0);
  }
  binary.reverse();
  const binaryString = binary.join("");
  return parseInt(binaryString, 2);
};

const SCALES = {
  Major: "C D E F G A B",
  Minor: "C D Eb F G Ab Bb",
  Dorian: "C D Eb F G A Bb",
  Phrygian: "C Db Eb F G Ab Bb",
  Lydian: "C D E F# G A B",
  Mixolydian: "C D E F G A Bb",
  Locrian: "C Db Eb F Gb Ab Bb",
  HarmonicMinor: "C D Eb F G Ab B",
  MelodicMinor: "C D Eb F G A B",
  WholeTone: "C D E F# G# A#",
  WholeHalfDiminished: "C D Eb F Gb Ab A B",
  HalfWholeDiminished: "C Db Eb E F# G A Bb",
  PentatonicMajor: "C D E G A",
  PentatonicMinor: "C Eb F G Bb",
  Pentatonic: "C Eb F G Bb",
  Blues: "C Eb F F# G Bb",
  Chromatic: "C Db D Eb E F Gb G Ab A Bb B",
  Augmented: "C D# E G Ab B",
  Diminished: "C D Eb F Gb Ab A B",
  Dominant7th: "C E G Bb",
  Minor7th: "C Eb G Bb",
  Major7th: "C E G B",
  MinorMajor7th: "C Eb G B",
  TriadMajor: "C E G",
  TriadMinor: "C Eb G",
  TriadAugmented: "C E G#",
  TriadDiminished: "C Eb Gb",
  Sus2: "C D G",
  Sus4: "C F G",
  Major6th: "C E G A",
};

const VALUES = Object.entries(SCALES).map(([key, value]) => {
  return `${key}= ${parse(value)},`;
});

console.log("export enum ArpScale {");
VALUES.sort();
console.log(VALUES.join("\n"));
console.log("};");
