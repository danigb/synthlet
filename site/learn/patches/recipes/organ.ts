/*
 * Nine sine waves, nine sliders, no envelope, and a click at the front.
 *
 * A Hammond's nine drawbars are harmonics **1, 3, 2, 4, 6, 8, 10, 12 and 16**
 * of the 16' pitch (Part 55), which is why there is no fifth, seventh, ninth,
 * eleventh, thirteenth, fourteenth or fifteenth harmonic anywhere on the
 * instrument. Each bar has nine positions, so a single manual offers
 * 387,420,489 registrations, and the four buttons here are the ones Reid names.
 *
 * The key sounds the 8' pitch, so relative to the note you play the nine
 * ratios are 0.5, 1.5, 1, 2, 3, 4, 5, 6 and 8.
 *
 * **There is no contour.** A Hammond key is a switch: it connects nine
 * tonewheels to the bus and disconnects them again, and the two-millisecond
 * ramp below is there so the switch does not click in a way the instrument
 * never did. The click that *is* the instrument is a separate impulse, because
 * the real one comes from nine contacts closing at slightly different moments.
 *
 * Percussion is a three-way select rather than a toggle, because Part 57's
 * control is: it "adds a greater or lesser amount of either the second or
 * third harmonic of the 8' - ie. of the 4' or 2 2/3' drawbar - as an accent at
 * the start of the note". Reid names two side effects and both are modelled
 * here: switching it on **drops the sustained level**, and it is
 * **single-triggering** - hold a note down and the next one gets no accent.
 *
 * The sibling of `modulation/additive.ts`, which built the same nine
 * oscillators for Part 14 and called them a Hammond.
 *
 * No diagram: nine sources (13b).
 */

import {
  AdAmp,
  Compound,
  Gain,
  Impulse,
  Oscillator,
  Param,
  toFrequency,
  toMidi,
} from "synthlet";
import { definePatch } from "../define";

/** The nine drawbars, relative to the played (8') note. */
const RATIOS = [0.5, 1.5, 1, 2, 3, 4, 5, 6, 8];

/** What the front panel calls them. */
const FOOTAGE = [
  "16'",
  "5 1/3'",
  "8'",
  "4'",
  "2 2/3'",
  "2'",
  "1 3/5'",
  "1 1/3'",
  "1'",
];

/** A drawbar's travel: nine positions, zero to eight. */
const FULL = 8;

/** `88 8000 000` - Jimmy Smith's, and Keith Emerson's. */
const JIMMY_SMITH = [8, 8, 8, 0, 0, 0, 0, 0, 0];
/** `88 8888 888` - everything. */
const FULL_ORGAN = [8, 8, 8, 8, 8, 8, 8, 8, 8];
/** `83 4211 100` - as close as a Hammond gets to a sawtooth. */
const SAWTOOTH = [8, 3, 4, 2, 1, 1, 1, 0, 0];
/** `00 8030 200` - as close as it gets to odd harmonics only. */
const SQUARE = [0, 0, 8, 0, 3, 0, 2, 0, 0];

const DEFAULT_NOTE = "C4";
const PERCUSSION = ["Off", "Second (4')", "Third (2 2/3')"];
/** Which oscillator each percussion setting taps. */
const PERC_BAR = [-1, 3, 4];

/** Percussion "reduces the loudness of the sustained part" (Part 57). */
const PERC_SUSTAIN = 0.7;

const DEFAULT_CLICK = 0.3;

/** Nine sines in phase peak together, so the trim is low. */
const LEVEL = 0.035;
/** Long enough that a switch is not a step, short enough that it is a switch. */
const SWITCH = 0.002;

function build(ac: AudioContext) {
  const start = toFrequency(toMidi(DEFAULT_NOTE));

  const oscillators = RATIOS.map((ratio) =>
    Oscillator(ac, { type: "sine", frequency: start * ratio }),
  );
  const gains = oscillators.map((_, index) =>
    Gain.val(ac, JIMMY_SMITH[index] / FULL),
  );
  const mixer = Gain.val(ac, 1);
  oscillators.forEach((osc, index) => {
    osc.connect(gains[index]).connect(mixer);
  });

  // The key, as a switch and nothing else.
  const keyGate = Gain.val(ac, 0);
  mixer.connect(keyGate);

  const trigger = Param.input(ac, 0);

  // Percussion taps an oscillator ahead of its drawbar, so the accent is the
  // same whatever the registration is - which is what the real one does.
  const percTaps = PERC_BAR.map(() => Gain.val(ac, 0));
  const percSource = Gain.val(ac, 1);
  PERC_BAR.forEach((bar, index) => {
    if (bar < 0) return;
    oscillators[bar].connect(percTaps[index]).connect(percSource);
  });
  const percAmp = AdAmp(ac, { trigger, attack: 0.001, decay: 0.2 });
  percSource.connect(percAmp);

  const click = Impulse(ac, { trigger });
  const clickGain = Gain.val(ac, DEFAULT_CLICK);
  click.connect(clickGain);

  const bus = Gain.val(ac, 1);
  keyGate.connect(bus);
  percAmp.connect(bus);
  clickGain.connect(bus);

  const analyser = ac.createAnalyser();
  analyser.fftSize = 8192;
  analyser.smoothingTimeConstant = 0.6;
  analyser.minDecibels = -100;
  analyser.maxDecibels = -10;

  const level = Gain.val(ac, LEVEL);
  const out = Gain.val(ac, 0);
  bus.connect(analyser).connect(level).connect(out);

  const positions = [...JIMMY_SMITH];
  const hold = (index: number) => {
    const now = ac.currentTime;
    gains[index].gain.cancelScheduledValues(now);
    gains[index].gain.setValueAtTime(positions[index] / FULL, now);
  };
  const bars = positions.map((_, index) => ({
    get value() {
      return positions[index];
    },
    set value(next: number) {
      positions[index] = Math.min(FULL, Math.max(0, Math.round(next)));
      hold(index);
    },
  }));

  const registration = (wanted: number[]) => () => {
    wanted.forEach((position, index) => {
      positions[index] = position;
      hold(index);
    });
  };

  let percussion = 0;
  const perc = {
    get value() {
      return percussion;
    },
    set value(next: number) {
      percussion = Math.min(2, Math.max(0, Math.round(next)));
      const now = ac.currentTime;
      percTaps.forEach((tap, index) => {
        tap.gain.setTargetAtTime(index === percussion ? 1 : 0, now, SWITCH);
      });
      mixer.gain.setTargetAtTime(
        percussion === 0 ? 1 : PERC_SUSTAIN,
        now,
        SWITCH,
      );
    },
  };

  const held = new Set<string>();
  const play = (note: string) => {
    // Single-triggering: an accent only when nothing was already down.
    const first = held.size === 0;
    held.add(note);
    const frequency = toFrequency(toMidi(note));
    oscillators.forEach((osc, index) => {
      osc.frequency.value = frequency * RATIOS[index];
    });
    const now = ac.currentTime;
    keyGate.gain.cancelScheduledValues(now);
    keyGate.gain.setValueAtTime(keyGate.gain.value, now);
    keyGate.gain.linearRampToValueAtTime(1, now + SWITCH);
    if (first) {
      trigger.input.cancelScheduledValues(now);
      trigger.input.setValueAtTime(1, now);
      trigger.input.setValueAtTime(0, now + 0.005);
    }
  };
  const stop = (note: string) => {
    held.delete(note);
    if (held.size > 0) return;
    const now = ac.currentTime;
    keyGate.gain.cancelScheduledValues(now);
    keyGate.gain.setValueAtTime(keyGate.gain.value, now);
    keyGate.gain.linearRampToValueAtTime(0, now + SWITCH);
  };

  return Compound({
    output: out,
    owns: [
      ...oscillators,
      ...gains,
      mixer,
      keyGate,
      trigger,
      ...percTaps,
      percSource,
      percAmp,
      click,
      clickGain,
      bus,
      analyser,
      level,
    ],
    exposes: {
      oscillators,
      gains,
      mixer,
      analyser,
      bars,
      clickGain,
      perc,
      play,
      stop,
      jimmySmith: registration(JIMMY_SMITH),
      fullOrgan: registration(FULL_ORGAN),
      sawtooth: registration(SAWTOOTH),
      square: registration(SQUARE),
    },
  });
}

/** One drawbar, as a control. The label is the footage written on it. */
const drawbar = (index: number) => ({
  id: `drawbar${index + 1}`,
  kind: "slider" as const,
  label: FOOTAGE[index],
  param: (s: ReturnType<typeof build>) => s.bars[index],
  min: 0,
  max: FULL,
  step: 1,
  default: JIMMY_SMITH[index],
});

export default definePatch({
  id: "recipes/organ",
  label: "Tonewheel organ",
  build,
  controls: [
    ...RATIOS.map((_, index) => drawbar(index)),
    {
      id: "percussion",
      kind: "select",
      label: "Percussion",
      help: "An accent of the 4' or the 2 2/3' at note-on. It also lowers the sustained level.",
      param: (s) => s.perc,
      options: PERCUSSION,
      default: 0,
    },
    {
      id: "click",
      kind: "slider",
      label: "Key click",
      help: "Nine contacts closing at nine slightly different moments.",
      param: (s) => s.clickGain.gain,
      min: 0,
      max: 1,
      step: 0.01,
      default: DEFAULT_CLICK,
    },
    {
      id: "jimmySmith",
      kind: "button",
      label: "88 8000 000",
      help: "Jimmy Smith's, and Keith Emerson's: the first three harmonics, full out.",
      action: (s) => s.jimmySmith,
    },
    {
      id: "fullOrgan",
      kind: "button",
      label: "88 8888 888",
      help: "Everything. Nine harmonics of the sixteen foot, all the way out.",
      action: (s) => s.fullOrgan,
    },
    {
      id: "sawtooth",
      kind: "button",
      label: "83 4211 100",
      help: "As close to a 1/n series as nine drawbars with seven harmonics missing get.",
      action: (s) => s.sawtooth,
    },
    {
      id: "square",
      kind: "button",
      label: "00 8030 200",
      help: "The closest a Hammond gets to odd harmonics only.",
      action: (s) => s.square,
    },
  ],
  views: [
    {
      kind: "keyboard",
      label: "Keyboard",
      noteOn: (s) => (note) => s.play(note),
      noteOff: (s) => (note) => s.stop(note),
      options: { from: "C3", octaves: 2 },
    },
    {
      kind: "spectrum",
      label: "Spectrum",
      source: (s) => s.analyser,
      // The nine, and the seven gaps between them that a Hammond cannot fill.
      options: {
        marks: (s) =>
          RATIOS.map((ratio) => ratio * s.oscillators[2].frequency.value),
      },
    },
    { kind: "scope", label: "Waveform", source: (s) => s.analyser },
  ],
  // The header above is an essay about a Hammond; the code is the patch. "View
  // the code" opens on the imports.
  code: { lines: [32, 332] },
});
