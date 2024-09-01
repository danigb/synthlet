import { midiToFreq } from "@/midi";
import { Slider } from "./Slider";

export function StateVariableFilterControls({
  onFrequencyChanged,
  onResonanceChanged,
}: {
  onFrequencyChanged: (value: number) => void;
  onResonanceChanged: (value: number) => void;
}) {
  return (
    <>
      <Slider
        label="frequency"
        inputClassName="col-span-2"
        min={0}
        max={200}
        step={1}
        initial={150}
        transform={midiToFreq}
        onChange={onFrequencyChanged}
      />
      <Slider
        label="resonance"
        inputClassName="col-span-2"
        min={0.01}
        max={40}
        step={0.01}
        initial={0.5}
        onChange={onResonanceChanged}
      />
    </>
  );
}
