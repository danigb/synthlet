import { useEffect, useRef, useState } from "react";
import { getAudioContext } from "src/audio-context";
import { Trigger, chain, loadSynthlet } from "synthlet";

type Synth = {
  gate: Trigger;
  disconnect: () => void;
};

export function SequencerExample() {
  const synth = useRef<null | Synth>(null);
  const [active, setActive] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);

  useEffect(() => {
    if (!active) return;
    loadSynthlet(getAudioContext()).then((S) => {
      console.log("CREATE SYNTH");
      const gate = S.trigger();
      synth.current = {
        gate,
        disconnect: chain(
          S.osc({ frequency: 440 }),
          S.adsr({ gate }),
          S.context.destination
        ),
      };
    });
    () => {
      synth.current?.disconnect();
      synth.current = null;
    };
  }, [active]);

  return (
    <div>
      <div className="flex gap-2 items-end">
        <h1 className="text-3xl text-teal-500">Sequencer</h1>
        <button
          className={`px-2 py-1 rounded ${
            active ? "bg-teal-500 text-zinc-800" : "bg-zinc-700 text-teal-500"
          }`}
          onClick={() => setActive((active) => !active)}
        >
          {active ? "⭘ off" : "⏼ on"}
        </button>
      </div>
      <button
        className="bg-emerald-500 py-1 px-2 rounded"
        onMouseDown={() => {
          setIsPlaying(true);
          synth.current?.gate.press();
        }}
        onMouseUp={() => {
          setIsPlaying(false);
          synth.current?.gate.release();
        }}
        onMouseLeave={() => {
          setIsPlaying(false);
          synth.current?.gate.release();
        }}
      >
        {isPlaying ? "Playing..." : "Play"}
      </button>
    </div>
  );
}
