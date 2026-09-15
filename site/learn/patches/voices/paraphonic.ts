/*
 * Four oscillators, two ways.
 *
 * Part 20's distinction, built twice from the same parts so that the only
 * difference between the two arms is *where the filter and the envelope sit*.
 * Paraphonic: four oscillators, one filter, one envelope. Polyphonic: four
 * complete voices. Same waveform, same cutoff, same ADSR numbers, so nothing
 * else can be blamed for the difference.
 *
 * What you hear is the one thing a paraphonic instrument cannot do. Hold a
 * note, then add a second: the second note arrives at whatever the shared
 * envelope has already reached, so it has no attack of its own. Let one of them
 * go and both stop, because there is one gate. That is a Polymoog, an
 * Opus 3, a Korg Poly-800 - and it is why they are described as string
 * machines rather than as polysynths.
 *
 * `Instrument` is the polyphonic arm as a module, and it is what 7.3 is about;
 * it is hand-rolled here so the comparison stays about architecture.
 */

import {
  AdsrAmp,
  Compound,
  Gain,
  Param,
  PolyblepOscillator,
  PolyblepOscillatorType,
  Svf,
  SvfType,
  toFrequency,
  toMidi,
} from "synthlet";
import { definePatch, type ValueRef } from "../define";

const SLOTS = 4;
const START_NOTE = "C3";

const CUTOFF = 1400;
const RESONANCE = 2;

const ATTACK = 0.15;
const DECAY = 0.2;
const SUSTAIN = 0.7;
const RELEASE = 0.4;

const CROSSFADE = 0.01;
const LEVEL = 0.125;

function build(ac: AudioContext) {
  const start = toFrequency(toMidi(START_NOTE));
  const mix = Gain.val(ac, 1);

  // The paraphonic arm: four oscillators, one of everything else.
  const paraOscs = Array.from({ length: SLOTS }, () =>
    PolyblepOscillator(ac, {
      type: PolyblepOscillatorType.Sawtooth,
      frequency: start,
    }),
  );
  const paraMix = Gain.val(ac, 1 / SLOTS);
  paraOscs.forEach((osc) => osc.connect(paraMix));
  const paraFilter = Svf(ac, {
    type: SvfType.LowPass,
    frequency: CUTOFF,
    Q: RESONANCE,
  });
  const paraGate = Param.input(ac, 0);
  const paraAmp = AdsrAmp(ac, {
    gate: paraGate,
    attack: ATTACK,
    decay: DECAY,
    sustain: SUSTAIN,
    release: RELEASE,
  });
  const paraVca = Gain.val(ac, 1);
  paraMix.connect(paraFilter).connect(paraAmp).connect(paraVca).connect(mix);

  // The polyphonic arm: the same three modules, four times, each with its own
  // gate. Nothing else about the sound is different.
  const polyOscs = Array.from({ length: SLOTS }, () =>
    PolyblepOscillator(ac, {
      type: PolyblepOscillatorType.Sawtooth,
      frequency: start,
    }),
  );
  const polyGates = Array.from({ length: SLOTS }, () => Param.input(ac, 0));
  const polyFilters = polyOscs.map(() =>
    Svf(ac, { type: SvfType.LowPass, frequency: CUTOFF, Q: RESONANCE }),
  );
  const polyAmps = polyGates.map((gate) =>
    AdsrAmp(ac, {
      gate,
      attack: ATTACK,
      decay: DECAY,
      sustain: SUSTAIN,
      release: RELEASE,
    }),
  );
  const polyMix = Gain.val(ac, 1 / SLOTS);
  polyOscs.forEach((osc, i) => {
    osc.connect(polyFilters[i]).connect(polyAmps[i]).connect(polyMix);
  });
  const polyVca = Gain.val(ac, 0);
  polyMix.connect(polyVca).connect(mix);

  const analyser = ac.createAnalyser();
  analyser.fftSize = 4096;
  analyser.smoothingTimeConstant = 0.6;

  const level = Gain.val(ac, LEVEL);
  const out = Gain.val(ac, 0);
  mix.connect(analyser).connect(level).connect(out);

  // Allocation is four slots and a round of looking for a free one, which is
  // the whole of what a voice allocator does before it has to steal.
  const held: (string | null)[] = Array.from({ length: SLOTS }, () => null);
  const keys = {
    on(note: string) {
      let slot = held.indexOf(null);
      if (slot === -1) slot = 0;
      held[slot] = note;
      const hz = toFrequency(toMidi(note));
      const now = ac.currentTime;
      paraOscs[slot].frequency.setValueAtTime(hz, now);
      polyOscs[slot].frequency.setValueAtTime(hz, now);
      polyGates[slot].input.value = 1;
      // Already 1 if any key is down, and that is the lesson: the second note
      // finds the shared envelope wherever the first one left it.
      paraGate.input.value = 1;
    },
    off(note: string) {
      const slot = held.indexOf(note);
      if (slot === -1) return;
      held[slot] = null;
      polyGates[slot].input.value = 0;
      if (held.every((entry) => entry === null)) paraGate.input.value = 0;
    },
  };

  let mode = 0;
  const modeRef: ValueRef = {
    get value() {
      return mode;
    },
    set value(next: number) {
      mode = next > 0.5 ? 1 : 0;
      const now = ac.currentTime;
      paraVca.gain.setTargetAtTime(mode === 0 ? 1 : 0, now, CROSSFADE);
      polyVca.gain.setTargetAtTime(mode === 1 ? 1 : 0, now, CROSSFADE);
    },
  };

  const amps = [paraAmp, ...polyAmps];

  const attack: ValueRef = {
    get value() {
      return paraAmp.attack.value;
    },
    set value(next: number) {
      for (const amp of amps) amp.attack.value = next;
    },
  };

  const release: ValueRef = {
    get value() {
      return paraAmp.release.value;
    },
    set value(next: number) {
      for (const amp of amps) amp.release.value = next;
    },
  };

  return Compound({
    output: out,
    owns: [
      ...paraOscs,
      paraMix,
      paraFilter,
      paraGate,
      paraAmp,
      paraVca,
      ...polyOscs,
      ...polyGates,
      ...polyFilters,
      ...polyAmps,
      polyMix,
      polyVca,
      mix,
      analyser,
      level,
    ],
    exposes: {
      // Named one at a time as well as as a list, because the diagram's one
      // oscillator box is all four of them.
      paraOscA: paraOscs[0],
      paraOscB: paraOscs[1],
      paraOscC: paraOscs[2],
      paraOscD: paraOscs[3],
      paraFilter,
      paraAmp,
      polyOscs,
      polyAmps,
      analyser,
      keys,
      mode: modeRef,
      attack,
      release,
    },
  });
}

export default definePatch({
  id: "voices/paraphonic",
  label: "Polyphonic or paraphonic",
  build,
  controls: [
    {
      id: "mode",
      kind: "select",
      label: "Architecture",
      help: "Where the filter and the envelope sit. Nothing else changes.",
      param: (s) => s.mode,
      options: ["Paraphonic", "Polyphonic"],
      default: 0,
    },
    {
      id: "attack",
      kind: "slider",
      label: "Attack",
      help: "Long enough to hear which notes get one and which do not.",
      param: (s) => s.attack,
      min: 0,
      max: 1,
      scale: "time",
      unit: "s",
      default: ATTACK,
    },
    {
      id: "release",
      kind: "slider",
      label: "Release",
      param: (s) => s.release,
      min: 0,
      max: 2,
      scale: "time",
      unit: "s",
      default: RELEASE,
    },
  ],
  views: [
    {
      kind: "keyboard",
      label: "Keyboard",
      options: { from: "C3", octaves: 2 },
      noteOn: (s) => (note) => {
        s.keys.on(note);
      },
      noteOff: (s) => (note) => {
        s.keys.off(note);
      },
    },
    { kind: "meter", label: "Output", options: { show: ["peak"] } },
    { kind: "diagram" },
  ],
  /*
   * The paraphonic arm, which is the arm the lesson is about.
   *
   * The four oscillators are one box: four audio cables into one mix is the
   * collision the layout cannot draw (ticket `11c`), and `exposedAs` naming all
   * four is the honest way to say so.
   */
  diagram: {
    nodes: [
      {
        id: "osc",
        label: "PolyblepOscillator",
        kind: "source",
        exposedAs: ["paraOscA", "paraOscB", "paraOscC", "paraOscD"],
      },
      { id: "filter", label: "Svf", kind: "modifier", exposedAs: "paraFilter" },
      {
        id: "amp",
        label: "AdsrAmp",
        kind: "modifier",
        exposedAs: "paraAmp",
        controls: ["attack", "release"],
      },
      { id: "out", label: "out", kind: "output" },
      { id: "keys", label: "keys", kind: "controller" },
    ],
    edges: [
      { from: "osc", to: "filter" },
      { from: "filter", to: "amp" },
      { from: "amp", to: "out" },
      { from: "keys", to: "osc", param: "frequency" },
      { from: "keys", to: "amp", param: "gate" },
    ],
  },
});
