"use client";

import { createSynthAudioContext } from "@/app/audio-context";
import { useEffect, useMemo, useState } from "react";
import { Instrument, monoVoice } from "synthlet";
import { ExamplePane } from "./components/ExamplePane";
import { Keyboard } from "./components/Keyboard";
import { PresetPicker } from "./components/PresetPicker";
import { Slider } from "./components/Slider";

const createInstrument = (context: AudioContext, voices: number) =>
  Instrument(context, monoVoice, { voices });

type MonoInstrument = ReturnType<typeof createInstrument>;

/**
 * `useSynth`, plus two things this page needs and no other example does: the
 * instrument is rebuilt when the voice count changes - the pool is fixed, so a
 * different size is a different instrument - and the state is only published
 * after `ready`, because `params` is empty until the pool exists.
 */
function useInstrument(voices: number) {
  const [synth, setSynth] = useState<MonoInstrument | null>(null);

  useEffect(() => {
    let bye = false;
    let instrument: MonoInstrument | undefined;
    createSynthAudioContext().then(async (context) => {
      if (bye) return;
      instrument = createInstrument(context, voices);
      instrument.connect(context.destination);
      await instrument.ready;
      if (bye) return;
      setSynth(instrument);
    });
    return () => {
      bye = true;
      setSynth(null);
      instrument?.dispose();
    };
  }, [voices]);

  return synth;
}

function Example() {
  const [voices, setVoices] = useState(8);
  const [preset, setPreset] = useState<string>("");
  const [hold, setHold] = useState(false);
  const synth = useInstrument(voices);

  // `glide` is an instrument option, not an `AudioParam` - the allocator
  // applies it - so the slider gets a two-line view of it instead.
  const glide = useMemo(
    () => ({
      get value() {
        return synth?.glide ?? 0;
      },
      set value(seconds: number) {
        if (synth) synth.glide = seconds;
      },
    }),
    [synth],
  );

  // `Slider` re-reads its `param` whenever the object's identity changes, so
  // every one of these views is memoised rather than rebuilt each render.
  const voiceCount = useMemo(
    () => ({
      get value() {
        return voices;
      },
      // The pool is built once, so a new count is a new instrument: this
      // rebuilds rather than writes. `voices: 1` is the monosynth, with the
      // note stack and the glide.
      set value(count: number) {
        setVoices(count);
      },
    }),
    [voices],
  );

  // The output gain is linear; the slider is in dB, which is how a mixer reads.
  const volume = useMemo(
    () => ({
      get value() {
        return synth ? 20 * Math.log10(Math.max(synth.volume.value, 1e-6)) : 0;
      },
      set value(db: number) {
        if (synth) synth.volume.value = 10 ** (db / 20);
      },
    }),
    [synth],
  );

  useEffect(() => {
    if (synth) synth.hold = hold;
  }, [synth, hold]);

  if (!synth) return null;

  const specs = monoVoice.params;

  return (
    <>
      <Keyboard
        baseNote={48}
        octaves={2}
        onNoteOn={(note) => synth.start({ note })}
        onNoteOff={(note) => synth.stop(note)}
      />
      <p className="text-xs mt-1 opacity-70">
        Click the keys, or play the <code>z</code> and <code>q</code> rows of
        your computer keyboard. There is no arpeggiator over the held notes yet
        - see what is deferred, and why, in the package README.
      </p>

      <div className="grid grid-cols-4 gap-2 items-center mt-4">
        <PresetPicker
          presets={synth.presets}
          labelClassName="text-right"
          selectClassName="col-span-3"
          onChange={(name) => {
            setPreset(name);
            synth.setPreset(name);
          }}
        />
        <Slider
          label="Voices"
          labelClassName="text-right"
          inputClassName="col-span-2"
          min={1}
          max={8}
          step={1}
          param={voiceCount}
        />
        <Slider
          // `Bass` carries `glide: 0.04` - a reserved preset key sets the
          // instrument option, so the slider has to re-read after a load.
          key={`${preset}-glide`}
          label="Glide"
          labelClassName="text-right"
          inputClassName="col-span-2"
          min={0}
          max={1}
          units="s"
          param={glide}
        />
        <label className="col-span-2">
          <input
            className="mr-2"
            type="checkbox"
            checked={hold}
            onChange={(event) => setHold(event.target.checked)}
          />
          Hold (sustain pedal)
        </label>
      </div>

      <div className="grid grid-cols-4 gap-2 items-center mt-4 pt-2 border-t">
        {/* Every knob is an `AudioParam` on a fan-out node, shared by every
            voice - which is why these are the same `Slider` the one-voice
            examples use. The key remounts them when a preset is loaded, so
            they show the sound that is actually playing. */}
        <Slider
          key={`${preset}-cutoff`}
          label="Cutoff"
          labelClassName="text-right"
          inputClassName="col-span-2"
          min={specs.cutoff.min}
          max={specs.cutoff.max}
          units="Hz"
          param={synth.params.cutoff}
        />
        <Slider
          key={`${preset}-resonance`}
          label="Resonance"
          labelClassName="text-right"
          inputClassName="col-span-2"
          min={specs.resonance.min}
          max={specs.resonance.max}
          param={synth.params.resonance}
        />
        <Slider
          key={`${preset}-attack`}
          label="Attack"
          labelClassName="text-right"
          inputClassName="col-span-2"
          min={specs.attack.min}
          // The parameter goes to 10 s, which is a drone rather than an
          // attack: a slider whose default sits at 0.1 % of its travel is not
          // a control. The range a knob gets is the UI's decision.
          max={Math.min(specs.attack.max, 2)}
          units="s"
          param={synth.params.attack}
        />
        <Slider
          label="Volume"
          labelClassName="text-right"
          inputClassName="col-span-2"
          min={-48}
          max={0}
          units="dB"
          param={volume}
        />
      </div>
    </>
  );
}

export default () => (
  <ExamplePane label="Instrument">
    <Example />
  </ExamplePane>
);
