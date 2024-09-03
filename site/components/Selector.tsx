import { useEffect, useState } from "react";

type SelectorValue<T> = T | { name: string; value: T };

export function Selector<T>({
  name,
  initialValue,
  values,
  onChange,
  selectClassName,
  initialize,
}: {
  name: string;
  values: readonly SelectorValue<T>[];
  onChange: (value: T) => void;
  initialValue: string;
  selectClassName?: string;
  initialize?: boolean;
  format?: (value: string) => string;
}) {
  const [value, setValue] = useState<string>(initialValue);

  const valueOf = (value: SelectorValue<T>) =>
    typeof value === "string" ? value : value.value;
  const nameOf = (value: SelectorValue<T>) =>
    typeof value === "string" ? value : value.name;

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
          <option key={valueOf(value)}>{nameOf(value)}</option>
        ))}
      </select>
    </>
  );
}
