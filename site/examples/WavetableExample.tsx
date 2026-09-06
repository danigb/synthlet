"use client";

import { useEffect, useState } from "react";
import {
  AdsrAmp,
  builtInHarmonics,
  Compound,
  fetchWavetableNames,
  Gain,
  Lfo,
  LfoType,
  Param,
  WavetableOscillator,
} from "synthlet";
import { ExamplePane, GateButton } from "./components/ExamplePane";
import { Slider } from "./components/Slider";
import { useSynth } from "./useSynth";

/** The table the oscillator generates for itself, and the initial selection. */
const BUILT_IN = "Built-in";

const WavetableSynth = (ac: AudioContext) => {
  const gate = Param(ac);
  const freq = Param(ac, { input: 440 });
  const volume = Param.db(ac, -24);

  // No `loadWavetable` here: the oscillator ships with a built-in sine ->
  // triangle -> sawtooth -> square table and is audible before anything is
  // fetched. Picking a name from the dropdown replaces it.
  //
  // `morph` is the wavetable position, 0 = first plane and 1 = last. It starts
  // centred so the LFO below has room either side of it.
  const osc = WavetableOscillator(ac, { frequency: freq, morph: 0.5 });
  const amp = AdsrAmp(ac, { gate });
  const out = Gain(ac, { gain: volume });

  // The oscillator used to carry its own morph phasor, as a `morphFrequency`
  // parameter. It does not any more: `morph` is a-rate, so an `Lfo` into it is
  // the same sound and can be any shape, any depth and any rate - which is what
  // this connection demonstrates. The slider sets the centre, the LFO swings
  // around it, and Web Audio clamps the sum into the parameter's 0..1.
  const lfo = Lfo(ac, { frequency: 0.2, type: LfoType.Triangle, gain: 0 });
  lfo.connect(osc.morph);

  osc.connect(amp).connect(out);

  return Compound({
    output: out,
    owns: [osc, amp, lfo, gate, freq, volume],
    exposes: {
      osc,
      lfo,
      gate: gate.input,
      freq: freq.input,
      volume: volume.input,
    },
  });
};

function WavetableExample() {
  const [currentWavetableName, setCurrentWavetableName] =
    useState<string>(BUILT_IN);
  const [availableNames, setAvailableNames] = useState<string[]>([]);
  // Loudness normalization is the one conditioning step that is a product
  // decision rather than a fact about the data - an artist may have shaped a
  // level ramp across the planes on purpose - so it has a switch, and this is
  // it. Sweep the morph across a real table with it off and the knob is a
  // volume control: the sampled catalogue spans 9 to 29 dB across its planes.
  // It only applies to fetched tables; the built-in one is generated at
  // canonical phase and peak-normalized already.
  const [normalize, setNormalize] = useState(true);
  // The tables come from a third party's GitHub Pages mirror, so failing to
  // reach one is ordinary rather than exceptional. `loadWavetable` returns a
  // promise that rejects with a message naming what went wrong; before, all
  // three call sites here were fire-and-forget and a failure was an unhandled
  // rejection in the console and silence in the UI. Nothing is lost when it
  // happens: the oscillator keeps playing the table it already has.
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchWavetableNames()
      .then((names) => {
        names.sort();
        setAvailableNames(names);
      })
      .catch((failure: Error) => setError(failure.message));
  }, []);
  const synth = useSynth(WavetableSynth);

  if (!synth) return null;

  return (
    <>
      <div className="grid grid-cols-4 gap-4">
        <div className="text-right">Wavetable</div>
        <select
          className="col-span-2 bg-zinc-900 p-1 rounded border-zinc-300"
          value={currentWavetableName}
          onChange={(event) => {
            const previous = currentWavetableName;
            const name = event.target.value;
            setError(null);
            setCurrentWavetableName(name);
            if (name === BUILT_IN) synth.osc.setHarmonics(builtInHarmonics());
            else {
              synth.osc.loadWavetable(name, { normalize }).catch((failure) => {
                // Back to the name of the table still playing, and say why.
                setCurrentWavetableName(previous);
                setError(failure.message);
              });
            }
          }}
        >
          <option key={BUILT_IN}>{BUILT_IN}</option>
          {availableNames.map((name) => (
            <option key={name}>{name}</option>
          ))}
        </select>
        <label className="text-sm self-center">
          Normalize
          <input
            className="ml-2"
            type="checkbox"
            checked={normalize}
            onChange={(event) => {
              const on = event.target.checked;
              setNormalize(on);
              if (currentWavetableName !== BUILT_IN) {
                synth.osc
                  .loadWavetable(currentWavetableName, { normalize: on })
                  .catch((failure) => setError(failure.message));
              }
            }}
          />
        </label>

        {error && (
          <div className="col-span-4 text-sm text-red-400">{error}</div>
        )}

        <Slider
          label="Morph"
          labelClassName="text-right"
          inputClassName="col-span-2"
          min={0}
          max={1}
          param={synth.osc.morph}
        />
        <Slider
          label="Detune"
          labelClassName="text-right"
          inputClassName="col-span-2"
          min={-1200}
          max={1200}
          units=" cents"
          param={synth.osc.detune}
        />
        <Slider
          label="Morph LFO rate"
          labelClassName="text-right"
          inputClassName="col-span-2"
          min={0}
          max={20}
          units=" Hz"
          param={synth.lfo.frequency}
        />
        <Slider
          label="Morph LFO depth"
          labelClassName="text-right"
          inputClassName="col-span-2"
          min={0}
          max={0.5}
          param={synth.lfo.gain}
        />
      </div>
      <div className="flex mt-4">
        <GateButton gate={synth.gate} />
      </div>
      <div className="flex px-1 pt-2 mt-2 border-t border-fd-border gap-4">
        <Slider
          label="Volume"
          inputClassName="flex-grow"
          min={-36}
          max={0}
          units="dB"
          param={synth.volume}
        />
      </div>
    </>
  );
}

export default () => (
  <ExamplePane label="Wavetable">
    <WavetableExample />
  </ExamplePane>
);
