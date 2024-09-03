import { useEffect, useState } from "react";

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
        {values.map((type) => (
          <option key={type}>{type}</option>
        ))}
      </select>
    </>
  );
}
