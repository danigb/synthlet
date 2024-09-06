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
    <div className="grid grid-cols-4">
      <Slider
        label="Attack"
        inputClassName="col-span-2"
        min={0.1}
        max={10}
        step={0.1}
        initial={adsr.attack.value}
        onChange={(value) => {
          adsr.attack.value = value;
        }}
        units="secs"
      />
      <Slider
        label="Decay"
        inputClassName="col-span-2"
        min={0.1}
        max={10}
        step={0.1}
        initial={adsr.decay.value}
        onChange={(value) => {
          adsr.decay.value = value;
        }}
        units="secs"
      />
      <Slider
        label="Sustain"
        inputClassName="col-span-2"
        min={0.1}
        max={1}
        step={0.01}
        initial={adsr.sustain.value}
        onChange={(value) => {
          adsr.sustain.value = value;
        }}
      />
      <Slider
        label="Release"
        inputClassName="col-span-2"
        min={0.1}
        max={100}
        step={0.2}
        initial={adsr.release.value}
        onChange={(value) => {
          adsr.release.value = value;
        }}
        units="secs"
      />
    </div>
  );
}
