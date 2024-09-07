import { useEffect, useState } from "react";

export function Slider({
  label,
  min = 0,
  max = 1,
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
  param: { value: number };
  transform?: (value: number) => number;
  step?: number;
  labelClassName?: string;
  inputClassName?: string;
  valueClassName?: string;
  units?: string;
}) {
  const [value, setValue] = useState(param.value);

  useEffect(() => {
    setValue(param.value);
  }, [param]);

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
          param.value = transform(value);
        }}
      />
      <div className={valueClassName}>
        {transform(value).toFixed(2)}
        {units}
      </div>
    </>
  );
}
