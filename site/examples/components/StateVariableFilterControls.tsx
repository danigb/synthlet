import { Slider } from "./Slider";
type Param = { value: number };

export function SvfControls({ frequency, Q }: { frequency: Param; Q: Param }) {
  return (
    <>
      <Slider
        label="frequency"
        inputClassName="col-span-2"
        min={0}
        max={20000}
        step={1}
        param={frequency}
        units="Hz"
      />
      <Slider
        label="Q"
        inputClassName="col-span-2"
        min={0.01}
        max={40}
        step={0.01}
        param={Q}
      />
    </>
  );
}
