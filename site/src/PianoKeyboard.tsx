"use client";

import { useState } from "react";
const buildOct = (base: number) =>
  [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11].map((n) => n + base);

const isBlack = (midi: number) => [1, 3, 6, 8, 10].includes(midi % 12);

type PianoKeyboardNote = {
  note: number;
  velocity: number;
  time?: number;
  duration?: number;
};

export function PianoKeyboard({
  className,
  borderColor = "border-blue-700",
  onPress,
  onRelease,
  hold = false,
}: {
  className?: string;
  borderColor?: string;
  onPress: (note: PianoKeyboardNote) => void;
  onRelease?: (midi: number) => void;
  hold?: boolean;
}) {
  const [velocity, setVelocity] = useState(100);
  const [oct, setOct] = useState(60);
  const [isHold, setIsHold] = useState(hold);
  const isPlaying = (midi: number) => false;

  function release(midi: number) {
    if (!isHold && onRelease) onRelease(midi);
  }

  return (
    <div className={className}>
      <div className={`piano-container border-t-8 ${borderColor}`}>
        {[...buildOct(oct), ...buildOct(oct + 12)].map((midi) =>
          isBlack(midi) ? (
            <div key={midi} className={"accidental-key__wrapper"}>
              <button
                className={`accidental-key ${
                  isPlaying(midi) ? "accidental-key--playing" : ""
                }`}
                onMouseDown={() => {
                  onPress({ note: midi, velocity });
                }}
                onMouseUp={() => {
                  release(midi);
                }}
              >
                <div className={"text"}></div>
              </button>
            </div>
          ) : (
            <button
              key={midi}
              className={`natural-key ${
                isPlaying(midi) ? "natural-key--playing" : ""
              }`}
              onMouseDown={() => onPress({ note: midi, velocity })}
              onMouseUp={() => release(midi)}
            >
              <div className={"text"}></div>
            </button>
          )
        )}
      </div>
      <div className="flex gap-1 items-center mt-1">
        <div>
          Octave: {oct}-{oct + 12 + 11}
        </div>
        <button
          className="bg-zinc-900 px-1 rounded"
          onClick={() => {
            setOct(oct - 12);
          }}
        >
          -
        </button>
        <button
          className="bg-zinc-900 px-1 rounded"
          onClick={() => {
            setOct(oct + 12);
          }}
        >
          +
        </button>

        <div className="ml-3">Velocity: {velocity}</div>
        <input
          type="range"
          min={0}
          max={127}
          value={velocity}
          onChange={(e) => setVelocity(e.target.valueAsNumber)}
        />

        <button
          className={`px-2 py-1 rounded ${
            isHold ? "bg-yellow-400 text-zinc-800" : "bg-zinc-700"
          }
        `}
          onClick={() => {
            if (isHold) {
              onRelease?.(0);
            }
            setIsHold(!isHold);
          }}
        >
          {isHold ? "Stop" : "Hold"}
        </button>
      </div>
    </div>
  );
}
