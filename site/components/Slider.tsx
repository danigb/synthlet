import { useEffect, useState } from "react";

export function Slider({
  label,
  min,
  max,
  initial,
  onChange,
  step = 1,
  transform = (x) => x,
  inputClassName,
  labelClassName = "text-right",
  valueClassName,
  units,
  initialize,
}: {
  label: string;
  min: number;
  max: number;
  initial: number;
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
      <p className={labelClassName}>{label}</p>
      <input
        className={inputClassName}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => {
          const value = e.target.valueAsNumber;
          setValue(value);
          onChange(transform(value));
        }}
      />
      <p className={valueClassName}>
        {transform(value).toFixed(2)}
        {units}
      </p>
    </>
  );
}
