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
  defaultValue,
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
  /**
   * Slider position to return to when the reset button is pressed, in the
   * *input's* units - so it goes through `transform` exactly like a drag does.
   * Omit it and no button is rendered, which is why every other example is
   * untouched by this.
   */
  defaultValue?: number;
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
        {defaultValue !== undefined && (
          <button
            type="button"
            aria-label={`Reset ${label} to default`}
            title={`Reset to ${transform(defaultValue).toFixed(2)}${units ?? ""}`}
            className={
              "ml-1 px-1 align-middle rounded border border-fd-border text-[10px] leading-none " +
              (value === defaultValue
                ? "opacity-30"
                : "opacity-60 hover:opacity-100")
            }
            onClick={() => {
              setValue(defaultValue);
              param.value = transform(defaultValue);
            }}
          >
            ⟲
          </button>
        )}
      </div>
    </>
  );
}
