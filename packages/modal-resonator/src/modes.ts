/**
 * Mode tables: pure functions that return `{ ratio, level, decay }` lists.
 *
 * **The table is the interface.** Rings and Elements fill their resonator from
 * a *rule* - a `structure` knob for inharmonicity, a `brightness` knob for Q, a
 * `position` knob for a cosine window over mode index - because a Eurorack panel
 * has three knobs and no table. Synthlet has no panel, and Synth Secrets Parts
 * 31 to 41 hand over tables. So the worklet only ever sees a table, and a rule
 * is a function in this file that returns one. `stiffString` is the first rule;
 * `structure` and `position` are later ones.
 *
 * Every field means the same thing in every table:
 *
 * - `ratio`: frequency relative to the node's `frequency`.
 * - `level`: the mode's envelope at the strike of a unit impulse, before
 *   `brightness` tilts it.
 * - `decay`: a multiplier of the node's `decay`. A mode whose `decay` is 1
 *   falls 60 dB in `decay` seconds; one whose `decay` is 0.45 in 45 % of that.
 *
 * Line numbers below are in `docs/synth-secrets.md` of the development
 * repository, which is where the tables were transcribed from.
 */

export type ResonatorMode = {
  /** Frequency relative to the node's `frequency`. */
  ratio: number;
  /** Envelope at the strike of a unit impulse, before `brightness`. */
  level: number;
  /** Multiplier of the node's `decay`, in which 1 is `decay` seconds to -60 dB. */
  decay: number;
};

const table = (rows: readonly (readonly [number, number, number])[]) =>
  rows.map(([ratio, level, decay]) => ({ ratio, level, decay }));

/**
 * Ratios `1 ... n`, every level `1/n`, every decay 1: the default table.
 *
 * Flat rather than falling with `n`, so the levels sum to 1 and the tilt is
 * `brightness`'s alone - a table that already fell would make `brightness: 1`
 * mean something other than "the table as written". `harmonic(1)` is claves
 * (Part 41): one mode, which is all the TR-808's bridged-T oscillator is.
 */
export function harmonic(n: number): ResonatorMode[] {
  const count = Math.max(1, Math.floor(n));
  const rows: ResonatorMode[] = [];
  for (let k = 1; k <= count; k++) {
    rows.push({ ratio: k, level: 1 / count, decay: 1 });
  }
  return rows;
}

/**
 * The ideal membrane: Part 31's twelve low-order modes, the Bessel ratios
 * before a shell drags the radial ones towards harmonic (:3899-3912).
 *
 * The book gives frequencies and no levels, so every mode is `1/12`. Struck
 * through `Impulse` this is the dull, enharmonic thump Reid says hitting a
 * kettle drum dead centre produces - which is why the timpanist does not.
 */
export function membrane(): ResonatorMode[] {
  return [1, 1.59, 2.14, 2.3, 2.65, 2.92, 3.16, 3.5, 3.6, 3.65, 4.06, 4.15].map(
    (ratio) => ({ ratio, level: 1 / 12, decay: 1 }),
  );
}

/**
 * The kettle drum: Part 32's four quasi-harmonic radial modes.
 *
 * - Ratios 1.00 : 1.50 : 1.98 : 2.44, Table 1 (:4018-4027); at a 150 Hz
 *   principal, Table 2's 150, 225, 297 and 366 Hz (:4049-4055).
 * - Levels 5 : 4 : 3 : 1 (:4032), normalised to mode 1.
 * - Decays 45 % : 73 % : 91 % : 84 % (:4030), **verbatim**. That is why the
 *   node's `decay` is defined as the time of a mode whose table decay is 1
 *   rather than as the time of mode 1: here mode 1 rings for 0.45 of it.
 *
 * The enharmonic burst at the strike is not here. It is short-lived noise, and
 * `Noise` through an `AdAmp` beside this node is the book's own answer.
 */
export function kettleDrum(): ResonatorMode[] {
  return table([
    [1, 1, 0.45],
    [1.5, 0.8, 0.73],
    [1.98, 0.6, 0.91],
    [2.44, 0.2, 0.84],
  ]);
}

/**
 * A bell: Part 40's strike note, its warble and its hum.
 *
 * - The strike partials sit at **2 : 3 : 4** of `frequency`, so the ear
 *   supplies the missing 1 (:5119) and `frequency` is the pitch you hear.
 * - A near-degenerate partner at 2.01 beats against the 2 - the
 *   *"boii-yoy-yoy-yoiinnnggg"* of :5123.
 * - The hum an octave below the heard pitch, at 0.5, outlasts everything
 *   (:5117, :5141).
 *
 * **Only the ratios are Reid's.** Part 40 synthesises the bell with envelope
 * generators and gives no per-partial levels or decays; the ones here are this
 * library's, chosen so the three phases the book describes are audible.
 */
export function bell(): ResonatorMode[] {
  return table([
    [0.5, 0.2, 3],
    [2, 0.2, 1],
    [2.01, 0.15, 1],
    [3, 0.15, 0.7],
    [4, 0.1, 0.5],
  ]);
}

/**
 * The CR-8000 cowbell: Part 41's two tones at 587 and 845 Hz, 1 : 1.44
 * (:5181). *"Even small deviations from these pitches destroy the cowbell
 * illusion"*, so play it at `frequency: 587`.
 *
 * Two rows per tone, at the same ratio: a loud one with a short decay and a
 * quieter one with a long one. Two modes at one frequency struck together are
 * one sine whose envelope is the sum of two exponentials - which is exactly the
 * two-stage *"high-amplitude, short-duration 'impact', followed by a more
 * extended tail"* contour of :5187, with no envelope generator. The upper tone
 * is a little louder than the lower, *"a little more of the higher frequency"*
 * (:5211). The levels are this library's; the book gives the shape.
 */
export function cowbell(): ResonatorMode[] {
  return table([
    [1, 0.3, 0.1],
    [1, 0.15, 1],
    [1.44, 0.35, 0.1],
    [1.44, 0.2, 1],
  ]);
}

/**
 * A stiff string: `k · √(1 + B·k²)` for k = 1...n, the partial series of a
 * string with bending stiffness `B` (Fletcher's inharmonicity coefficient; a
 * piano's is of the order of 1e-4, Part 42).
 *
 * Normalised by mode 1, so `frequency` is still the fundamental you tune:
 * without that, any `B > 0` would sharpen the whole note. `B: 0` is
 * `harmonic(n)`. Levels `1/n`, decays 1, as `harmonic`.
 */
export function stiffString(B: number, n: number): ResonatorMode[] {
  const stiffness = Math.max(0, B);
  const first = Math.sqrt(1 + stiffness);
  return harmonic(n).map(({ ratio: k, level, decay }) => ({
    ratio: (k * Math.sqrt(1 + stiffness * k * k)) / first,
    level,
    decay,
  }));
}

/** Every table and rule, as `ModalResonator.modes`. */
export const MODES = {
  harmonic,
  membrane,
  kettleDrum,
  bell,
  cowbell,
  stiffString,
};
