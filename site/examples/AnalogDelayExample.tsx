"use client";

import { AnalogDelay, ClaveDrum, Compound, Gain } from "synthlet";
import { ExamplePane, TriggerButton } from "./components/ExamplePane";
import { Slider } from "./components/Slider";
import { useSynth } from "./useSynth";

function AnalogDelaySynth(ac: AudioContext) {
  const clave = ClaveDrum(ac);
  // A percussive source is the honest test of a delay: repeats are separable,
  // the tap ratios are audible as rhythm, and a pitch bend on a moving `time`
  // has nowhere to hide.
  const delay = AnalogDelay(ac, {
    time: 0.3,
    feedback: 0.6,
    mix: 0.5,
    age: 0.3,
  });
  const out = Gain(ac);

  clave.connect(delay).connect(out);

  return Compound({
    output: out,
    owns: [clave, delay],
    exposes: {
      delay,
      trigger: clave.trigger,
    },
  });
}

function Example() {
  const synth = useSynth(AnalogDelaySynth);
  if (!synth) return null;

  return (
    <>
      <p className="mb-2 text-sm opacity-70">
        Trigger it, then drag <strong>Time</strong> while it is still repeating:
        everything already in the line bends with it.
      </p>
      <div className="grid grid-cols-4 gap-2">
        <Slider
          label="Time"
          inputClassName="col-span-2"
          param={synth.delay.time}
          min={0.02}
          max={1.5}
          units="s"
        />
        <Slider
          label="Feedback"
          inputClassName="col-span-2"
          param={synth.delay.feedback}
          min={0}
          max={1.2}
        />
        <Slider
          label="Mix"
          inputClassName="col-span-2"
          param={synth.delay.mix}
        />
        <Slider
          label="Taps"
          inputClassName="col-span-2"
          param={synth.delay.taps}
        />
        <Slider
          label="Age"
          inputClassName="col-span-2"
          param={synth.delay.age}
        />
        <Slider
          label="Wobble"
          inputClassName="col-span-2"
          param={synth.delay.wobble}
        />
        <Slider
          label="Spread"
          inputClassName="col-span-2"
          param={synth.delay.spread}
        />
        <Slider
          label="Mode"
          inputClassName="col-span-2"
          param={synth.delay.mode}
        />
      </div>
      <TriggerButton className="mt-4" trigger={synth.trigger} />
    </>
  );
}

export default () => (
  <ExamplePane label="AnalogDelay">
    <Example />
  </ExamplePane>
);
