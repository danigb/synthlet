import { useEffect, useState } from "react";

export function SelectorParam({
  name,
  valueNames,
  labelClassName,
  inputClassName,
  param,
  hint,
}: {
  name: string;
  valueNames: readonly string[];
  inputClassName?: string;
  labelClassName?: string;
  hint?: string;
  param: { value: number };
}) {
  const [current, setCurrent] = useState<number>(param.value);

  return (
    <>
      <div className={labelClassName}>{name}</div>
      <select
        className={inputClassName}
        value={current}
        onChange={(e) => {
          const value = parseInt(e.target.value);
          setCurrent(value);
          param.value = value;
        }}
      >
        {valueNames.map((name, i) => (
          <option key={name} value={i}>
            {name}
          </option>
        ))}
      </select>
      <div>{hint}</div>
    </>
  );
}

export function Selector({
  name,
  initialValue,
  values,
  onChange,
  selectClassName,
  initialize,
}: {
  name: string;
  values: readonly string[];
  onChange: (value: string) => void;
  initialValue: string;
  selectClassName?: string;
  initialize?: boolean;
  format?: (value: string) => string;
}) {
  const [value, setValue] = useState<string>(initialValue);

  useEffect(() => {
    if (initialize) {
      onChange(initialValue);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialize, initialValue]);

  return (
    <>
      <p className="text-right">{name}</p>
      <select
        className={selectClassName}
        value={value}
        onChange={(e) => {
          setValue(e.target.value);
          onChange(e.target.value);
        }}
      >
        {values.map((value) => (
          <option key={value}>{value}</option>
        ))}
      </select>
    </>
  );
}
