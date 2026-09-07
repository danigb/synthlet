"use client";

import { ClaveDrum, Clock, Compound, CowBellDrum, Gain, Param } from "synthlet";
import { ExamplePane } from "./components/ExamplePane";
import { Slider } from "./components/Slider";
import { useSynth } from "./useSynth";

const Metronome = (ac: AudioContext) => {
  const bpm = Param(ac, { input: 100 });
  const beatsPerBar = Param(ac, { input: 4 });
  const volume = Param.db(ac, -12);
  const clock = Clock(ac, { bpm, beatsPerBar });

  // The smallest patch that makes a bar audible. The `Clock` node itself is the
  // beat phase - a ramp, for `Euclid` to subdivide - and the two gates are what
  // a drum reads. `clock.downbeat` is `clock.gate` on the first beat of the bar
  // only, so the bell always lands on a clave rather than between two.
  const clave = ClaveDrum(ac, { trigger: clock.gate, volume });
  const bell = CowBellDrum(ac, { trigger: clock.downbeat, volume });
  const out = Gain(ac);

  [clave, bell].forEach((drum) => drum.connect(out));

  return Compound({
    output: out,
    owns: [clave, bell, clock, bpm, beatsPerBar, volume],
    exposes: {
      bpm: bpm.input,
      beatsPerBar: beatsPerBar.input,
      volume: volume.input,
    },
  });
};

function Example() {
  const synth = useSynth(Metronome);
  if (!synth) return null;

  return (
    <>
      <div className="grid grid-cols-4 gap-4">
        <Slider
          label="Tempo"
          inputClassName="col-span-2"
          min={20}
          max={300}
          param={synth.bpm}
          units="bpm"
        />
        <Slider
          label="Beats per bar"
          inputClassName="col-span-2"
          min={1}
          max={8}
          step={1}
          param={synth.beatsPerBar}
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
  <ExamplePane label="Clock">
    <Example />
  </ExamplePane>
);
