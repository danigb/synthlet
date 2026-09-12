"use client";

import { useState } from "react";
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
import { PatternView } from "./components/PatternView";
import { Slider } from "./components/Slider";
import { useSynth } from "./useSynth";

/**
 * The settings the nodes are built with, and the seed for the drawing above
 * them. One list, so the picture and the audio start out agreeing - a second
 * copy of these four numbers is exactly how the demo came to play the wrong
 * rotation of bossa-nova for two releases with nothing saying so.
 */
const INITIAL = { steps: 16, beats: 5, rotation: 0, spread: 4 };

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
  // four voices. The slider is worth sweeping for exactly that reason, and the
  // drawing above it is where that is visible rather than merely audible.
  //
  // The slider hands over a fractional value on its way between integers,
  // which is harmless - `spread` is a count and the engine floors it once per
  // block, the way `steps`, `beats` and `rotation` are floored.
  const spread = Param(ac, { input: INITIAL.spread });
  // `rotation` is the parameter this module hinges on and it has never had a
  // control anywhere on the site. Turn it and the rows above shift one cell at
  // a time - that is the whole of what `rotation` is, and it is what no amount
  // of prose about necklaces conveys.
  const rotation = Param(ac, { input: INITIAL.rotation });
  // With `steps` fixed at 16, `beats` walks the sixteen densities of the same
  // cycle: 5 is the bossa-nova necklace, 7 the samba, 9 the Central African
  // bell. The drawing is the point of having the knob.
  const beats = Param(ac, { input: INITIAL.beats });
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
    steps: INITIAL.steps,
    beats,
    rotation,
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
    owns: [
      kick,
      tom,
      conga,
      clave,
      rhythm,
      clock,
      bpm,
      beats,
      rotation,
      spread,
      swing,
      volume,
    ],
    exposes: {
      bpm: bpm.input,
      beats: beats.input,
      rotation: rotation.input,
      spread: spread.input,
      swing: swing.input,
      volume: volume.input,
    },
  });
};

function Example() {
  // The three pattern parameters, mirrored into React state so the drawing can
  // read them. `Slider` owns its own position and only writes to an
  // `AudioParam`; its `onChange` is the one-line addition that lets an example
  // render something from the same number. `steps` has no slider, so it is a
  // constant here rather than state.
  const [beats, setBeats] = useState(INITIAL.beats);
  const [rotation, setRotation] = useState(INITIAL.rotation);
  const [spread, setSpread] = useState(INITIAL.spread);

  const synth = useSynth(RhythmBox);
  if (!synth) return null;

  return (
    <>
      <PatternView
        steps={INITIAL.steps}
        beats={beats}
        rotation={rotation}
        spread={spread}
      />
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
          label="Beats"
          inputClassName="col-span-2"
          min={0}
          max={INITIAL.steps}
          step={1}
          param={synth.beats}
          onChange={setBeats}
          defaultValue={INITIAL.beats}
        />
        <Slider
          label="Rotation"
          inputClassName="col-span-2"
          min={0}
          max={INITIAL.steps - 1}
          step={1}
          param={synth.rotation}
          onChange={setRotation}
          units=" steps"
          defaultValue={INITIAL.rotation}
        />
        <Slider
          label="Spread"
          inputClassName="col-span-2"
          min={0}
          max={8}
          param={synth.spread}
          onChange={setSpread}
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
