"use client";

import {
  ClaveDrum,
  Clock,
  disposable,
  Euclid,
  Gain,
  KickDrum,
  Param,
} from "synthlet";
import { ExamplePane } from "./components/ExamplePane";
import { Slider } from "./components/Slider";
import { useSynth } from "./useSynth";

const RhythmBox = (ac: AudioContext) => {
  const bpm = Param(ac, { input: 100 });
  const volume = Param.db(ac, -12);
  const clock = Clock(ac, { bpm });

  // One clock, two euclidean patterns, two drums mixed into the output.
  const clave = ClaveDrum(ac, {
    trigger: Euclid(ac, {
      clock,
      steps: 16,
      beats: 7,
      subdivision: 4,
      rotation: 3,
    }),
    volume,
  });
  const kick = KickDrum(ac, {
    trigger: Euclid(ac, {
      clock,
      steps: 16,
      beats: 5,
      subdivision: 4,
    }),
    volume,
  });
  const out = Gain(ac);

  [clave, kick].forEach((drum) => drum.connect(out));

  return Object.assign(disposable(out, [clave, kick, clock, bpm, volume]), {
    bpm: bpm.input,
    volume: volume.input,
  });
};

function Example() {
  const synth = useSynth(RhythmBox);
  if (!synth) return null;

  return (
    <>
      <div className="grid grid-cols-4 gap-4">
        <Slider
          label="Tempo"
          inputClassName="col-span-2"
          min={1}
          max={1000}
          param={synth.bpm}
          units="bpm"
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
  <ExamplePane label="Euclid">
    <Example />
  </ExamplePane>
);
