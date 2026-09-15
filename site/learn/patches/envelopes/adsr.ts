/*
 * One oscillator, one envelope, and the four numbers that turn a tone into a
 * note.
 *
 * Chapter 1 ended on a stationary tone, which Reid calls musically
 * uninteresting for the obvious reason: nothing that begins and ends is
 * stationary. This is the smallest thing that begins and ends - a sawtooth
 * whose loudness is a contour, and a key that starts the contour and tells it
 * when to leave. Three lessons share this one patch and reveal one more slider
 * each, so the reader watches the same synth grow a knob rather than meeting
 * three different widgets.
 */

import {
  AdsrAmp,
  Compound,
  Gain,
  PolyblepOscillator,
  PolyblepOscillatorType,
  toFrequency,
  toMidi,
} from "synthlet";
import { definePatch } from "../define";

/** The trim chapter 1's patches use: full scale is painful in headphones. */
const LEVEL = 0.125;

/** Where the keyboard starts, and so where the oscillator starts. */
const FIRST_NOTE = "C3";

const ATTACK = 0.01;
const DECAY = 0.2;
const SUSTAIN = 0.7;
const RELEASE = 0.3;

function build(ac: AudioContext) {
  const osc = PolyblepOscillator(ac, {
    type: PolyblepOscillatorType.Sawtooth,
    frequency: toFrequency(toMidi(FIRST_NOTE)),
  });
  const amp = AdsrAmp(ac, {
    attack: ATTACK,
    decay: DECAY,
    sustain: SUSTAIN,
    release: RELEASE,
  });

  const analyser = ac.createAnalyser();
  // Short window and little smoothing: the scope here is drawing a contour out
  // of peak readings, so what it wants is a fast, honest peak.
  analyser.fftSize = 2048;
  analyser.smoothingTimeConstant = 0.2;

  // The trim is after the analyser, so the picture is of the envelope and the
  // level is only what reaches the ears. Last and at zero, as every patch ends.
  const level = Gain.val(ac, LEVEL);
  const out = Gain.val(ac, 0);
  osc.connect(amp).connect(analyser).connect(level).connect(out);

  /*
   * The smallest monosynth there is.
   *
   * One gate, high while any key is down, and the last key pressed owns the
   * pitch. Pressing a second key without releasing the first therefore does
   * *not* restart the contour - the gate never fell, so there was no edge to
   * see. That is the Minimoog's behaviour and it is deliberate here: lesson 2.5
   * is the page where it becomes the subject, on a patch that can do both.
   */
  const held = new Set<string>();
  const keys = {
    on(note: string) {
      held.add(note);
      osc.frequency.value = toFrequency(toMidi(note));
      amp.gate.value = 1;
    },
    off(note: string) {
      held.delete(note);
      if (held.size === 0) amp.gate.value = 0;
    },
  };

  return Compound({
    output: out,
    owns: [osc, amp, analyser, level],
    exposes: { osc, amp, analyser, keys },
  });
}

export default definePatch({
  id: "envelopes/adsr",
  label: "One note, shaped",
  build,
  controls: [
    {
      id: "attack",
      kind: "slider",
      label: "Attack",
      help: "How long the note takes to reach full loudness.",
      param: (s) => s.amp.attack,
      min: 0,
      max: 2,
      scale: "time",
      unit: "s",
      default: ATTACK,
    },
    {
      id: "decay",
      kind: "slider",
      label: "Decay",
      help: "How long it takes to fall from full loudness to the sustain.",
      param: (s) => s.amp.decay,
      min: 0,
      max: 2,
      scale: "time",
      unit: "s",
      default: DECAY,
    },
    {
      id: "sustain",
      kind: "slider",
      label: "Sustain",
      help: "The level the note holds while the key is down. A level, not a time.",
      param: (s) => s.amp.sustain,
      min: 0,
      max: 1,
      default: SUSTAIN,
    },
    {
      id: "release",
      kind: "slider",
      label: "Release",
      help: "How long the note takes to fall to silence after the key comes up.",
      param: (s) => s.amp.release,
      min: 0,
      max: 3,
      scale: "time",
      unit: "s",
      default: RELEASE,
    },
  ],
  views: [
    // Keys as a view rather than a control: `show` filters controls, and lesson
    // 2.1 narrows this widget down to one slider and still has to be playable.
    {
      kind: "keyboard",
      label: "Keyboard",
      noteOn: (s) => (note) => s.keys.on(note),
      noteOff: (s) => (note) => s.keys.off(note),
    },
    // The contour window, not the waveform: three seconds of peak history is
    // the shape the four sliders are drawing, and a few cycles of a sawtooth
    // is not.
    {
      kind: "scope",
      label: "Contour",
      source: (s) => s.analyser,
      options: { window: "contour", seconds: 3 },
    },
    { kind: "diagram" },
  ],
  /*
   * Reid's Figure 6: a tone generator, an amplifier, and the contour generator
   * that tells the amplifier what to do - except that in this library the
   * amplifier and the contour generator are one module, so the cable from the
   * keys arrives at `AdsrAmp`'s own gate.
   */
  diagram: {
    nodes: [
      {
        id: "osc",
        label: "PolyblepOscillator",
        kind: "source",
        exposedAs: "osc",
      },
      {
        id: "amp",
        label: "AdsrAmp",
        kind: "modifier",
        exposedAs: "amp",
        controls: ["attack", "decay", "sustain", "release"],
      },
      { id: "out", label: "out", kind: "output" },
      { id: "keys", label: "keyboard", kind: "controller" },
    ],
    edges: [
      { from: "osc", to: "amp" },
      { from: "amp", to: "out" },
      { from: "keys", to: "amp", param: "gate" },
    ],
  },
});
