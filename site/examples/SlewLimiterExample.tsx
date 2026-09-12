"use client";

import { useState } from "react";
import {
  Compound,
  Gain,
  Param,
  PolyblepOscillator,
  PolyblepOscillatorType,
  SlewLimiter,
  SlewType,
} from "synthlet";
import { ExamplePane } from "./components/ExamplePane";
import { Slider } from "./components/Slider";
import { useSynth } from "./useSynth";

// Portamento, and the reason the glide is on `detune` rather than on
// `frequency`: an analogue portamento is an RC network on a 1 V/oct CV, so it
// is linear in log-frequency and the glide is musically even. Cents are a
// log-frequency unit; hertz are not, so a slew on a frequency signal would take
// longer to fall a fifth than to rise one.
const NOTES = [0, 300, 700, 1200, -500];

function createSynth(ac: AudioContext) {
  const volume = Param.db(ac, -14);
  const cents = Param(ac, { input: 0 });
  const glide = SlewLimiter(ac, { rise: 0.2, fall: 0.2 });

  const osc = PolyblepOscillator(ac, {
    type: PolyblepOscillatorType.Sawtooth,
    frequency: 220,
  });
  const out = Gain(ac, { gain: volume });

  cents.connect(glide).connect(osc.detune);
  osc.connect(out);

  return Compound({
    output: out,
    owns: [osc, glide, cents, volume],
    exposes: { glide, cents: cents.input, volume: volume.input },
  });
}

function Example() {
  const [type, setType] = useState(SlewType.Exponential);
  const [note, setNote] = useState(0);
  const synth = useSynth(createSynth);
  if (!synth) return null;

  return (
    <>
      <div className="flex items-center gap-2 mb-4">
        {NOTES.map((cents) => (
          <button
            key={cents}
            className={`border px-2 py-1 rounded ${
              note === cents ? "bg-fd-primary text-fd-primary-foreground" : ""
            }`}
            onClick={() => {
              setNote(cents);
              synth.cents.value = cents;
            }}
          >
            {cents > 0 ? `+${cents}` : cents}
          </button>
        ))}
        <span className="text-sm opacity-70">cents from A3</span>
      </div>

      <div className="grid grid-cols-4 gap-4">
        <div>Law</div>
        <select
          className="col-span-3"
          value={type}
          onChange={(e) => {
            const next = parseInt(e.target.value);
            setType(next);
            synth.glide.type.value = next;
          }}
        >
          <option value={SlewType.Exponential}>
            Exponential — 99 % of the step in the glide time
          </option>
          <option value={SlewType.Linear}>Linear — seconds per unit</option>
        </select>
        <Slider
          label="Rise"
          inputClassName="col-span-2"
          min={0}
          max={2}
          step={0.01}
          param={synth.glide.rise}
          units="s"
          defaultValue={0.2}
        />
        <Slider
          label="Fall"
          inputClassName="col-span-2"
          min={0}
          max={2}
          step={0.01}
          param={synth.glide.fall}
          units="s"
          defaultValue={0.2}
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
        Both times to zero is a bit-exact bypass: the notes step. In linear mode
        the numbers mean seconds per <em>cent</em>, so anything above about
        0.005 never arrives — which is what &ldquo;per unit&rdquo; costs when
        the unit is small.
      </p>
    </>
  );
}

export default () => (
  <ExamplePane label="Slew limiter">
    <Example />
  </ExamplePane>
);
