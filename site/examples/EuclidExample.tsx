"use client";

import {
  Clock,
  Compound,
  Euclid,
  Gain,
  HiHatDrum,
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

  // One clock, *one* euclidean pattern, two drums mixed into the output: the
  // kick on the hits and the hat on the steps they leave empty. Two `Euclid`
  // nodes could not do this - the complement of E(5,16) is E(11,16) rotated by
  // 3, and there is no rotation you would find by ear.
  const rhythm = Euclid(ac, {
    clock,
    steps: 16,
    beats: 5,
    subdivision: 4,
  });
  const kick = KickDrum(ac, { trigger: rhythm, volume });
  const hat = HiHatDrum(ac, { trigger: rhythm.rests, volume });
  const out = Gain(ac);

  [kick, hat].forEach((drum) => drum.connect(out));

  return Compound({
    output: out,
    owns: [kick, hat, rhythm, clock, bpm, volume],
    exposes: {
      bpm: bpm.input,
      volume: volume.input,
    },
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
