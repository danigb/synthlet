"use client";

import { Compound, Gain, KarplusStrong, Param } from "synthlet";
import { ExamplePane, TriggerButton } from "./components/ExamplePane";
import { Slider } from "./components/Slider";
import { useSynth } from "./useSynth";

function createSynth(ac: AudioContext) {
  const trigger = Param(ac);
  const volume = Param.db(ac, -24);
  const ks = KarplusStrong(ac, { trigger });
  const out = Gain(ac, { gain: volume });

  ks.connect(out);

  return Compound({
    output: out,
    owns: [ks, trigger, volume],
    exposes: {
      ks,
      volume: volume.input,
      trigger: trigger.input,
    },
  });
}

function Group({ label }: { label: string }) {
  return (
    <div className="col-span-4 mt-2 border-b text-sm font-bold">{label}</div>
  );
}

function Example() {
  const synth = useSynth(createSynth);
  if (!synth) return null;

  return (
    <>
      <p className="mb-2 text-sm opacity-70">
        Trigger it, then drag <strong>Damp</strong> up while it is still
        ringing, or <strong>Frequency</strong> for a bend. Triggering again adds
        to the ringing string rather than replacing it.
      </p>
      <div className="grid grid-cols-4 gap-2">
        <Group label="String" />
        {/* Every slider below spans the parameter's whole declared range. The
            frequency one is linear rather than logarithmic because `Slider`'s
            `transform` seeds its position from `param.value` without inverting,
            so a non-identity mapping starts the thumb in the wrong place. */}
        <Slider
          label="Frequency"
          inputClassName="col-span-2"
          param={synth.ks.frequency}
          min={20}
          max={5000}
          units="Hz"
        />
        <Slider
          label="Decay"
          inputClassName="col-span-2"
          param={synth.ks.decay}
          min={0.01}
          max={5}
          units="s"
        />
        <Slider
          label="Brightness"
          inputClassName="col-span-2"
          param={synth.ks.brightness}
          min={0}
          max={1}
        />

        <Group label="Pluck" />
        <Slider
          label="Level"
          inputClassName="col-span-2"
          param={synth.ks.level}
          min={0}
          max={1}
        />
        <Slider
          label="Dynamics"
          inputClassName="col-span-2"
          param={synth.ks.dynamics}
          min={0}
          max={1}
        />
        <Slider
          label="Position"
          inputClassName="col-span-2"
          param={synth.ks.position}
          min={0}
          max={0.5}
        />
        <Slider
          label="Pick angle"
          inputClassName="col-span-2"
          param={synth.ks.pickAngle}
          min={0}
          max={0.9}
        />

        <Group label="Character" />
        <Slider
          label="Stretch"
          inputClassName="col-span-2"
          param={synth.ks.stretch}
          min={1}
          max={20}
        />
        {/* Below 1 this is the drum algorithm, and the pick-position comb is a
            string filter that annihilates the constant the loop is loaded with:
            pull Position to 0 with it. */}
        <Slider
          label="Blend"
          inputClassName="col-span-2"
          param={synth.ks.blend}
          min={0}
          max={1}
        />
        <Slider
          label="Stiffness"
          inputClassName="col-span-2"
          param={synth.ks.stiffness}
          min={0}
          max={1}
        />
        {/* Scales with Level squared, so turn Level up to hear it. */}
        <Slider
          label="Tension"
          inputClassName="col-span-2"
          param={synth.ks.tension}
          min={0}
          max={1}
        />

        <Group label="Two polarizations" />
        <Slider
          label="Polarization"
          inputClassName="col-span-2"
          param={synth.ks.polarization}
          min={0}
          max={1}
        />
        {/* Does nothing while Polarization is 0. */}
        <Slider
          label="Detune"
          inputClassName="col-span-2"
          param={synth.ks.detune}
          min={0}
          max={1}
        />

        <Group label="Hand" />
        <Slider
          label="Damp"
          inputClassName="col-span-2"
          param={synth.ks.damp}
          min={0}
          max={1}
        />

        <Group label="Output" />
        <Slider
          label="Volume"
          inputClassName="col-span-2"
          param={synth.volume}
          min={-100}
          max={0}
          units="dB"
        />
      </div>
      <TriggerButton className="mt-4" trigger={synth.trigger} />
    </>
  );
}

export default () => (
  <ExamplePane label="KarplusStrong">
    <Example />
  </ExamplePane>
);
