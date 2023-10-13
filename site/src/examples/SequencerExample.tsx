import { useEffect, useState } from "react";
import { getAudioContext } from "src/audio-context";
import { loadSynthlet } from "../../../dist";

export function SequencerExample() {
  const [isPlaying, setIsPlaying] = useState(false);

  useEffect(() => {
    loadSynthlet(getAudioContext());
  }, []);

  return (
    <div>
      <button
        className="bg-emerald-500 py-1 px-2 rounded"
        onMouseDown={() => {
          setIsPlaying(true);
        }}
        onMouseUp={() => {
          setIsPlaying(false);
        }}
        onMouseLeave={() => {
          setIsPlaying(false);
        }}
      >
        {isPlaying ? "Playing..." : "Play"}
      </button>
    </div>
  );
}
