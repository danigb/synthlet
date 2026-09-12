// A note name to a MIDI number, because smplr takes both.
//
// Fifteen lines and no table: nothing below this surface ever sees a string,
// so this is the entire cost of accepting `"C4"` where a host would otherwise
// have to convert. Middle C is `C4 = 60`, the convention smplr, Tone.js and
// every DAW display use.

/** Semitones above C for each letter. */
const STEPS: Record<string, number> = {
  c: 0,
  d: 2,
  e: 4,
  f: 5,
  g: 7,
  a: 9,
  b: 11,
};

/** Sharps and flats, in any number: `C##3`, `Ebb2`, `F#-1`. */
const NAME = /^([a-gA-G])([#b♯♭]*)(-?\d+)$/;

/**
 * `toMidi(60)`, `toMidi("C4")` and `toMidi("B#3")` are all 60.
 *
 * A number passes through unchanged, including a fractional one: a host with
 * its own tuning writes the pitch it means. Anything else throws, naming what
 * it was given - a note that silently becomes `NaN` is a note that silently
 * does not sound.
 */
export function toMidi(note: number | string): number {
  if (typeof note === "number") {
    if (!Number.isFinite(note)) throw Error(`Not a note: ${note}`);
    return note;
  }
  const match = NAME.exec(note.trim());
  if (!match) throw Error(`Not a note name: "${note}"`);
  const [, letter, accidentals, octave] = match;
  let alteration = 0;
  for (const accidental of accidentals) {
    alteration += accidental === "#" || accidental === "♯" ? 1 : -1;
  }
  return (Number(octave) + 1) * 12 + STEPS[letter.toLowerCase()] + alteration;
}

/** Equal temperament from A4 = 440 Hz, which is where every voice's pitch comes from. */
export function toFrequency(midi: number): number {
  return 440 * 2 ** ((midi - 69) / 12);
}
