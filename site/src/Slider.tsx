"use client";
export function Slider({
  min = 0,
  max = 5,
  name,
  value,
  onChange,
  param,
}: {
  min?: number;
  max?: number;
  name: string;
  value: number;
  onChange: (value: number) => void;
  param?: AudioParam | ((num: number) => void);
}) {
  return (
    <>
      {name} {value.toFixed(2)}
      <input
        type="range"
        min={min}
        max={max}
        value={value}
        step="any"
        onChange={(e) => {
          const value = e.target.valueAsNumber;
          if (typeof param === "function") param(value);
          else param?.setValueAtTime(value, 0);
          onChange(value);
        }}
      />
    </>
  );
}
