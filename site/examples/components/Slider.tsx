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
  onChange,
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
  /**
   * Called with the slider's value after the param is written, for an example
   * that has to render something from it - `EuclidExample` draws the pattern,
   * which needs `steps`/`beats`/`rotation`/`spread` in React state and not only
   * on an `AudioParam`. Omit it and nothing changes, which is why every other
   * example is untouched by this.
   *
   * The *slider's* value, not the transformed one: `transform` maps to the
   * param's units (dB to a gain, say) and a caller drawing from the same
   * number wants the number on the knob.
   */
  onChange?: (value: number) => void;
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
          onChange?.(value);
        }}
      />
      <div className={valueClassName}>
        {defaultValue === undefined ? (
          <>
            {transform(value).toFixed(2)}
            {units}
          </>
        ) : (
          <span className="inline-flex items-center gap-2">
            <span>
              {transform(value).toFixed(2)}
              {units}
            </span>
            <button
              type="button"
              aria-label={`Reset ${label} to default`}
              title={`Reset to ${transform(defaultValue).toFixed(2)}${units ?? ""}`}
              className={
                "border px-2 py-1 rounded bg-fd-secondary leading-none " +
                (value === defaultValue ? "opacity-40" : "")
              }
              onClick={() => {
                setValue(defaultValue);
                param.value = transform(defaultValue);
                onChange?.(defaultValue);
              }}
            >
              ⟲
            </button>
          </span>
        )}
      </div>
    </>
  );
}
