/*
 * Parts 31 and 32, as three boxes.
 *
 * Reid's recipe is four band-pass filters tuned to 150, 225, 297 and 366 Hz,
 * each with its own amplifier and its own decay, struck by a noise burst -
 * Table 2 of Part 32, which is Table 1's ratios `1 : 1.5 : 1.98 : 2.44` at a
 * 150 Hz principal. `ModalResonator.modes.kettleDrum()` is that table,
 * transcribed with line citations, including the levels `5 : 4 : 3 : 1` and
 * the decays `45% : 73% : 91% : 84%` verbatim. So the four filters are one
 * node now, and the strike is one `Impulse`.
 *
 * The `strike` switch is Reid's own contrast rather than a knob. A timpanist
 * hits the skin *"almost precisely a quarter of the way from the edge to the
 * centre"*, which excites the four radial modes the shell has dragged towards
 * harmonic. Dead centre excites the ideal membrane instead - Part 31's twelve
 * Bessel ratios - and gives, in his words, "a dull, toneless, and musically
 * uninteresting thump". Two tables, one node, and the reason the timpanist
 * does not hit the middle.
 *
 * The principal is the **1,1 mode and not the fundamental**: the true
 * fundamental sits at about 63% of it and is barely there, which is why the
 * perceived pitch can leap at the end of a long roll as the 1,1 dies first.
 */

import { Compound, Gain, Impulse, ModalResonator } from "synthlet";
import { definePatch } from "../define";

/** Part 32's Table 2: 150 Hz gives 150, 225, 297 and 366 Hz. */
const PRINCIPAL = 150;
const DEFAULT_DECAY = 2.5;

/** Table 1's four ratios, for the marks. */
const RATIOS = [1, 1.5, 1.98, 2.44];

const STRIKES = [
  "Off centre — the four radial modes",
  "Dead centre — the ideal membrane",
];

/** A fixed trim, after the analyser. */
const LEVEL = 0.125;

function build(ac: AudioContext) {
  const impulse = Impulse(ac);
  const res = ModalResonator(ac, {
    frequency: PRINCIPAL,
    decay: DEFAULT_DECAY,
    brightness: 1,
    modes: ModalResonator.modes.kettleDrum(),
    maxModes: 16,
  });

  const analyser = ac.createAnalyser();
  analyser.fftSize = 8192;
  analyser.smoothingTimeConstant = 0.5;
  analyser.minDecibels = -100;
  analyser.maxDecibels = -10;

  const level = Gain.val(ac, LEVEL);
  const out = Gain.val(ac, 0);

  impulse.connect(res).connect(analyser).connect(level).connect(out);

  let where = 0;
  const strike = {
    get value() {
      return where;
    },
    set value(next: number) {
      where = Math.min(1, Math.max(0, Math.round(next)));
      // The table is swapped on the next quantum and nothing is allocated, so
      // a mode that is in both tables keeps ringing from where it is.
      res.setModes(
        where === 0
          ? ModalResonator.modes.kettleDrum()
          : ModalResonator.modes.membrane(),
      );
    },
  };

  return Compound({
    output: out,
    owns: [impulse, res, analyser, level],
    exposes: { impulse, res, analyser, strike },
  });
}

export default definePatch({
  id: "recipes/timpani",
  label: "Timpani",
  build,
  controls: [
    {
      id: "principal",
      kind: "slider",
      label: "Principal",
      help: "The 1,1 mode, not the fundamental. The true fundamental is 63% of it.",
      param: (s) => s.res.frequency,
      min: 60,
      max: 300,
      scale: "log",
      unit: "Hz",
      default: PRINCIPAL,
    },
    {
      id: "decay",
      kind: "slider",
      label: "Decay",
      help: "Seconds for a mode whose table decay is 1. Mode one rings for 45% of it.",
      param: (s) => s.res.decay,
      min: 0.2,
      max: 6,
      scale: "time",
      unit: "s",
      default: DEFAULT_DECAY,
    },
    {
      id: "brightness",
      kind: "slider",
      label: "Brightness",
      help: "A tilt over the table: mode n is scaled by this to the power n minus one.",
      param: (s) => s.res.brightness,
      min: 0,
      max: 1,
      step: 0.01,
      default: 1,
    },
    {
      id: "strike",
      kind: "select",
      label: "Strike",
      help: "Where the mallet lands. One of these is a drum and the other is a thump.",
      param: (s) => s.strike,
      options: STRIKES,
      default: 0,
    },
    {
      id: "trigger",
      kind: "gate",
      label: "Strike it",
      help: "One impulse. Everything after it is the skin, the shell and the air.",
      param: (s) => s.impulse.trigger,
      mode: "trigger",
    },
  ],
  views: [
    {
      kind: "spectrum",
      label: "Spectrum",
      source: (s) => s.analyser,
      // Table 1, drawn. Off centre the four marks stand on four peaks; dead
      // centre they stand on a mess, which is Part 31's whole point.
      options: {
        marks: (s) => RATIOS.map((ratio) => ratio * s.res.frequency.value),
      },
    },
    {
      kind: "scope",
      label: "Contour",
      source: (s) => s.analyser,
      options: { window: "contour", seconds: 4 },
    },
    { kind: "diagram", label: "The patch" },
  ],
  // Three boxes, one line, and the whole of Parts 31 and 32.
  diagram: {
    nodes: [
      {
        id: "impulse",
        label: "Impulse",
        kind: "source",
        exposedAs: "impulse",
        controls: ["trigger"],
      },
      {
        id: "res",
        label: "ModalResonator",
        kind: "modifier",
        exposedAs: "res",
        controls: ["principal", "decay", "brightness", "strike"],
      },
      { id: "out", label: "out", kind: "output" },
    ],
    edges: [
      { from: "impulse", to: "res" },
      { from: "res", to: "out" },
    ],
  },
});
