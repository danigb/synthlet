"use client";

import {
  ClaveDrum,
  Clock,
  Compound,
  CongaDrum,
  Euclid,
  Gain,
  KickDrum,
  Param,
  TomDrum,
} from "synthlet";
import { ExamplePane } from "./components/ExamplePane";
import { Slider } from "./components/Slider";
import { useSynth } from "./useSynth";

const RhythmBox = (ac: AudioContext) => {
  const bpm = Param(ac, { input: 100 });
  const volume = Param.db(ac, -12);
  const clock = Clock(ac, { bpm });

  // One clock, ONE euclidean pattern, four drums. `spread` is the only thing
  // that differs between them: channel `i` plays the pattern at
  // `rotation + i * spread`, off one pattern array and one step counter, so
  // they cannot drift apart. Turn Spread to 0 and all four collapse onto the
  // same rhythm; at 4 the four entry points tile this cycle - every step
  // filled, none struck by more than two of the voices.
  //
  // That tiling is a property of *this setting* and not of `spread`: at 3 the
  // same pattern leaves half the cycle silent and strikes two steps with all
  // four voices. The slider is worth sweeping for exactly that reason.
  //
  // The slider hands over a fractional value on its way between integers,
  // which is harmless - `spread` is a count and the engine floors it once per
  // block, the way `steps`, `beats` and `rotation` are floored.
  const spread = Param(ac, { input: 4 });
  // One knob, and every voice takes it - the four channels are one step phase
  // read four times, so swing cannot skew them against each other. It is a
  // *ratio*: 1 is straight, 2 is triplet feel, 3 is dotted-eighth. Applied
  // against the subdivision, so at `subdivision: 4` these are sixteenth pairs.
  //
  // It is the MPC/DAW constant-ratio convention and not a model of jazz swing
  // - Honing & de Haas 2008 test exactly that model and reject it. See the
  // package README.
  const swing = Param(ac, { input: 1 });
  const rhythm = Euclid(ac, {
    clock,
    subdivision: 4,
    steps: 16,
    beats: 5,
    spread,
    swing,
  });
  const kick = KickDrum(ac, { trigger: rhythm, volume });
  const tom = TomDrum(ac, { trigger: rhythm.b, volume });
  const conga = CongaDrum(ac, { trigger: rhythm.c, volume });
  const clave = ClaveDrum(ac, { trigger: rhythm.d, volume });
  const out = Gain(ac);

  [kick, tom, conga, clave].forEach((drum) => drum.connect(out));

  return Compound({
    output: out,
    owns: [kick, tom, conga, clave, rhythm, clock, bpm, spread, swing, volume],
    exposes: {
      bpm: bpm.input,
      spread: spread.input,
      swing: swing.input,
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
        <Slider
          label="Spread"
          inputClassName="col-span-2"
          min={0}
          max={8}
          param={synth.spread}
          units="steps"
        />
        <Slider
          label="Swing"
          inputClassName="col-span-2"
          min={1}
          max={3}
          step={0.01}
          param={synth.swing}
          defaultValue={1}
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
