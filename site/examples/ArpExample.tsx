"use client";

import { useEffect, useState } from "react";
import {
  Arp,
  ArpScale,
  Clock,
  Compound,
  DattorroReverb,
  Gain,
  MonoSynth,
  Param,
} from "synthlet";
import { ExamplePane } from "./components/ExamplePane";
import { SelectorParam } from "./components/Selector";
import { Slider } from "./components/Slider";
import { useSynth } from "./useSynth";

/** Every `ArpMode`, in enum order, so the index *is* the parameter value. */
const MODES = [
  "Up",
  "Down",
  "UpDownExclusive",
  "UpDownInclusive",
  "Random",
  "RandomOther",
];

/** Every `ArpOctaveMode`, likewise. */
const OCTAVE_MODES = ["Serial", "Repeat"];

/**
 * A chord progression as four pitch-class masks over one root.
 *
 * This is the thing no hardware arpeggiator can do: `scale` is an `AudioParam`,
 * so the chord is automation rather than something held in your fingers. The
 * root stays at C and each chord is named relative to it, which is all a
 * 12-bit mask can express - and all it needs to.
 */
const PROGRESSION = [
  { name: "Cm", mask: ArpScale.TriadMinor }, // 0 3 7
  { name: "A♭", mask: (1 << 8) | (1 << 0) | (1 << 3) }, // 8 0 3
  { name: "E♭", mask: (1 << 3) | (1 << 7) | (1 << 10) }, // 3 7 10
  { name: "B♭", mask: (1 << 10) | (1 << 2) | (1 << 5) }, // 10 2 5
];

function ArpSynth(context: AudioContext) {
  const bpm = Param(context, { input: 240 });
  const scale = Param(context, { input: PROGRESSION[0].mask });
  const clock = Clock(context, { bpm });

  // A plain `Clock` and not a `Euclid`: this screen is about *order*, and a
  // rhythmic mask on top of it makes two figures harder to tell apart. The
  // rhythm axis has its own page.
  const arp = Arp(context, {
    trigger: clock.gate,
    baseNote: 48, // C3
    scale,
    octaves: 2,
  });

  const synth = MonoSynth(context, {
    gate: clock.gate,
    frequency: arp,
  });

  const reverb = DattorroReverb(context, { decay: 0.8 });
  const out = Gain(context);
  synth.connect(reverb);
  reverb.connect(out);

  return Compound({
    output: out,
    owns: [reverb, synth, arp, clock, scale, bpm],
    exposes: {
      bpm: bpm.input,
      scale: scale.input,
      mode: arp.mode,
      octaveMode: arp.octaveMode,
      octaves: arp.octaves,
    },
  });
}

function Example() {
  const synth = useSynth(ArpSynth);
  const [chord, setChord] = useState(0);

  // The progression, stepped from the main thread: two seconds a chord, which
  // is long enough to hear the arpeggio spell one out before it moves.
  useEffect(() => {
    if (!synth) return;
    const id = setInterval(() => {
      setChord((previous) => {
        const next = (previous + 1) % PROGRESSION.length;
        synth.scale.value = PROGRESSION[next].mask;
        return next;
      });
    }, 2000);
    return () => clearInterval(id);
  }, [synth]);

  if (!synth) return null;

  return (
    <>
      <div className="grid grid-cols-4 gap-4 items-center">
        <SelectorParam
          name="Mode"
          labelClassName="text-right"
          valueNames={MODES}
          param={synth.mode}
        />
        <SelectorParam
          name="Octave mode"
          labelClassName="text-right"
          valueNames={OCTAVE_MODES}
          param={synth.octaveMode}
        />
        <Slider
          label="Octaves"
          labelClassName="text-right"
          min={1}
          max={4}
          step={1}
          param={synth.octaves}
        />
        <Slider
          label="Tempo"
          labelClassName="text-right"
          min={60}
          max={480}
          units="bpm"
          param={synth.bpm}
        />
      </div>
      <div className="flex px-1 pt-2 mt-2 border-t border-fd-border gap-4">
        <p>
          Chord:{" "}
          {PROGRESSION.map((c, i) => (
            <span
              key={c.name}
              className={i === chord ? "font-bold" : "opacity-40"}
            >
              {c.name}{" "}
            </span>
          ))}
        </p>
        <p className="opacity-60">
          One root, four pitch-class masks — the progression is automation on{" "}
          <code>scale</code>.
        </p>
      </div>
    </>
  );
}

export default () => (
  <ExamplePane label="Arpeggiator">
    <Example />
  </ExamplePane>
);
