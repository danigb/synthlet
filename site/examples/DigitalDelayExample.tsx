"use client";

import { ClaveDrum, Compound, DigitalDelay, Gain } from "synthlet";
import { ExamplePane, TriggerButton } from "./components/ExamplePane";
import { Slider } from "./components/Slider";
import { useSynth } from "./useSynth";

function DigitalDelaySynth(ac: AudioContext) {
  const clave = ClaveDrum(ac);
  // A percussive source is the honest test of a delay: repeats are separable,
  // and a click on a `time` change has nowhere to hide.
  const delay = DigitalDelay(ac, { time: 0.25, feedback: 0.5, mix: 0.5 });
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
  const synth = useSynth(DigitalDelaySynth);
  if (!synth) return null;

  return (
    <>
      <div className="grid grid-cols-4 gap-2">
        <Slider
          label="Time"
          inputClassName="col-span-2"
          param={synth.delay.time}
          min={0.0002}
          max={2}
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
          label="Tone"
          inputClassName="col-span-2"
          param={synth.delay.tone}
          min={-1}
          max={1}
        />
        <Slider
          label="Mod"
          inputClassName="col-span-2"
          param={synth.delay.mod}
        />
        <Slider
          label="Spread"
          inputClassName="col-span-2"
          param={synth.delay.spread}
        />
        <Slider
          label="Cross"
          inputClassName="col-span-2"
          param={synth.delay.cross}
        />
        <Slider
          label="Diffuse"
          inputClassName="col-span-2"
          param={synth.delay.diffuse}
        />
      </div>
      <TriggerButton className="mt-4" trigger={synth.trigger} />
    </>
  );
}

export default () => (
  <ExamplePane label="DigitalDelay">
    <Example />
  </ExamplePane>
);
