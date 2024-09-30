"use client";

import { ClaveDrum, ReverbDelay } from "synthlet";
import { ExamplePane, TriggerButton } from "./components/ExamplePane";
import { Slider } from "./components/Slider";
import { useSynth } from "./useSynth";

function ReverbDelaySynth(context: AudioContext) {
  const clave = ClaveDrum(context);
  const reverb = ReverbDelay(context, {});

  clave.connect(reverb).connect(context.destination);

  return Object.assign(clave, { reverb });
}

function Example() {
  const synth = useSynth(ReverbDelaySynth);
  if (!synth) return null;

  return (
    <>
      <div className="grid grid-cols-4 gap-2">
        <Slider
          label="Delay"
          inputClassName="col-span-2"
          param={synth.reverb.delay}
          min={0}
          max={1.45}
        />
        <Slider
          label="Damping"
          inputClassName="col-span-2"
          param={synth.reverb.damping}
        />
        <Slider
          label="Size"
          inputClassName="col-span-2"
          param={synth.reverb.size}
          min={0.1}
          max={3}
        />
        <Slider
          label="Diffusion"
          inputClassName="col-span-2"
          param={synth.reverb.diffusion}
        />
        <Slider
          label="Feedback"
          inputClassName="col-span-2"
          param={synth.reverb.diffusion}
        />
        <Slider
          label="Modulation depth"
          inputClassName="col-span-2"
          param={synth.reverb.diffusion}
        />
        <Slider
          label="Modulation frequency"
          inputClassName="col-span-2"
          min={0}
          max={10}
          param={synth.reverb.modFreq}
        />
      </div>
      <TriggerButton className="mt-4" trigger={synth.trigger} />
    </>
  );
}

export default () => (
  <ExamplePane label="ReverbDelay">
    <Example />
  </ExamplePane>
);
