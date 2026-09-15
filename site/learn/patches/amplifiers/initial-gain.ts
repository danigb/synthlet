/*
 * The slider on an ARP that makes the synth refuse to stop.
 *
 * An Odyssey and a 2600 both have a control marked Initial Gain, and all it
 * does is add a steady voltage to whatever the contour generator is sending the
 * amplifier. Above zero the amplifier is always being told to produce some
 * gain, so - as Reid puts it - the synth produces sound continuously until it
 * is switched off.
 *
 * The steady voltage here is a `Param` with nothing on its input and a number
 * on its offset, summed onto the same `AudioParam` the envelope arrives at,
 * because an `AudioParam` adds up everything connected to it. That is the whole
 * patch.
 */

import {
  AdsrEnv,
  Compound,
  Gain,
  Param,
  PolyblepOscillator,
  PolyblepOscillatorType,
  toFrequency,
  toMidi,
} from "synthlet";
import { definePatch } from "../define";

const LEVEL = 0.125;
const FIRST_NOTE = "C3";

function build(ac: AudioContext) {
  const osc = PolyblepOscillator(ac, {
    type: PolyblepOscillatorType.Sawtooth,
    frequency: toFrequency(toMidi(FIRST_NOTE)),
  });

  // The amplifier, at zero: everything it does arrives on a cable.
  const vca = Gain.val(ac, 0);

  const env = AdsrEnv(ac, {
    attack: 0.01,
    decay: 0.3,
    sustain: 0.6,
    release: 0.4,
  });
  env.connect(vca.gain);

  const initial = Param(ac);
  initial.connect(vca.gain);

  const analyser = ac.createAnalyser();
  analyser.fftSize = 2048;
  analyser.smoothingTimeConstant = 0.2;
  const level = Gain.val(ac, LEVEL);
  const out = Gain.val(ac, 0);
  osc.connect(vca).connect(analyser).connect(level).connect(out);

  const held = new Set<string>();
  const keys = {
    on(note: string) {
      held.add(note);
      osc.frequency.value = toFrequency(toMidi(note));
      env.gate.value = 1;
    },
    off(note: string) {
      held.delete(note);
      if (held.size === 0) env.gate.value = 0;
    },
  };

  return Compound({
    output: out,
    owns: [osc, vca, env, initial, analyser, level],
    exposes: { osc, vca, env, initial, analyser, keys },
  });
}

export default definePatch({
  id: "amplifiers/initial-gain",
  label: "Initial gain",
  build,
  controls: [
    {
      id: "initial",
      kind: "slider",
      label: "Initial gain",
      help: "A steady voltage added to the contour. Above zero the note has no end.",
      param: (s) => s.initial.offset,
      min: 0,
      max: 1,
      default: 0,
    },
  ],
  views: [
    {
      kind: "keyboard",
      label: "Keyboard",
      noteOn: (s) => (note) => s.keys.on(note),
      noteOff: (s) => (note) => s.keys.off(note),
    },
    {
      kind: "scope",
      label: "Contour",
      source: (s) => s.analyser,
      options: { window: "contour", seconds: 3 },
    },
  ],
});
