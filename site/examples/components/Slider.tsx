import { useState } from "react";

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
  param,
  units,
}: {
  label: string;
  min?: number;
  max?: number;
  initial?: number;
  param?: { value: number };
  onChange?: (value: number) => void;
  transform?: (value: number) => number;
  step?: number;
  labelClassName?: string;
  inputClassName?: string;
  valueClassName?: string;
  units?: string;
}) {
  const [value, setValue] = useState(param ? param.value : initial);

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
          if (param) param.value = transform(value);
          else onChange?.(transform(value));
        }}
      />
      <div className={valueClassName}>
        {transform(value).toFixed(2)}
        {units}
      </div>
    </>
  );
}
