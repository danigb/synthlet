import { useState } from "react";

export function GateControls({
  onGateChanged,
}: {
  onGateChanged: (on: boolean) => void;
}) {
  const [isOn, setOn] = useState(false);
  return (
    <div className="flex gap-2 mt-4 items-center">
      <div
        className={`w-4 h-4 rounded-full border ${
          isOn ? "bg-blue-100" : "bg-transparent"
        }`}
      />
      <button
        className="border border-white px-1 rounded opacity-70 hover:opacity-80"
        onMouseDown={() => {
          onGateChanged(true);
          setOn(true);
        }}
        onMouseUp={() => {
          onGateChanged(false);
          setOn(false);
        }}
        onMouseLeave={() => {
          onGateChanged(false);
          setOn(false);
        }}
      >
        Gate
      </button>
      <button
        className="border border-white px-1 rounded opacity-70 hover:opacity-80"
        onClick={() => {
          const value = !isOn;
          onGateChanged(value);
          setOn(value);
        }}
      >
        On/off
      </button>
    </div>
  );
}
