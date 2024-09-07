export enum ArpType {
  Random = 0,
}

export enum ArpScale {
  Augmented = 2457,
  Blues = 1257,
  Chromatic = 4095,
  Diminished = 2925,
  Dominant7th = 1169,
  Dorian = 1709,
  HalfWholeDiminished = 1755,
  HarmonicMinor = 2477,
  Locrian = 1387,
  Lydian = 2773,
  Major6th = 657,
  Major7th = 2193,
  Major = 2741,
  MelodicMinor = 2733,
  Minor7th = 1161,
  Minor = 1453,
  MinorMajor7th = 2185,
  Mixolydian = 1717,
  Pentatonic = 1193,
  PentatonicMajor = 661,
  PentatonicMinor = 1193,
  Phrygian = 1451,
  Sus2 = 133,
  Sus4 = 161,
  TriadAugmented = 273,
  TriadDiminished = 73,
  TriadMajor = 145,
  TriadMinor = 137,
  WholeHalfDiminished = 2925,
  WholeTone = 1365,
}

export function createArpeggiator() {
  let $note = 60;
  let $scale = 0;
  let $octaves = 1;

  let scaleNotes = [0];
  let position = 0;
  let len = 1;
  let active = false;
  let current = $note;

  return function update(
    trigger: number,
    type: number,
    baseNote: number,
    scale: number,
    octaves: number
  ): number {
    $note = baseNote;
    $octaves = octaves;

    if ($scale !== scale) {
      $scale = scale;
      scaleNotes = getPitchClasses(scale);
      len = scaleNotes.length;
      position = position % len;
    }

    if (trigger === 1) {
      if (!active) {
        active = true;
        current = getNextNote(type);
      }
    } else {
      active = false;
    }

    const freq = 440 * Math.pow(2, (current - 69) / 12);

    return freq;
  };

  function getNextNote(type: number) {
    switch (type) {
      case ArpType.Random:
      default:
        return nextRandom();
    }
  }

  function nextRandom() {
    const octave = Math.floor(Math.random() * ($octaves - 1));
    const randomFromChord = scaleNotes[Math.floor(Math.random() * len)];
    return $note + randomFromChord + octave * 12;
  }
}

function getPitchClasses(scale: number) {
  const binary = scale.toString(2);
  const pitchClasses: number[] = [];
  for (let i = 0; i < binary.length; i++) {
    if (binary[i] === "1") {
      pitchClasses.push(i);
    }
  }
  return pitchClasses;
}
