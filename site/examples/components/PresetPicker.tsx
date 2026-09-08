"use client";

import { useState } from "react";

/**
 * A `<select>` over an instrument's preset bank.
 *
 * It takes the names and a callback rather than the instrument, so it works
 * for anything with a bank - the next ready-made synth included - and so the
 * page decides whether a preset change is scheduled or immediate.
 */
export function PresetPicker({
  label = "Preset",
  presets,
  initialValue,
  onChange,
  labelClassName,
  selectClassName,
}: {
  label?: string;
  presets: readonly string[];
  /** The name shown before anything is picked. Default the first one. */
  initialValue?: string;
  onChange: (preset: string) => void;
  labelClassName?: string;
  selectClassName?: string;
}) {
  const [value, setValue] = useState(initialValue ?? presets[0] ?? "");

  if (presets.length === 0) return null;

  return (
    <>
      <div className={labelClassName}>{label}</div>
      <select
        className={selectClassName}
        value={value}
        onChange={(event) => {
          setValue(event.target.value);
          onChange(event.target.value);
        }}
      >
        {presets.map((preset) => (
          <option key={preset} value={preset}>
            {preset}
          </option>
        ))}
      </select>
    </>
  );
}
