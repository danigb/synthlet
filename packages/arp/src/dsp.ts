export enum ArpType {
  Random = 0,
}

export enum ArpChord {
  Major = 145,
}

export function createArpeggiator() {
  let $note = 60;
  let $chord = 0;
  let $octaves = 1;

  let chordNotes = [0];
  let position = 0;
  let len = 1;
  let active = false;
  let current = $note;

  return function update(
    trigger: number,
    type: number,
    baseNote: number,
    chord: number,
    octaves: number
  ): number {
    $note = baseNote;
    $octaves = octaves;

    if ($chord !== chord) {
      $chord = chord;
      chordNotes = getPitchClasses(chord);
      len = chordNotes.length;
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

    return current;
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
    const randomFromChord = chordNotes[Math.floor(Math.random() * len)];
    return $note + randomFromChord + octave * 12;
  }
}

function getPitchClasses(chord: number) {
  const binary = chord.toString(2);
  const pitchClasses: number[] = [];
  for (let i = 0; i < binary.length; i++) {
    if (binary[i] === "1") {
      pitchClasses.push(i);
    }
  }
  return pitchClasses;
}
