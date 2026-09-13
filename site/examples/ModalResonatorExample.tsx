"use client";

import { useState } from "react";
import {
  AdAmp,
  Clock,
  Compound,
  Gain,
  Impulse,
  ModalResonator,
  Noise,
  NoiseType,
  Param,
  type ResonatorMode,
} from "synthlet";
import { ExamplePane, TriggerButton } from "./components/ExamplePane";
import { PresetPicker } from "./components/PresetPicker";
import { Slider } from "./components/Slider";
import { Spectrum } from "./components/Spectrum";
import { useSynth } from "./useSynth";

// Synth Secrets Parts 31 to 41 in one pane: every chapter ends with a table of
// partials, and this plays the table. Pick one, strike it, then edit a row and
// strike it again.
//
// Two exciters, both always running, each behind a `Gain` used as a switch -
// `QuantizerExample`'s idiom, because connect/disconnect on a toggle is how a
// widget leaks nodes. The noise burst goes through a `Gain` of 0.05 on the way
// in: the resonator's levels are normalised for a *strike*, and anything longer
// than an impulse is amplified by the resonance. Without it a 30 ms burst into
// `harmonic(8)` peaks at 2.5.

const { modes } = ModalResonator;

const PRESETS: {
  name: string;
  frequency: number;
  table: () => ResonatorMode[];
}[] = [
  { name: "Harmonic (8)", frequency: 220, table: () => modes.harmonic(8) },
  { name: "Kettle drum · Part 32", frequency: 150, table: modes.kettleDrum },
  { name: "Membrane · Part 31", frequency: 150, table: modes.membrane },
  { name: "Bell · Part 40", frequency: 262, table: modes.bell },
  { name: "Cowbell · Part 41", frequency: 587, table: modes.cowbell },
  {
    name: "Stiff string (B = 0.001)",
    frequency: 110,
    table: () => modes.stiffString(0.001, 16),
  },
  { name: "Claves · Part 41", frequency: 2500, table: () => modes.harmonic(1) },
];

const MAX_MODES = 32;
const DEFAULT_VOLUME_DB = -12;
const NOISE_GAIN = 0.05;

function createSynth(ac: AudioContext) {
  const trigger = Param(ac, { input: 0 });
  const bpm = Param(ac, { input: 90 });
  const volume = Param.db(ac, DEFAULT_VOLUME_DB);

  // The clock's gate reaches the trigger through a switch, so the button and
  // the clock both strike the same `Impulse` and the same `AdAmp`.
  const clock = Clock(ac, { bpm });
  const clocked = Gain(ac, { gain: 0 });
  clock.gate.connect(clocked).connect(trigger.input);

  const impulse = Impulse(ac, { trigger });
  const noise = Noise(ac, { type: NoiseType.White });
  const burst = AdAmp(ac, { trigger, attack: 0.001, decay: 0.03 });
  noise.connect(burst);

  const struck = Gain(ac, { gain: 1 });
  const scraped = Gain(ac, { gain: 0 });
  impulse.connect(struck);
  burst.connect(scraped);

  const resonator = ModalResonator(ac, {
    frequency: PRESETS[0].frequency,
    maxModes: MAX_MODES,
    modes: PRESETS[0].table(),
  });
  struck.connect(resonator);
  scraped.connect(resonator);

  const analyser = ac.createAnalyser();
  analyser.fftSize = 8192;
  analyser.smoothingTimeConstant = 0.5;
  analyser.minDecibels = -110;
  analyser.maxDecibels = -10;

  const out = Gain(ac, { gain: volume });
  resonator.connect(analyser).connect(out);

  const setSource = (source: "impulse" | "noise") => {
    struck.gain.value = source === "impulse" ? 1 : 0;
    scraped.gain.value = source === "noise" ? NOISE_GAIN : 0;
  };

  return Compound({
    output: out,
    owns: [
      trigger,
      bpm,
      volume,
      clock,
      clocked,
      impulse,
      noise,
      burst,
      struck,
      scraped,
      resonator,
      analyser,
    ],
    exposes: {
      resonator,
      analyser,
      setSource,
      clocked,
      trigger: trigger.input,
      bpm: bpm.input,
      volume: volume.input,
    },
  });
}

const CELL = "w-20 border rounded px-1 bg-fd-background text-right";

function Example() {
  const synth = useSynth(createSynth);
  const [rows, setRows] = useState<ResonatorMode[]>(PRESETS[0].table);
  const [source, setSource] = useState<"impulse" | "noise">("impulse");
  const [clocked, setClocked] = useState(false);
  // Bumped by every preset and used as the frequency slider's `key`: `Slider`
  // reads `param.value` when it mounts, so remounting is how a preset moves it.
  const [applied, setApplied] = useState(0);
  if (!synth) return null;

  const play = (next: ResonatorMode[]) => {
    setRows(next);
    synth.resonator.setModes(next);
  };

  const edit = (index: number, field: keyof ResonatorMode, value: number) =>
    play(
      rows.map((row, i) => (i === index ? { ...row, [field]: value } : row)),
    );

  return (
    <>
      <Spectrum
        analyser={synth.analyser}
        label="Output — one peak per mode"
        color="#10b981"
      />

      <div className="grid grid-cols-4 gap-4 my-4 items-center">
        <PresetPicker
          label="Table"
          presets={PRESETS.map((preset) => preset.name)}
          selectClassName="col-span-3 border rounded px-1 bg-fd-background"
          onChange={(name) => {
            const preset = PRESETS.find((p) => p.name === name)!;
            synth.resonator.frequency.value = preset.frequency;
            play(preset.table());
            setApplied((n) => n + 1);
          }}
        />
      </div>

      <div className="flex flex-wrap items-center gap-4 mb-4">
        <TriggerButton trigger={synth.trigger} className="mb-0" />
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={clocked}
            onChange={() => {
              const next = !clocked;
              setClocked(next);
              synth.clocked.gain.value = next ? 1 : 0;
            }}
          />
          Clock
        </label>
        <label className="flex items-center gap-2">
          <input
            type="radio"
            checked={source === "impulse"}
            onChange={() => {
              setSource("impulse");
              synth.setSource("impulse");
            }}
          />
          Impulse (a strike)
        </label>
        <label className="flex items-center gap-2">
          <input
            type="radio"
            checked={source === "noise"}
            onChange={() => {
              setSource("noise");
              synth.setSource("noise");
            }}
          />
          Noise burst (a brush)
        </label>
      </div>

      <div className="grid grid-cols-4 gap-4" key={applied}>
        <Slider
          label="Frequency"
          inputClassName="col-span-2"
          min={20}
          max={2000}
          param={synth.resonator.frequency}
          units="Hz"
        />
        <Slider
          label="Decay"
          inputClassName="col-span-2"
          min={0.01}
          max={10}
          step={0.01}
          param={synth.resonator.decay}
          units=" s"
          defaultValue={1}
        />
        <Slider
          label="Brightness"
          inputClassName="col-span-2"
          min={0}
          max={1}
          step={0.01}
          param={synth.resonator.brightness}
          defaultValue={1}
        />
        <Slider
          label="Clock"
          inputClassName="col-span-2"
          min={30}
          max={240}
          param={synth.bpm}
          units=" bpm"
        />
        <Slider
          label="Volume"
          inputClassName="col-span-2"
          min={-60}
          max={0}
          param={synth.volume}
          units="dB"
          defaultValue={DEFAULT_VOLUME_DB}
        />
      </div>

      <table className="mt-4 text-sm">
        <thead>
          <tr>
            <th className="text-left pr-2">Mode</th>
            <th className="text-right pr-2">Ratio</th>
            <th className="text-right pr-2">Level</th>
            <th className="text-right pr-2">Decay</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={index}>
              <td className="pr-2">{index + 1}</td>
              {(["ratio", "level", "decay"] as const).map((field) => (
                <td key={field} className="pr-2">
                  <input
                    className={CELL}
                    type="number"
                    step={0.01}
                    min={0}
                    value={row[field]}
                    onChange={(event) =>
                      edit(index, field, Number(event.target.value))
                    }
                  />
                </td>
              ))}
              <td>
                <button
                  type="button"
                  className="border px-2 rounded bg-fd-secondary"
                  onClick={() => play(rows.filter((_, i) => i !== index))}
                >
                  ×
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <button
        type="button"
        className="border px-2 py-1 mt-2 rounded bg-fd-secondary"
        disabled={rows.length >= MAX_MODES}
        onClick={() => {
          const last = rows[rows.length - 1];
          play([
            ...rows,
            { ratio: (last?.ratio ?? 0) + 1, level: 0.1, decay: 1 },
          ]);
        }}
      >
        Add mode
      </button>

      <p className="text-xs mt-3 opacity-70">
        A mode&rsquo;s spectral peak is proportional to its level <em>times</em>{" "}
        its decay, so the kettle drum&rsquo;s tallest line is mode 3, not the
        mode 1 that is loudest at the strike. Brightness scales mode n by
        brightness<sup>n−1</sup>: velocity into it is how hard the stick hits.
        The resonator is mono; put a <code>StereoPannerNode</code> after it.
      </p>
    </>
  );
}

export default () => (
  <ExamplePane label="Modal resonator">
    <Example />
  </ExamplePane>
);
