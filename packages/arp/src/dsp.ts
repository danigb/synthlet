import { createGateDetector } from "./_gate";

/**
 * Scales encoded as 12-bit pitch-class masks: bit `i` set means pitch class
 * `i` (semitones above the root) belongs to the scale. Bit 0 is the root, so
 * e.g. the major scale [0,2,4,5,7,9,11] is 0b101010110101 = 2741.
 *
 * Any number in 1..4095 is a valid (if unusual) scale.
 */
export enum ArpScale {
  Augmented = 2457,
  Blues = 1257,
  Chromatic = 4095,
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

/**
 * The engine: one note per rising edge of `trigger`, held on the output as a
 * frequency in Hz until the next one.
 *
 * @param random the source of randomness. It is an argument so the tests can
 *   assert a *sequence* rather than a distribution - without it every
 *   assertion in this package has to be hedged around `Math.random`. There is
 *   deliberately no user-facing `seed` parameter: this is a test seam, and an
 *   `AudioParam` carrying an integer nobody can interpret would be the only
 *   parameter in the library with no musical meaning. `worklet.ts` never
 *   passes an argument, so the shipped module is unchanged.
 */
export function createArpeggiator(random: () => number = Math.random) {
  let $note = 60;
  let $scale = 0;
  let $octaves = 1;

  let scaleNotes = [0];
  let len = 1;
  const detectGate = createGateDetector();
  let current = $note;

  // The note-to-frequency conversion is memoised on the MIDI note because
  // `trigger` is a-rate: the worklet calls this once per sample, and the note
  // changes at most once per block. Without the cache that is 128 `Math.pow`
  // calls a block for one result.
  let $current = NaN;
  let $frequency = 0;

  return function update(
    trigger: number,
    baseNote: number,
    scale: number,
    octaves: number,
  ): number {
    $note = baseNote;
    $octaves = octaves;

    if ($scale !== scale) {
      $scale = scale;
      scaleNotes = getPitchClasses(scale);
      len = scaleNotes.length;
    }

    if (detectGate(trigger) === true) current = nextRandom();

    if (current !== $current) {
      $current = current;
      $frequency = 440 * Math.pow(2, (current - 69) / 12);
    }

    return $frequency;
  };

  function nextRandom() {
    const octave = Math.floor(random() * $octaves);
    const randomFromScale = scaleNotes[Math.floor(random() * len)];
    return $note + randomFromScale + octave * 12;
  }
}

/**
 * Decode a scale bitmask into its pitch classes (bit 0 = root).
 * An empty mask yields the root alone.
 */
export function getPitchClasses(scale: number): number[] {
  const pitchClasses: number[] = [];
  for (let i = 0; i < 12; i++) {
    if (scale & (1 << i)) {
      pitchClasses.push(i);
    }
  }
  return pitchClasses.length ? pitchClasses : [0];
}
