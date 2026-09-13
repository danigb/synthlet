"use client";

import { useState } from "react";
import {
  AdsrAmp,
  Clock,
  Compound,
  Gain,
  Lfo,
  LfoType,
  Noise,
  NoiseType,
  Param,
  PolyblepOscillator,
  PolyblepOscillatorType,
  Quantizer,
  SampleHold,
  Scale,
} from "synthlet";
import { ExamplePane } from "./components/ExamplePane";
import { Slider } from "./components/Slider";
import { useSynth } from "./useSynth";

// Part 16, Figure 15: noise -> S&H -> programmable scale generator -> VCO.
// Reid calls it "a random arpeggiator - one of my favourite effects", and it is
// the patch the quantizer exists for. Figure 14 is the same graph with a slow
// LFO where the S&H is: a continuous rise becomes a staircase, which is the
// difference between portamento and glissando.
//
// Two sources, both always running, each behind a `Gain` used as a switch: a
// crossfade would be meaningless here because the two are alternatives, and
// connect/disconnect on a toggle is how a widget leaks nodes.
const SCALES = [
  { name: "Pentatonic minor", mask: Scale.PentatonicMinor },
  { name: "Pentatonic major", mask: Scale.PentatonicMajor },
  { name: "Minor", mask: Scale.Minor },
  { name: "Major", mask: Scale.Major },
  { name: "Minor 7th", mask: Scale.Minor7th },
  { name: "Whole tone", mask: Scale.WholeTone },
  { name: "Chromatic", mask: Scale.Chromatic },
];

const ROOTS = ["C", "C♯", "D", "E♭", "E", "F", "F♯", "G", "A♭", "A", "B♭", "B"];

function createSynth(ac: AudioContext) {
  const bpm = Param(ac, { input: 240 });
  const volume = Param.db(ac, -14);

  const clock = Clock(ac, { bpm });
  const noise = Noise(ac, { type: NoiseType.White });
  const sampleHold = SampleHold(ac, { trigger: clock.gate });
  const lfo = Lfo(ac, { type: LfoType.Triangle, frequency: 0.2 });

  const random = Gain(ac, { gain: 1 });
  const sweep = Gain(ac, { gain: 0 });
  noise.connect(sampleHold).connect(random);
  lfo.connect(sweep);

  // Both sources are bipolar, so this is the whole of "what range of notes":
  // [-1, 1] x 12 + 60 is two octaves centred on middle C. Feeding the quantizer
  // is `Param`'s job - the module has no gain or offset of its own, because
  // that would be a second `Param` hidden inside it.
  const notes = Param(ac, { input: 0, gain: 12, offset: 60 });
  random.connect(notes.input);
  sweep.connect(notes.input);

  const pitch = Quantizer(ac, {
    input: notes,
    scale: Scale.PentatonicMinor,
    hysteresis: 0.1,
  });

  // `frequency: 0`, because an `AudioParam` sums its inputs with its intrinsic
  // value: the default 440 would sit under the quantizer's output as a constant
  // offset, and every note would be 440 Hz sharp.
  const osc = PolyblepOscillator(ac, {
    type: PolyblepOscillatorType.Sawtooth,
    frequency: 0,
  });
  pitch.connect(osc.frequency);

  // The same gate that clocks the sample-and-hold plays the note, which is why
  // the quantizer does not need a trigger output of its own.
  const amp = AdsrAmp(ac, {
    gate: clock.gate,
    attack: 0.005,
    decay: 0.15,
    sustain: 0.2,
    release: 0.1,
  });
  const out = Gain(ac, { gain: volume });
  osc.connect(amp).connect(out);

  return Compound({
    output: out,
    owns: [
      clock,
      noise,
      sampleHold,
      lfo,
      random,
      sweep,
      notes,
      pitch,
      osc,
      amp,
      bpm,
      volume,
    ],
    exposes: {
      random,
      sweep,
      pitch,
      bpm: bpm.input,
      volume: volume.input,
    },
  });
}

function Example() {
  const [scale, setScale] = useState(0);
  const [root, setRoot] = useState(0);
  const [quantise, setQuantise] = useState(true);
  const [stepped, setStepped] = useState(true);
  const synth = useSynth(createSynth);
  if (!synth) return null;

  // "Off" is `Chromatic`, which is this module's documented converter mode:
  // every semitone maps to its own frequency and nothing is snapped away. It is
  // the honest bypass for a module whose output is hertz - there is no way to
  // leave the grid entirely and still be in tune. `hysteresis` belongs to its
  // slider alone, so this does not fight it.
  const apply = (on: boolean, mask: number) => {
    synth.pitch.scale.value = on ? mask : Scale.Chromatic;
  };

  return (
    <>
      <div className="flex items-center gap-2 mb-4">
        <button
          className={`border px-2 py-1 rounded ${
            stepped ? "bg-fd-primary text-fd-primary-foreground" : ""
          }`}
          onClick={() => {
            setStepped(true);
            synth.random.gain.value = 1;
            synth.sweep.gain.value = 0;
          }}
        >
          Sample &amp; hold
        </button>
        <button
          className={`border px-2 py-1 rounded ${
            stepped ? "" : "bg-fd-primary text-fd-primary-foreground"
          }`}
          onClick={() => {
            setStepped(false);
            synth.random.gain.value = 0;
            synth.sweep.gain.value = 1;
          }}
        >
          Slow LFO
        </button>
        <span className="text-sm opacity-70">
          {stepped
            ? "Figure 15 — the random arpeggiator"
            : "Figure 14 — a glissando"}
        </span>
      </div>

      <div className="grid grid-cols-4 gap-4 items-center">
        <div>Scale</div>
        <select
          className="col-span-3"
          value={scale}
          onChange={(e) => {
            const next = parseInt(e.target.value);
            setScale(next);
            apply(quantise, SCALES[next].mask);
          }}
        >
          {SCALES.map((s, i) => (
            <option key={s.name} value={i}>
              {s.name}
            </option>
          ))}
        </select>

        <div>Root</div>
        <select
          className="col-span-3"
          value={root}
          onChange={(e) => {
            const next = parseInt(e.target.value);
            setRoot(next);
            synth.pitch.root.value = next;
          }}
        >
          {ROOTS.map((name, i) => (
            <option key={name} value={i}>
              {name}
            </option>
          ))}
        </select>

        <div>Quantise</div>
        <label className="col-span-3 flex items-center gap-2">
          <input
            type="checkbox"
            checked={quantise}
            onChange={(e) => {
              setQuantise(e.target.checked);
              apply(e.target.checked, SCALES[scale].mask);
            }}
          />
          <span className="text-sm opacity-70">
            off is <code>Scale.Chromatic</code> — every semitone, which is the
            plain note-to-hertz converter
          </span>
        </label>

        <Slider
          label="Hysteresis"
          inputClassName="col-span-2"
          min={0}
          max={1}
          step={0.01}
          param={synth.pitch.hysteresis}
          units="semitones"
          defaultValue={0.1}
        />
        <Slider
          label="Tempo"
          inputClassName="col-span-2"
          min={60}
          max={600}
          param={synth.bpm}
          units="bpm"
        />
        <Slider
          label="Volume"
          inputClassName="col-span-2"
          min={-60}
          max={0}
          param={synth.volume}
          units="dB"
        />
      </div>

      <p className="text-sm opacity-70 mt-2">
        The same <code>clock.gate</code> that samples the noise plays the note,
        which is why this module has no trigger output. On the LFO source, wind
        the hysteresis up and watch the staircase lose its smallest steps: a
        value wavering on a boundary stops flipping between two notes.
      </p>
    </>
  );
}

export default () => (
  <ExamplePane label="Quantizer">
    <Example />
  </ExamplePane>
);
