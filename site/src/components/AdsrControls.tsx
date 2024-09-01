import { Slider } from "./Slider";

export function AdsrControls({
  onAttackChanged,
  onDecayChanged,
  onSustainChanged,
  onReleaseChanged,
}: {
  onAttackChanged: (value: number) => void;
  onDecayChanged: (value: number) => void;
  onSustainChanged: (value: number) => void;
  onReleaseChanged: (value: number) => void;
}) {
  return (
    <>
      <Slider
        label="attack"
        labelClassName="text-right"
        inputClassName="col-span-2"
        min={0.1}
        max={10}
        step={0.1}
        initial={0.2}
        onChange={onAttackChanged}
      />
      <Slider
        label="decay"
        labelClassName="text-right"
        inputClassName="col-span-2"
        min={0.1}
        max={10}
        step={0.1}
        initial={0.2}
        onChange={onDecayChanged}
      />
      <Slider
        label="sustain"
        labelClassName="text-right"
        inputClassName="col-span-2"
        min={0.1}
        max={1}
        step={0.01}
        initial={0.8}
        onChange={onSustainChanged}
      />
      <Slider
        label="release"
        labelClassName="text-right"
        inputClassName="col-span-2"
        min={0.1}
        max={100}
        step={0.2}
        initial={0.2}
        onChange={onReleaseChanged}
      />
    </>
  );
}
