"use client";

import { useState } from "react";
import { Compound, Gain, Lfo, LfoType } from "synthlet";
import { ExamplePane } from "./components/ExamplePane";
import { Scope } from "./components/Scope";
import { useSynth } from "./useSynth";

/**
 * Slow enough that two of them at the same rate stay visibly locked for as long
 * as anyone will watch: the free-running case is not "eventually drifts apart",
 * it is "the same signal, forever".
 */
const RATE = 0.3;

function StackSynth(ac: AudioContext) {
  // Nothing here makes a sound - this example is about what two LFOs *look*
  // like, and the audible ones are on the page above. An `AnalyserNode` is an
  // automatic pull node in the Web Audio spec, so the LFOs render without a
  // path to the destination; `out` is a silent gain so the `Compound` has the
  // output node it requires.
  const out = Gain(ac, { gain: 0 });

  const scope = () => {
    const node = ac.createAnalyser();
    node.fftSize = 32768;
    return node;
  };

  const build = (phase?: number | "random") =>
    [0, 1].map(() => {
      const lfo = Lfo(ac, { type: LfoType.Sine, frequency: RATE, phase });
      const analyser = scope();
      lfo.connect(analyser);
      return { lfo, analyser };
    });

  // Both pairs exist for the life of the example and the checkbox chooses which
  // pair is *drawn*. Building an LFO is a `phase` decision made once at
  // construction - it is not an `AudioParam` - so there is nothing to toggle on
  // a live node, and rewiring from a React handler is how nodes get left behind.
  const locked = build(0);
  const random = build("random");

  return Compound({
    output: out,
    // Raw `AnalyserNode`s have no `dispose`, so the cascade disconnects them.
    owns: [...locked, ...random].flatMap(({ lfo, analyser }) => [
      lfo,
      analyser,
    ]),
    exposes: {
      locked: locked.map((v) => v.analyser),
      random: random.map((v) => v.analyser),
    },
  });
}

function Example() {
  const synth = useSynth(StackSynth);
  const [decorrelated, setDecorrelated] = useState(true);
  if (!synth) return null;

  const pair = decorrelated ? synth.random : synth.locked;

  return (
    <>
      <div className="grid md:grid-cols-2 gap-4">
        <Scope analyser={pair[0]} label="LFO A" color="#0ea5e9" />
        <Scope analyser={pair[1]} label="LFO B" color="#f97316" />
      </div>
      <label className="mt-4 inline-block">
        <input
          className="mr-2"
          type="checkbox"
          checked={decorrelated}
          onChange={(e) => setDecorrelated(e.target.checked)}
        />
        <code>phase: &quot;random&quot;</code>
      </label>
      <p className="text-sm mt-2">
        Unchecked, both LFOs are built with <code>phase: 0</code> and the two
        traces are the same picture — every <code>Lfo</code> in an{" "}
        <code>AudioContext</code> free-runs from context time zero, so two at
        the same rate are the same signal forever. Checked, each draws its own
        starting phase once at construction.
      </p>
    </>
  );
}

export default () => (
  <ExamplePane label="Stacked LFOs">
    <Example />
  </ExamplePane>
);
