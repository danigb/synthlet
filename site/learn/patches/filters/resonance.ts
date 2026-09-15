/*
 * A filter with enough feedback to become an oscillator, and a keyboard to
 * play it with.
 *
 * The Moog ladder's feedback path saturates, so its loop gain falls as the
 * amplitude grows: above `resonance: 0.95` it settles into a sine of its own
 * instead of decaying or diverging, at a frequency that follows the cutoff.
 * That is Part 6's Step 5, and it is the reason this patch has keys: with the
 * source turned down and the cutoff following the note, the thing making the
 * sound is the filter.
 *
 * No `diagram`: the cutoff and the gate arrive at the same two boxes from the
 * same controller, and the kit's layout draws one control cable per box (10b).
 */

import {
  AdsrAmp,
  Compound,
  Gain,
  Param,
  PolyblepOscillator,
  PolyblepOscillatorType,
  toFrequency,
  toMidi,
  VirtualAnalogFilter,
} from "synthlet";
import { definePatch } from "../define";

const DEFAULT_NOTE = "A3";
const DEFAULT_RESONANCE = 0.7;

/**
 * Where the ladder's corner really is, as a fraction of the frequency asked
 * for.
 *
 * Asking a Moog ladder for 1000 Hz measures 907 (`virtual-analog-filter`'s
 * README, and its test suite). A cascade of four one-pole sections crosses
 * -3 dB below its design cutoff, and a filter that sings at its corner
 * therefore sings flat of the key that set it. Dividing by the ratio is what
 * the filter-tracking trimmer on the front of an analogue synth was for.
 */
const CORNER = 0.907;

/** A fixed trim, after the analyser. A ringing ladder is a loud thing. */
const LEVEL = 0.12;

/**
 * Not quite off.
 *
 * A digital filter with exactly nothing going into it has nothing to ring: its
 * state is zero, and zero times any amount of feedback is zero. A real circuit
 * always has some noise to start it, so "source off" leaves -74 dB of
 * oscillator in - inaudible, and enough to light the filter up.
 */
const SEED = 0.0002;

function build(ac: AudioContext) {
  const start = toFrequency(toMidi(DEFAULT_NOTE));
  const osc = PolyblepOscillator(ac, {
    type: PolyblepOscillatorType.Sawtooth,
    frequency: start,
  });
  const sourceGain = Gain.val(ac, 1);
  const ladder = VirtualAnalogFilter(ac, {
    type: VirtualAnalogFilter.MOOG_LADDER,
    frequency: start / CORNER,
    resonance: DEFAULT_RESONANCE,
  });

  // The keys are the gate, so a note is a note and not a drone with a pitch
  // that jumps. One `Param` fans it out - to the amplifier here, and to
  // whatever else a later lesson gates.
  const gate = Param(ac);
  const amp = AdsrAmp(ac, {
    gate,
    attack: 0.01,
    decay: 0.2,
    sustain: 0.8,
    release: 0.3,
  });

  const analyser = ac.createAnalyser();
  analyser.fftSize = 4096;
  analyser.smoothingTimeConstant = 0.6;

  const level = Gain.val(ac, LEVEL);
  const out = Gain.val(ac, 0);

  osc.connect(sourceGain).connect(ladder).connect(amp);
  amp.connect(analyser).connect(level).connect(out);

  // A key sets the pitch *and* the corner, which is what "the filter tracks the
  // keyboard" means. The Cutoff slider writes the same parameter, so it
  // overrides the tracking until the next key - two controls, one act, the way
  // `sound/harmonics` lets a switch and a slider share a cutoff.
  // On is the oscillator; off is `SEED` rather than nothing, for the reason
  // above. A toggle writes 1 and 0, so the two values live here.
  const source = {
    get value() {
      return sourceGain.gain.value > SEED ? 1 : 0;
    },
    set value(on: number) {
      sourceGain.gain.value = on ? 1 : SEED;
    },
  };

  const held = new Set<string>();
  const play = (note: string) => {
    held.add(note);
    const frequency = toFrequency(toMidi(note));
    osc.frequency.value = frequency;
    ladder.frequency.value = frequency / CORNER;
    gate.input.value = 1;
  };
  const release = (note: string) => {
    held.delete(note);
    if (held.size === 0) gate.input.value = 0;
  };

  return Compound({
    output: out,
    owns: [osc, sourceGain, ladder, gate, amp, analyser, level],
    exposes: { osc, sourceGain, source, ladder, amp, analyser, play, release },
  });
}

export default definePatch({
  id: "filters/resonance",
  label: "Resonance",
  build,
  controls: [
    {
      id: "resonance",
      kind: "slider",
      label: "Resonance",
      help: "Feedback around the filter. Past 0.95 it sings without being asked.",
      param: (s) => s.ladder.resonance,
      min: 0,
      max: 1,
      step: 0.01,
      default: DEFAULT_RESONANCE,
    },
    {
      id: "cutoff",
      kind: "slider",
      label: "Cutoff",
      help: "Where the peak sits. A key press moves it to that note.",
      param: (s) => s.ladder.frequency,
      min: 40,
      max: 8000,
      scale: "log",
      unit: "Hz",
    },
    {
      id: "source",
      kind: "toggle",
      label: "Source",
      help: "Off turns the oscillator down to a whisper, and leaves the filter.",
      param: (s) => s.source,
      default: 1,
    },
  ],
  views: [
    {
      kind: "keyboard",
      label: "Keyboard",
      noteOn: (s) => (note) => s.play(note),
      noteOff: (s) => (note) => s.release(note),
      options: { from: "C2", octaves: 2 },
    },
    {
      kind: "spectrum",
      label: "Spectrum",
      source: (s) => s.analyser,
      // The corner, over the resonant peak that grows on it. With the source
      // down there is nothing left in the picture but that one line and the
      // sine standing under it.
      options: {
        minDb: -100,
        maxDb: -10,
        marks: (s) => [s.ladder.frequency.value],
      },
    },
  ],
});
