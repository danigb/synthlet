/*
 * Portamento, in two units, so you can hear that the unit matters.
 *
 * A slew limiter is a low-pass filter for control voltages: it will not let its
 * output move faster than `rise` going up or `fall` coming down. Point one at a
 * stepped pitch and the steps become glides; make `rise` long and `fall` short
 * and a square input comes out as a shark's tooth, which is a shape no envelope
 * generator in the library produces and which two numbers here do.
 *
 * The two arms are the lesson. One key press writes both targets at once - the
 * interval in cents, and the same interval in hertz - and only the live arm is
 * heard. A glide in cents is even, because pitch is logarithmic and cents are
 * its units. A glide in hertz spends most of its travel near the top of the
 * interval, because the same number of hertz is a smaller and smaller musical
 * distance the higher you go. The module's README calls this its pitch caveat;
 * this page is it, switchable.
 */

import {
  Compound,
  Gain,
  Param,
  PolyblepOscillator,
  PolyblepOscillatorType,
  SlewLimiter,
  SlewType,
  toFrequency,
  toMidi,
} from "synthlet";
import { definePatch, type ValueRef } from "../define";

/** Where both arms measure their interval from. */
const REF_MIDI = toMidi("C3");
const REF_HZ = toFrequency(REF_MIDI);

const GLIDE = 0.2;
const FALL = 0.2;

/** Long enough to cover a switch, short enough to hear as no gap. */
const CROSSFADE = 0.01;

const LEVEL = 0.125;

function build(ac: AudioContext) {
  // A *number*, not a node. A parameter given a number keeps it and sums
  // whatever is connected on top; a parameter given a node is zeroed first, and
  // an oscillator at 0 Hz plus a deviation is not a note.
  const osc = PolyblepOscillator(ac, {
    type: PolyblepOscillatorType.Sawtooth,
    frequency: REF_HZ,
  });

  // The cents arm: the interval as a detune, which is the musical unit.
  const centsTarget = Param.input(ac, 0);
  const centsSlew = SlewLimiter(ac, {
    type: SlewType.Exponential,
    rise: GLIDE,
    fall: FALL,
  });
  const centsVca = Gain.val(ac, 1);
  centsTarget.connect(centsSlew).connect(centsVca).connect(osc.detune);

  // The hertz arm: the same interval as a frequency deviation, which is what a
  // voltage-controlled oscillator with a linear input would give you.
  const hzTarget = Param.input(ac, 0);
  const hzSlew = SlewLimiter(ac, {
    type: SlewType.Exponential,
    rise: GLIDE,
    fall: FALL,
  });
  const hzVca = Gain.val(ac, 0);
  hzTarget.connect(hzSlew).connect(hzVca).connect(osc.frequency);

  const analyser = ac.createAnalyser();
  analyser.fftSize = 4096;
  analyser.smoothingTimeConstant = 0.6;

  // Both arms into one scope. The muted one contributes exactly zero and the
  // scope scales to whatever it is handed, so one trace is always the shape of
  // whichever unit is live - however many hertz or cents that happens to be.
  const cvAnalyser = ac.createAnalyser();
  cvAnalyser.fftSize = 32768;
  centsVca.connect(cvAnalyser);
  hzVca.connect(cvAnalyser);

  const level = Gain.val(ac, LEVEL);
  const out = Gain.val(ac, 0);
  osc.connect(analyser).connect(level).connect(out);

  let glide = GLIDE;
  let fall = FALL;
  let type: number = SlewType.Exponential;
  let unit = 0;

  const glideRef: ValueRef = {
    get value() {
      return glide;
    },
    set value(next: number) {
      glide = Math.min(2, Math.max(0, next));
      centsSlew.rise.value = glide;
      hzSlew.rise.value = glide;
    },
  };

  const fallRef: ValueRef = {
    get value() {
      return fall;
    },
    set value(next: number) {
      fall = Math.min(2, Math.max(0, next));
      centsSlew.fall.value = fall;
      hzSlew.fall.value = fall;
    },
  };

  const typeRef: ValueRef = {
    get value() {
      return type;
    },
    set value(next: number) {
      type = next > 0.5 ? SlewType.Linear : SlewType.Exponential;
      centsSlew.type.value = type;
      hzSlew.type.value = type;
    },
  };

  const unitRef: ValueRef = {
    get value() {
      return unit;
    },
    set value(next: number) {
      unit = next > 0.5 ? 1 : 0;
      centsVca.gain.setTargetAtTime(
        unit === 0 ? 1 : 0,
        ac.currentTime,
        CROSSFADE,
      );
      hzVca.gain.setTargetAtTime(unit === 1 ? 1 : 0, ac.currentTime, CROSSFADE);
    },
  };

  // One press writes both targets, so the two arms never disagree and the
  // toggle is instant rather than a re-arming.
  const keys = {
    on(note: string) {
      const midi = toMidi(note);
      centsTarget.input.value = (midi - REF_MIDI) * 100;
      hzTarget.input.value = toFrequency(midi) - REF_HZ;
    },
  };

  return Compound({
    output: out,
    owns: [
      osc,
      centsTarget,
      centsSlew,
      centsVca,
      hzTarget,
      hzSlew,
      hzVca,
      analyser,
      cvAnalyser,
      level,
    ],
    exposes: {
      osc,
      centsSlew,
      hzSlew,
      analyser,
      cvAnalyser,
      keys,
      glide: glideRef,
      fall: fallRef,
      type: typeRef,
      unit: unitRef,
    },
  });
}

export default definePatch({
  id: "time/slew",
  label: "Glide and slew",
  build,
  controls: [
    {
      id: "glide",
      kind: "slider",
      label: "Rise",
      help: "How long an upward move takes.",
      param: (s) => s.glide,
      min: 0,
      max: 2,
      scale: "time",
      unit: "s",
      default: GLIDE,
    },
    {
      id: "fall",
      kind: "slider",
      label: "Fall",
      help: "How long a downward move takes. Different is the point.",
      param: (s) => s.fall,
      min: 0,
      max: 2,
      scale: "time",
      unit: "s",
      default: FALL,
    },
    {
      id: "type",
      kind: "toggle",
      label: "Linear",
      help: "Off is exponential - a capacitor charging. On is a ramp.",
      param: (s) => s.type,
      default: SlewType.Exponential,
    },
    {
      id: "unit",
      kind: "toggle",
      label: "Glide in hertz",
      help: "Off glides in cents. On glides in hertz, which is lopsided.",
      param: (s) => s.unit,
      default: 0,
    },
  ],
  views: [
    {
      kind: "keyboard",
      label: "Keyboard",
      options: { from: "C2", octaves: 2 },
      noteOn: (s) => (note) => {
        s.keys.on(note);
      },
      // The pitch stays where the last key put it: there is nothing to release,
      // and a release would be a glide back to nowhere.
      noteOff: () => () => {},
    },
    {
      kind: "scope",
      label: "The control voltage",
      source: (s) => s.cvAnalyser,
    },
  ],
  // No diagram: two control chains arriving on one oscillator is the shape the
  // layout cannot draw (ticket `11c`).
});
