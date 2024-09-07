"use client";

import { ClaveDrum, DattorroReverb } from "synthlet";
import {
  ExamplePane,
  ModulePane,
  TriggerButton,
} from "./components/ExamplePane";
import { Slider } from "./components/Slider";
import { useSynth } from "./useSynth";

function DattorroSynth(context: AudioContext) {
  const clave = ClaveDrum(context);
  const reverb = DattorroReverb(context);
  reverb.connect(context.destination);
  clave.connect(reverb);

  return Object.assign(clave, { reverb });
}

function Example() {
  const synth = useSynth(DattorroSynth);
  if (!synth) return null;

  return (
    <>
      <ModulePane label="Input" paneClassName="grid grid-cols-4 gap-2 mb-4">
        <Slider
          label="Filter"
          inputClassName="col-span-2"
          param={synth.reverb.filter}
        />
        <Slider
          label="Diffusion 1"
          inputClassName="col-span-2"
          param={synth.reverb.inputDiffusion1}
        />
        <Slider
          label="Diffusion 2"
          inputClassName="col-span-2"
          param={synth.reverb.inputDiffusion2}
        />
      </ModulePane>

      <ModulePane label="Feedback" paneClassName="grid grid-cols-4 gap-2 mb-4">
        <Slider
          label="Diffusion 1"
          inputClassName="col-span-2"
          param={synth.reverb.decayDiffusion1}
        />
        <Slider
          label="Diffusion 2"
          inputClassName="col-span-2"
          param={synth.reverb.decayDiffusion2}
        />
        <Slider
          label="Decay"
          inputClassName="col-span-2"
          param={synth.reverb.decay}
        />
        <Slider
          label="Damping"
          inputClassName="col-span-2"
          param={synth.reverb.damping}
        />
      </ModulePane>
      <TriggerButton className="mt-4" trigger={synth.trigger} />
    </>
  );
}

export default () => (
  <ExamplePane label="Dattorro Reverb">
    <Example />
  </ExamplePane>
);
