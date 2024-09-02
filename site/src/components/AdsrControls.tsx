import { useEffect } from "react";
import { Slider } from "./Slider";

export function AdsrControls({
  onAttackChanged,
  onDecayChanged,
  onSustainChanged,
  onReleaseChanged,
  adsr,
}: {
  onAttackChanged: (value: number) => void;
  onDecayChanged: (value: number) => void;
  onSustainChanged: (value: number) => void;
  onReleaseChanged: (value: number) => void;
  adsr: [number, number, number, number];
}) {
  useEffect(() => {
    onAttackChanged(adsr[0]);
    onDecayChanged(adsr[1]);
    onSustainChanged(adsr[2]);
    onReleaseChanged(adsr[3]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <>
      <Slider
        label="attack"
        inputClassName="col-span-2"
        min={0.1}
        max={10}
        step={0.1}
        initial={adsr[0]}
        onChange={onAttackChanged}
        units="secs"
      />
      <Slider
        label="decay"
        inputClassName="col-span-2"
        min={0.1}
        max={10}
        step={0.1}
        initial={adsr[1]}
        onChange={onDecayChanged}
        units="secs"
      />
      <Slider
        label="sustain"
        inputClassName="col-span-2"
        min={0.1}
        max={1}
        step={0.01}
        initial={adsr[2]}
        onChange={onSustainChanged}
      />
      <Slider
        label="release"
        inputClassName="col-span-2"
        min={0.1}
        max={100}
        step={0.2}
        initial={adsr[3]}
        onChange={onReleaseChanged}
        units="secs"
      />
    </>
  );
}
