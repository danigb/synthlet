import { useState } from "react";

export function FrequencySelector({
  label,
  param,
}: {
  label: string;
  param: { value: number };
}) {
  const NOTES = "C C# D D# E F F# G G# A A# B".split(" ");

  const [freq, setFreq] = useState(param.value);

  const updateFreq = (freq: number) => {
    setFreq(freq);
    param.value = freq;
  };

  return (
    <>
      <p className={"text-right"}>{label}</p>
      <input
        className={"col-span-2"}
        type="range"
        min={20}
        max={20000}
        step={1}
        value={freq}
        onChange={(e) => {
          updateFreq(e.target.valueAsNumber);
        }}
      />
      <p className={""}>{freq.toFixed(2)}</p>
      <p></p>
      <div className="col-span-3 flex gap-1">
        {NOTES.map((note, i) => (
          <button
            key={note}
            className="border border-white px-1 rounded opacity-70 hover:opacity-80 py-0"
            onClick={() => {
              updateFreq(440 * Math.pow(2, i / 12));
            }}
          >
            {note}
          </button>
        ))}
      </div>
    </>
  );
}
