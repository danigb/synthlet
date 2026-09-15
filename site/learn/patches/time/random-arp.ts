/*
 * Reid's random arpeggiator, module for module.
 *
 * Part 16 builds it out of four things: a clock, a noise source, a sample and
 * hold, and - the piece that makes it music rather than burble - a quantiser.
 * The held voltage is a uniform random number; scaled and offset it is a
 * fractional MIDI note somewhere around middle C; snapped to a scale it is a
 * note somebody could have played.
 *
 * `Quantizer` is semitones in and hertz out, so its output goes straight into
 * an oscillator's frequency. The second quantiser is the same decision asked
 * for in the other unit: `QuantizerOutput.Note` emits note *numbers*, which is
 * what the scope is drawing. One extra worklet, for the only picture that shows
 * what this lesson claims - the staircase snapping to the scale, and changing
 * shape when the scale does.
 *
 * A scale is a 12-bit pitch-class mask (1193, 1453, 2741) and the kit's select
 * writes an index, so `scale` and `root` are accessors: they each have two
 * quantisers to keep in step, and the mask is a set rather than a position.
 */

import {
  AdAmp,
  Clock,
  Compound,
  Gain,
  Noise,
  NoiseType,
  Param,
  PolyblepOscillator,
  PolyblepOscillatorType,
  Quantizer,
  QuantizerOutput,
  SampleHold,
  SampleHoldType,
  Scale,
  Svf,
  SvfType,
  toMidi,
} from "synthlet";
import { definePatch, type ValueRef } from "../define";

const BPM = 220;
/** Semitones either side of the centre note. */
const RANGE = 12;
const CENTRE = 60;

/** The same eight as `time/arp`, so the two lessons agree. */
const SCALES: [string, number][] = [
  ["Pentatonic minor", Scale.PentatonicMinor],
  ["Minor", Scale.Minor],
  ["Major", Scale.Major],
  ["Dorian", Scale.Dorian],
  ["Blues", Scale.Blues],
  ["Whole tone", Scale.WholeTone],
  ["Triad minor", Scale.TriadMinor],
  ["Triad major", Scale.TriadMajor],
];

/** `root` is a pitch class, 0-11, so a twelve-name select maps by position. */
const ROOTS = ["C", "C♯", "D", "E♭", "E", "F", "F♯", "G", "A♭", "A", "B♭", "B"];

const LEVEL = 0.125;

function build(ac: AudioContext) {
  const clock = Clock(ac, { bpm: BPM, pulseWidth: 0.15 });

  // `clock.gate`, not the clock node: the node is a rising phase ramp, which
  // never falls, so it would sample once and latch forever.
  const noise = Noise(ac, { type: NoiseType.White });
  const sh = SampleHold(ac, {
    type: SampleHoldType.SampleHold,
    trigger: clock.gate,
  });
  noise.connect(sh);

  // -1…1 becomes a fractional note number two octaves wide around middle C.
  const notes = Param(ac, { input: sh, gain: RANGE, offset: CENTRE });

  const pitch = Quantizer(ac, {
    input: notes,
    scale: SCALES[0][1],
    root: 0,
    hysteresis: 0,
    output: QuantizerOutput.Hz,
  });

  const osc = PolyblepOscillator(ac, {
    type: PolyblepOscillatorType.Sawtooth,
    frequency: pitch,
  });
  const filter = Svf(ac, {
    type: SvfType.LowPass,
    frequency: 2600,
    Q: 2,
  });
  const amp = AdAmp(ac, { trigger: clock.gate, attack: 0.004, decay: 0.2 });
  osc.connect(filter).connect(amp);

  // The same snap, in note numbers, purely so the scope can draw it.
  const cv = Quantizer(ac, {
    input: notes,
    scale: SCALES[0][1],
    root: 0,
    hysteresis: 0,
    output: QuantizerOutput.Note,
  });
  const cvAnalyser = ac.createAnalyser();
  cvAnalyser.fftSize = 32768;
  cv.connect(cvAnalyser);

  const analyser = ac.createAnalyser();
  analyser.fftSize = 4096;
  analyser.smoothingTimeConstant = 0.6;

  const level = Gain.val(ac, LEVEL);
  const out = Gain.val(ac, 0);
  amp.connect(analyser).connect(level).connect(out);

  let scaleIndex = 0;
  const scale: ValueRef = {
    get value() {
      return scaleIndex;
    },
    set value(next: number) {
      scaleIndex = Math.min(SCALES.length - 1, Math.max(0, Math.round(next)));
      pitch.scale.value = SCALES[scaleIndex][1];
      cv.scale.value = SCALES[scaleIndex][1];
    },
  };

  let rootIndex = 0;
  const root: ValueRef = {
    get value() {
      return rootIndex;
    },
    set value(next: number) {
      rootIndex = Math.min(11, Math.max(0, Math.round(next)));
      pitch.root.value = rootIndex;
      cv.root.value = rootIndex;
    },
  };

  const range: ValueRef = {
    get value() {
      return notes.gain.value;
    },
    set value(next: number) {
      notes.gain.value = Math.min(24, Math.max(0, Math.round(next)));
    },
  };

  const keys = {
    on(note: string) {
      notes.offset.value = toMidi(note);
    },
  };

  return Compound({
    output: out,
    owns: [
      clock,
      noise,
      sh,
      notes,
      pitch,
      osc,
      filter,
      amp,
      cv,
      analyser,
      cvAnalyser,
      level,
    ],
    exposes: {
      clock,
      noise,
      sh,
      notes,
      pitch,
      osc,
      filter,
      amp,
      cv,
      analyser,
      cvAnalyser,
      keys,
      scale,
      root,
      range,
    },
  });
}

export default definePatch({
  id: "time/random-arp",
  label: "Random, but in key",
  build,
  controls: [
    {
      id: "scale",
      kind: "select",
      label: "Scale",
      help: "The set the random note is snapped into.",
      param: (s) => s.scale,
      options: SCALES.map(([label]) => label),
      default: 0,
    },
    {
      id: "root",
      kind: "select",
      label: "Key",
      help: "The pitch class the scale is measured from.",
      param: (s) => s.root,
      options: ROOTS,
      default: 0,
    },
    {
      id: "rate",
      kind: "slider",
      label: "Rate",
      help: "How often the switch closes on a new voltage.",
      param: (s) => s.clock.bpm,
      min: 60,
      max: 600,
      step: 1,
      unit: "bpm",
      default: BPM,
    },
    {
      id: "range",
      kind: "slider",
      label: "Range",
      help: "How far either side of the centre note the voltage reaches.",
      param: (s) => s.range,
      min: 0,
      max: 24,
      step: 1,
      unit: "st",
      default: RANGE,
    },
  ],
  views: [
    {
      kind: "keyboard",
      label: "Centre note",
      options: { from: "C2", octaves: 3 },
      noteOn: (s) => (note) => {
        s.keys.on(note);
      },
      noteOff: () => () => {},
    },
    { kind: "scope", label: "The note numbers", source: (s) => s.cvAnalyser },
  ],
  // No diagram: noise, sample-and-hold, a scaler and a quantiser are four
  // audio-connected modules in the control path, which is more than one box
  // can honestly be folded into (ticket `11c`).
});
