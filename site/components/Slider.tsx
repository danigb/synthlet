import { useEffect, useState } from "react";

export function Slider({
  label,
  min = 0,
  max = 1,
  initial = 0,
  onChange,
  step,
  transform = (x) => x,
  inputClassName,
  labelClassName,
  valueClassName,
  units,
  initialize,
}: {
  label: string;
  min?: number;
  max?: number;
  initial?: number;
  onChange: (value: number) => void;
  transform?: (value: number) => number;
  step?: number;
  labelClassName?: string;
  inputClassName?: string;
  valueClassName?: string;
  units?: string;
  initialize?: boolean;
}) {
  const [value, setValue] = useState(initial);

  useEffect(() => {
    if (initialize) onChange(initial);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialize]);

  return (
    <>
      <div className={labelClassName}>{label}</div>
      <input
        className={inputClassName}
        type="range"
        min={min}
        max={max}
        step={step ?? "any"}
        value={value}
        onChange={(e) => {
          const value = e.target.valueAsNumber;
          setValue(value);
          onChange(transform(value));
        }}
      />
      <div className={valueClassName}>
        {transform(value).toFixed(2)}
        {units}
      </div>
    </>
  );
}
