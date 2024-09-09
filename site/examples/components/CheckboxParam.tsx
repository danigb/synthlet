import { useState } from "react";

export function CheckboxParam({
  className,
  name,
  param,
}: {
  className?: string;
  name: String;
  param: { value: number };
}) {
  const [checked, setChecked] = useState(param.value === 1);
  return (
    <label className={className}>
      {name}
      <input
        className="ml-2"
        type="checkbox"
        checked={checked}
        onChange={(e) => {
          setChecked(e.target.checked);
          param.value = e.target.checked ? 1 : 0;
        }}
      />
    </label>
  );
}
