/*
 * A sound by name.
 *
 * A preset is not a feature of a synthesiser; it is a file format. `getPreset()`
 * returns a flat object of parameter values plus the three options that travel
 * with a sound - glide, legato, priority - and `setPreset` writes every declared
 * parameter, including the ones the preset does not name, which are written
 * with their defaults. That last rule is the one that matters: loading "flute"
 * after "bass" must not inherit the bass's cutoff, because a sound that depends
 * on what was loaded before it is exactly what a name is supposed to remove.
 *
 * The bank is `site/learn/voice/presets.ts` - the same sixteen the Playground's
 * gallery shows - and the picker below is one line in this file's `set value`.
 */

import { Compound, Gain, Instrument } from "synthlet";
import { GALLERY_PRESET_NAMES, learnVoice } from "../../voice";
import { definePatch, type ValueRef } from "../define";

const VOICES = 8;
const LEVEL = 0.125;

function build(ac: AudioContext) {
  const instrument = Instrument(ac, learnVoice, {
    voices: VOICES,
    preset: GALLERY_PRESET_NAMES[0],
  });

  const analyser = ac.createAnalyser();
  analyser.fftSize = 4096;
  analyser.smoothingTimeConstant = 0.6;
  analyser.minDecibels = -100;
  analyser.maxDecibels = -10;

  const level = Gain.val(ac, LEVEL);
  const out = Gain.val(ac, 0);
  instrument.connect(analyser).connect(level).connect(out);

  let chosen = 0;
  const preset: ValueRef = {
    get value() {
      return chosen;
    },
    set value(next: number) {
      chosen = Math.min(
        GALLERY_PRESET_NAMES.length - 1,
        Math.max(0, Math.round(next)),
      );
      instrument.setPreset(GALLERY_PRESET_NAMES[chosen]);
    },
  };

  return Compound({
    output: out,
    owns: [instrument, analyser, level],
    exposes: { instrument, analyser, preset, ready: instrument.ready },
  });
}

export default definePatch({
  id: "voices/presets",
  label: "Presets",
  build,
  controls: [
    {
      id: "preset",
      kind: "select",
      label: "Sound",
      help: "Sixteen names, one write per parameter each.",
      param: (s) => s.preset,
      options: [...GALLERY_PRESET_NAMES],
      default: 0,
    },
  ],
  views: [
    {
      kind: "keyboard",
      label: "Keyboard",
      options: { from: "C3", octaves: 3 },
      noteOn: (s) => (note, velocity) => {
        s.instrument.start({ note, velocity });
      },
      noteOff: (s) => (note) => {
        s.instrument.stop(note);
      },
    },
    { kind: "meter", label: "Output", options: { show: ["peak"] } },
    { kind: "spectrum", label: "Spectrum", source: (s) => s.analyser },
  ],
});
