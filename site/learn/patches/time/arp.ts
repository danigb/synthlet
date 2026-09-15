/*
 * The patch that plays itself.
 *
 * A clock, a set of notes and a voice, and nothing else: no sequence, no
 * scheduler, no note events. `Arp` takes a trigger and emits a *frequency* -
 * MIDI in, hertz out - so its output goes straight into an oscillator and
 * needs nothing on the main thread to interpret it. Every arpeggiator most
 * people have used emits note messages for something else to turn into pitch;
 * this one has no note-event tier underneath it at all, which is exactly what
 * lets the whole figure live in the audio graph.
 *
 * The keyboard transposes `baseNote` without restarting anything: the
 * traversal's position lives in the worklet, so a new root arrives at the next
 * step and the pattern keeps walking.
 */

import {
  Arp,
  ArpMode,
  Clock,
  Compound,
  Gain,
  MonoSynth,
  Scale,
  toMidi,
} from "synthlet";
import { definePatch } from "../define";

const BPM = 140;
const BASE_NOTE = toMidi("C3");
const OCTAVES = 2;

/** `ArpMode` in enum order, so the select writes the member by its position. */
const MODES = [
  "Up",
  "Down",
  "Up and down",
  "Up and down, inclusive",
  "Random",
  "Random, no repeats",
];

/**
 * Eight scales, as `[label, mask]`.
 *
 * A scale is a 12-bit pitch-class mask - 1193, 1453, 2741 - and the kit's
 * select writes the option's *index*. The two cannot meet without an accessor,
 * which is what `scale` below is. `time/random-arp` uses the same eight, so
 * the two lessons agree about what "Dorian" means.
 */
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

const LEVEL = 0.125;

function build(ac: AudioContext) {
  const clock = Clock(ac, { bpm: BPM, pulseWidth: 0.3 });

  const arp = Arp(ac, {
    trigger: clock.gate,
    baseNote: BASE_NOTE,
    scale: SCALES[0][1],
    octaves: OCTAVES,
    mode: ArpMode.Up,
  });

  // The frequency is *driven*, not written: a node connected through a
  // factory's options zeroes that parameter and sums the node onto it, so the
  // arpeggiator owns the pitch and the synth's own `frequency` is out of the
  // way. The same clock gate opens the amplifier.
  const synth = MonoSynth(ac, {
    frequency: arp,
    gate: clock.gate,
    amp: { attack: 0.005, decay: 0.15, sustain: 0, release: 0.1 },
    filter: { frequency: 2500 },
  });

  const analyser = ac.createAnalyser();
  analyser.fftSize = 4096;
  analyser.smoothingTimeConstant = 0.6;

  const level = Gain.val(ac, LEVEL);
  const out = Gain.val(ac, 0);
  synth.connect(analyser).connect(level).connect(out);

  let scaleIndex = 0;
  const scale = {
    get value() {
      return scaleIndex;
    },
    set value(next: number) {
      scaleIndex = Math.min(SCALES.length - 1, Math.max(0, Math.round(next)));
      arp.scale.value = SCALES[scaleIndex][1];
    },
  };

  return Compound({
    output: out,
    owns: [clock, arp, synth, analyser, level],
    exposes: { clock, arp, synth, analyser, scale },
  });
}

export default definePatch({
  id: "time/arp",
  label: "An arpeggiator in the graph",
  build,
  controls: [
    {
      id: "mode",
      kind: "select",
      label: "Mode",
      help: "The order the set is walked in.",
      param: (s) => s.arp.mode,
      options: MODES,
      default: ArpMode.Up,
    },
    {
      id: "scale",
      kind: "select",
      label: "Scale",
      help: "The set of notes. A chord is a short scale.",
      param: (s) => s.scale,
      options: SCALES.map(([label]) => label),
      default: 0,
    },
    {
      id: "octaves",
      kind: "slider",
      label: "Octaves",
      help: "How far the sequence climbs before it starts again.",
      param: (s) => s.arp.octaves,
      min: 1,
      max: 4,
      step: 1,
      default: OCTAVES,
    },
    {
      id: "baseNote",
      kind: "slider",
      label: "Root",
      help: "The MIDI note the scale is built on. The keys write it too.",
      param: (s) => s.arp.baseNote,
      min: 36,
      max: 72,
      step: 1,
      default: BASE_NOTE,
    },
    {
      id: "bpm",
      kind: "slider",
      label: "Tempo",
      param: (s) => s.clock.bpm,
      min: 60,
      max: 300,
      step: 1,
      unit: "bpm",
      default: BPM,
    },
  ],
  views: [
    {
      kind: "keyboard",
      label: "Transpose",
      options: { from: "C2", octaves: 3 },
      noteOn: (s) => (note) => {
        s.arp.baseNote.value = toMidi(note);
      },
      // Nothing to release: the key moves a root, it does not hold a note.
      noteOff: () => () => {},
    },
    { kind: "meter", label: "Output", options: { show: ["peak"] } },
    { kind: "diagram" },
  ],
  /*
   * One chain and two controllers.
   *
   * `arp` is declared before `clock` on purpose: a controller takes the column
   * of the first box it feeds, resolved in declaration order, so naming the
   * arpeggiator first puts it under the synth and leaves the clock beside it
   * rather than the other way round.
   */
  diagram: {
    nodes: [
      { id: "synth", label: "MonoSynth", kind: "source", exposedAs: "synth" },
      { id: "out", label: "out", kind: "output" },
      {
        id: "arp",
        label: "Arp",
        kind: "controller",
        exposedAs: "arp",
        controls: ["mode", "scale", "octaves", "baseNote"],
      },
      {
        id: "clock",
        label: "Clock",
        kind: "controller",
        exposedAs: "clock",
        controls: ["bpm"],
      },
    ],
    edges: [
      { from: "synth", to: "out" },
      { from: "arp", to: "synth", param: "frequency" },
      { from: "clock", to: "synth", param: "gate" },
      { from: "clock", to: "arp", param: "trigger" },
    ],
  },
});
