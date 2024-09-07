import { Slider } from "./Slider";

type Parameter = { value: number };
type AdsrModule = {
  attack: Parameter;
  decay: Parameter;
  sustain: Parameter;
  release: Parameter;
};

export function AdsrControls({ adsr }: { adsr: AdsrModule }) {
  return (
    <>
      <Slider
        label="Attack"
        inputClassName="col-span-2"
        min={0.1}
        max={10}
        step={0.1}
        param={adsr.attack}
        units="secs"
      />
      <Slider
        label="Decay"
        inputClassName="col-span-2"
        min={0.1}
        max={10}
        step={0.1}
        param={adsr.decay}
        units="secs"
      />
      <Slider
        label="Sustain"
        inputClassName="col-span-2"
        min={0.1}
        max={1}
        step={0.01}
        param={adsr.sustain}
      />
      <Slider
        label="Release"
        inputClassName="col-span-2"
        min={0.1}
        max={100}
        step={0.2}
        param={adsr.release}
        units="secs"
      />
    </>
  );
}
