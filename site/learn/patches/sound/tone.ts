/*
 * One oscillator, and the three things you can do to it.
 *
 * Pitch, loudness and timbre are the three qualities every book on synthesis
 * opens with, and they sit on one widget here because they are independent:
 * the frequency knob moves the partials apart, the volume knob moves the whole
 * picture up and down, and the waveform list decides how many partials there
 * are to move. Nothing shapes anything over time yet - that is chapter 2 - so
 * what is left is the stationary tone Reid calls musically uninteresting,
 * which is exactly what makes it easy to hear one thing at a time.
 */

import {
  Compound,
  Gain,
  PolyblepOscillator,
  PolyblepOscillatorType,
} from "synthlet";
import { definePatch } from "../define";

/** Low enough that the first eight partials spread across the spectrum. */
const FREQUENCY = 220;
const PARTIALS = 8;

/** A `db` control writes a gain, so its default is one: about -18 dB. */
const LEVEL = 0.125;

/** `PolyblepOscillatorType`'s order, which is the index the param receives. */
const WAVEFORMS = ["Sine", "Triangle", "Sawtooth", "Square"];

function build(ac: AudioContext) {
  const osc = PolyblepOscillator(ac, {
    type: PolyblepOscillatorType.Sawtooth,
    frequency: FREQUENCY,
  });
  // The volume knob's own gain, and not the output gain below: the kit ramps
  // that one on Play, and the two would fight over one param.
  const volume = Gain.val(ac, LEVEL);
  const analyser = ac.createAnalyser();
  analyser.fftSize = 4096;
  analyser.smoothingTimeConstant = 0.6;
  // Last and at zero; the analyser is before it, so a silent widget draws.
  const out = Gain.val(ac, 0);
  osc.connect(volume).connect(analyser).connect(out);

  return Compound({
    output: out,
    owns: [osc, volume, analyser],
    exposes: { osc, volume, analyser },
  });
}

export default definePatch({
  id: "sound/tone",
  label: "One oscillator",
  build,
  controls: [
    {
      id: "frequency",
      kind: "slider",
      label: "Frequency",
      help: "How fast the wave repeats. It is the pitch you hear.",
      param: (s) => s.osc.frequency,
      min: 20,
      max: 2000,
      scale: "log",
      unit: "Hz",
      default: FREQUENCY,
    },
    {
      id: "volume",
      kind: "slider",
      label: "Volume",
      help: "How far the wave swings. It is the loudness you hear.",
      param: (s) => s.volume.gain,
      min: -60,
      max: 0,
      scale: "db",
      default: LEVEL,
    },
    {
      id: "waveform",
      kind: "select",
      label: "Waveform",
      help: "Which partials are present, and how loud each one is.",
      param: (s) => s.osc.type,
      options: WAVEFORMS,
      default: PolyblepOscillatorType.Sawtooth,
    },
  ],
  views: [
    {
      kind: "scope",
      label: "Waveform",
      source: (s) => s.analyser,
    },
    {
      kind: "spectrum",
      label: "Partials",
      source: (s) => s.analyser,
      // The prediction: the nth partial is at n times the fundamental. The
      // marks follow the frequency knob, and which of them a peak actually
      // stands under is what the waveform list changes.
      options: {
        minDb: -100,
        maxDb: -10,
        marks: (s) =>
          Array.from(
            { length: PARTIALS },
            (_, index) => s.osc.frequency.value * (index + 1),
          ),
      },
    },
    { kind: "diagram" },
  ],
  diagram: {
    nodes: [
      {
        id: "osc",
        label: "PolyblepOscillator",
        kind: "source",
        exposedAs: "osc",
        controls: ["frequency", "waveform"],
      },
      // `volume` is an exposes key *and* a control id, so the knob finds this
      // box on its own and nothing declares the tie twice.
      { id: "volume", label: "Gain", kind: "modifier", exposedAs: "volume" },
      { id: "out", label: "out", kind: "output" },
    ],
    edges: [
      { from: "osc", to: "volume" },
      { from: "volume", to: "out" },
    ],
  },
});
