"use client";

import { Compound, Gain, Lfo, Param, PolyblepOscillator } from "synthlet";
import { ExamplePane } from "./components/ExamplePane";
import { SelectorParam } from "./components/Selector";
import { Slider } from "./components/Slider";
import { useSynth } from "./useSynth";

function PolyblepSynth(ac: AudioContext) {
  const volume = Param.db(ac, -24);

  // Through-zero FM: the LFO is connected to `frequency`, not to `detune`, so
  // the AudioParam *sums* it with the base pitch. That is linear FM, and once
  // the depth passes the base pitch the sum goes negative and the oscillator
  // runs its phase backwards instead of clamping flat.
  const lfo = Lfo(ac, { frequency: 1, gain: 0 });

  // Hard sync: a second oscillator, patched into the first one's `sync`. Every
  // rising zero crossing of the master's sawtooth restarts the slave's phase
  // mid-cycle, band-limited - so the master sets the pitch you hear and the
  // slave's Frequency slider sweeps the timbre instead of the note. It is the
  // one sound Web Audio cannot make at all: `OscillatorNode` has no reset.
  //
  // The master's own output is never connected to the speakers; it exists to
  // be an edge. At frequency 0 the phase freezes and it holds a constant -1,
  // which never crosses zero, so the bottom of the Sync slider is sync *off*
  // and the example opens as a plain oscillator.
  const master = PolyblepOscillator(ac, { frequency: 0 });
  const osc = PolyblepOscillator(ac, { frequency: lfo, sync: master });
  // `connectParams` writes 0 into every connected param, so the base pitch has
  // to be put back - and it is what the Frequency slider reads its initial
  // position from.
  osc.frequency.value = 440;
  const out = Gain(ac, { gain: volume });

  osc.connect(out);

  return Compound({
    output: out,
    owns: [osc, lfo, master, volume],
    exposes: {
      osc,
      lfo,
      master,
      volume: volume.input,
    },
  });
}

function Example() {
  const synth = useSynth(PolyblepSynth);
  if (!synth) return null;

  return (
    <>
      <div className="grid grid-cols-4 gap-4">
        <SelectorParam
          name="Waveform"
          inputClassName="col-span-2"
          param={synth.osc.type}
          valueNames={["Sine", "Triangle", "Saw", "Square"]}
        />

        <Slider
          label="Frequency"
          inputClassName="col-span-2"
          min={20}
          max={3000}
          units="Hz"
          param={synth.osc.frequency}
        />

        <Slider
          label="FM depth"
          inputClassName="col-span-2"
          min={0}
          max={3000}
          units="Hz"
          param={synth.lfo.gain}
        />

        <Slider
          label="FM rate"
          inputClassName="col-span-2"
          min={1}
          max={1000}
          units="Hz"
          param={synth.lfo.frequency}
        />

        <Slider
          label="Width"
          inputClassName="col-span-2"
          min={0}
          max={1}
          param={synth.osc.width}
        />

        <Slider
          label="Sync"
          inputClassName="col-span-2"
          min={0}
          max={1000}
          units="Hz"
          param={synth.master.frequency}
        />
      </div>
      <div className="flex px-1 pt-2 mt-2 border-t border-fd-border gap-4">
        <Slider
          label="Volume"
          inputClassName="flex-grow"
          min={-36}
          max={0}
          param={synth.volume}
          units="dB"
        />
      </div>
    </>
  );
}

export default () => (
  <ExamplePane label="Polyblep oscillator">
    <Example />
  </ExamplePane>
);
