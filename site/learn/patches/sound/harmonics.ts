import { Compound, Gain, Svf, SvfType, WavetableOscillator } from "synthlet";
import { definePatch } from "../define";

/*
 * A sawtooth built one harmonic at a time, and then taken apart again.
 *
 * Additive on the way up, subtractive on the way down, in one chain: the
 * oscillator's table is rebuilt from a harmonic series whose length is a knob,
 * and the filter behind it removes from the top what the knob added. That is
 * the whole of Synth Secrets Part 1 and the whole of the rest of the course,
 * arrived at before either word has been used.
 */

/** Low enough that sixteen harmonics all sit inside the spectrum's window. */
const FREQUENCY = 110;
const MAX_HARMONICS = 16;
const DEFAULT_HARMONICS = 8;

/** Above the sixteenth harmonic, so the filter starts out of the way. */
const OPEN = 12000;
/** Between the fifth and the sixth: "strip" leaves five and takes the rest. */
const STRIPPED = FREQUENCY * 5.5;

/**
 * The first `count` harmonics of a sawtooth: the nth at 1/n.
 *
 * `planes[p][0]` is the fundamental here, unlike `PeriodicWave`, whose index 0
 * is DC - so this array needs no leading zero.
 */
function sawHarmonics(count: number): number[] {
  return Array.from({ length: count }, (_, index) => 1 / (index + 1));
}

function build(ac: AudioContext) {
  const osc = WavetableOscillator(ac, { frequency: FREQUENCY });
  const filter = Svf(ac, { type: SvfType.LowPass, frequency: OPEN, Q: 0.7 });

  // One analyser, owned by the compound, feeding both views: the scope and the
  // spectrum are then two pictures of the same measurement rather than two
  // measurements that can disagree.
  const analyser = ac.createAnalyser();
  analyser.fftSize = 4096;
  analyser.smoothingTimeConstant = 0.6;
  analyser.minDecibels = -100;
  analyser.maxDecibels = -10;

  // Last in the chain and at zero. A page must not arrive making a sound; the
  // kit's Play toggle opens this, on the click that also resumes the context.
  // It sits *after* the analyser, so a silent widget is still drawing.
  const out = Gain.val(ac, 0);

  osc.connect(filter).connect(analyser).connect(out);

  let count = DEFAULT_HARMONICS;
  osc.setHarmonics([sawHarmonics(count)]);

  // Not an `AudioParam`: writing it rebuilds the wavetable on the main thread
  // and transfers it. A plain accessor is all the kit needs, and all it knows.
  const harmonics = {
    get value() {
      return count;
    },
    set value(next: number) {
      count = Math.min(MAX_HARMONICS, Math.max(1, Math.round(next)));
      osc.setHarmonics([sawHarmonics(count)]);
    },
  };

  // A one-knob filter, deliberately: the reader gets "take the top off" as a
  // switch before they get a cutoff in Hz. It writes the same param the Cutoff
  // slider does, and overriding it is the point - the two controls are two
  // descriptions of one act.
  let stripped = 0;
  const strip = {
    get value() {
      return stripped;
    },
    set value(on: number) {
      stripped = on ? 1 : 0;
      filter.frequency.value = stripped ? STRIPPED : OPEN;
    },
  };

  return Compound({
    output: out,
    owns: [osc, filter, analyser],
    exposes: { osc, filter, analyser, harmonics, strip },
  });
}

export default definePatch({
  id: "sound/harmonics",
  label: "Harmonics",
  build,
  controls: [
    {
      id: "harmonics",
      kind: "slider",
      label: "Harmonics",
      help: "How many sine waves are stacked up, the nth at 1/n.",
      param: (s) => s.harmonics,
      min: 1,
      max: MAX_HARMONICS,
      step: 1,
      default: DEFAULT_HARMONICS,
    },
    {
      id: "cutoff",
      kind: "slider",
      label: "Cutoff",
      param: (s) => s.filter.frequency,
      min: 100,
      max: OPEN,
      scale: "log",
      unit: "Hz",
      default: OPEN,
    },
    {
      id: "strip",
      kind: "toggle",
      label: "Strip harmonics",
      help: "Cut everything above the fifth.",
      param: (s) => s.strip,
      default: 0,
    },
  ],
  views: [
    {
      kind: "spectrum",
      label: "Harmonics",
      source: (s) => s.analyser,
      // Where the theory says the partials are, drawn over where they are.
      options: {
        marks: (s) =>
          Array.from(
            { length: s.harmonics.value },
            (_, index) => FREQUENCY * (index + 1),
          ),
      },
    },
    { kind: "scope", label: "Waveform", source: (s) => s.analyser },
    { kind: "diagram" },
  ],
  diagram: {
    nodes: [
      {
        id: "osc",
        label: "WavetableOscillator",
        kind: "source",
        exposedAs: "osc",
      },
      { id: "filter", label: "Svf", kind: "modifier", exposedAs: "filter" },
      { id: "out", label: "out", kind: "output" },
    ],
    edges: [
      { from: "osc", to: "filter" },
      { from: "filter", to: "out" },
    ],
  },
});
