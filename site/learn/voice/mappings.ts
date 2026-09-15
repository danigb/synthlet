import type { LearnVoiceParam } from "./params";

/*
 * What the pad moves, per preset.
 *
 * Ableton's Playground ships a `*.mapping` beside every sound: one or two engine
 * parameters bound to each axis of the XY pad, chosen by hand for what makes
 * *that* sound move. `wowbass` is X to the filter frequency and Y to the
 * resonance; `two-sounds-in-one` is X to the LFO rate and the pulse width
 * together, Y to the resonance and the filter LFO amount. Those two are
 * transcribed; the other fourteen are this voice's own.
 *
 * It is a file of data and one function, and it imports the parameter names and
 * nothing else - the same rule a patch is held to, for the same reason: what the
 * pad means is content, and the arithmetic that moves it belongs to whoever is
 * writing an `AudioParam`.
 *
 * **A binding is an axis, not a modulation matrix.** Two axes and a handful of
 * parameters each. Anything more general is the Playground becoming a synth
 * editor, which the documentation's `InstrumentExample` already is.
 */

export interface PadBinding {
  param: LearnVoiceParam;
  /** Where the parameter sits at the left, or at the bottom, of the pad. */
  min: number;
  /** Where it sits at the right, or at the top. */
  max: number;
  /**
   * `log` for a frequency, because the ear hears ratios and a linear axis
   * spends four fifths of its travel above 4 kHz. Defaults to `lin`.
   */
  curve?: "lin" | "log";
}

export interface PadAxis {
  /** What this axis does, in the reader's words rather than the DSP's. */
  label: string;
  bind: PadBinding[];
}

export interface PadMapping {
  x: PadAxis;
  y: PadAxis;
}

/**
 * The pad for a preset that declares none: the two knobs every synthesist
 * reaches for first, which is also the pair Part 12 spends itself on.
 */
export const DEFAULT_PAD_MAPPING: PadMapping = {
  x: {
    label: "Cutoff",
    bind: [{ param: "cutoff", min: 60, max: 12000, curve: "log" }],
  },
  y: {
    label: "Resonance",
    bind: [{ param: "resonance", min: 0.7, max: 12 }],
  },
};

/**
 * One mapping per gallery preset.
 *
 * The lesson bank has none: a lesson's preset is two sliders and an idea, and a
 * reader who arrives at the Playground from one gets the default pad, which is
 * the pair the lesson was probably about anyway.
 */
export const PAD_MAPPINGS: Record<string, PadMapping> = {
  bass: {
    x: {
      label: "Cutoff",
      bind: [{ param: "cutoff", min: 90, max: 2400, curve: "log" }],
    },
    y: {
      label: "Resonance",
      bind: [{ param: "resonance", min: 0.7, max: 12 }],
    },
  },

  // Ableton's `wowbass`, verified: X is the filter frequency, Y the resonance.
  "wow-bass": {
    x: {
      label: "Cutoff",
      bind: [{ param: "cutoff", min: 80, max: 1600, curve: "log" }],
    },
    y: {
      label: "Resonance",
      bind: [{ param: "resonance", min: 0.7, max: 12 }],
    },
  },

  sub: {
    x: {
      label: "Tone",
      bind: [{ param: "cutoff", min: 120, max: 4000, curve: "log" }],
    },
    y: { label: "Edge", bind: [{ param: "pulseLevel", min: 0, max: 0.8 }] },
  },

  lead: {
    x: {
      label: "Brightness",
      bind: [{ param: "cutoff", min: 400, max: 9000, curve: "log" }],
    },
    // Depth and rate together: a vibrato that gets wider without getting faster
    // is a sound nobody plays.
    y: {
      label: "Vibrato",
      bind: [
        { param: "pitchLfo", min: 0, max: 1.2 },
        { param: "lfoRate", min: 4, max: 7 },
      ],
    },
  },

  pluck: {
    x: { label: "Bite", bind: [{ param: "filterEnv", min: 500, max: 8000 }] },
    y: { label: "Length", bind: [{ param: "decay", min: 0.08, max: 1.2 }] },
  },

  strings: {
    x: {
      label: "Brightness",
      bind: [{ param: "cutoff", min: 700, max: 7000, curve: "log" }],
    },
    y: {
      label: "Shimmer",
      bind: [
        { param: "pulseWidthLfo", min: 0, max: 0.4 },
        { param: "lfoRate", min: 0.2, max: 1.2 },
      ],
    },
  },

  brass: {
    x: { label: "Blow", bind: [{ param: "filterEnv", min: 1000, max: 7000 }] },
    // Parts 25-27: how long the tone takes to open *is* the lip.
    y: { label: "Lip", bind: [{ param: "modAttack", min: 0.02, max: 1.2 }] },
  },

  flute: {
    x: {
      label: "Breath",
      bind: [{ param: "noiseLevel", min: 0.05, max: 0.6 }],
    },
    y: {
      label: "Vibrato",
      bind: [
        { param: "filterLfo", min: 0, max: 800 },
        { param: "lfoRate", min: 3, max: 7 },
      ],
    },
  },

  kick: {
    x: { label: "Punch", bind: [{ param: "pitchEnv", min: 2, max: 12 }] },
    y: { label: "Boom", bind: [{ param: "decay", min: 0.08, max: 0.8 }] },
  },

  hat: {
    x: {
      label: "Sizzle",
      bind: [{ param: "cutoff", min: 3000, max: 12000, curve: "log" }],
    },
    y: { label: "Open", bind: [{ param: "decay", min: 0.01, max: 0.3 }] },
  },

  siren: {
    x: {
      label: "Speed",
      bind: [{ param: "lfoRate", min: 0.1, max: 8, curve: "log" }],
    },
    y: { label: "Sweep", bind: [{ param: "filterLfo", min: 500, max: 5000 }] },
  },

  laser: {
    x: { label: "Drop", bind: [{ param: "pitchEnv", min: 2, max: 12 }] },
    y: { label: "Length", bind: [{ param: "modDecay", min: 0.05, max: 0.8 }] },
  },

  "bouncing-ball": {
    x: { label: "Bounce", bind: [{ param: "pitchEnv", min: 1, max: 12 }] },
    y: {
      label: "Tone",
      bind: [{ param: "cutoff", min: 500, max: 8000, curve: "log" }],
    },
  },

  "old-computer": {
    x: {
      label: "Chatter",
      bind: [{ param: "lfoRate", min: 2, max: 30, curve: "log" }],
    },
    y: { label: "Range", bind: [{ param: "pitchLfo", min: 1, max: 12 }] },
  },

  grit: {
    x: {
      label: "Grind",
      bind: [{ param: "cutoff", min: 300, max: 5000, curve: "log" }],
    },
    y: { label: "Bite", bind: [{ param: "resonance", min: 2, max: 12 }] },
  },

  // Ableton's `two-sounds-in-one`, verified: X is the LFO rate *and* the pulse
  // width, Y the resonance *and* the filter LFO amount. Two parameters per axis
  // is what makes the sound arrive somewhere else rather than get brighter.
  "two-sounds-in-one": {
    x: {
      label: "Movement",
      bind: [
        { param: "lfoRate", min: 0.1, max: 6, curve: "log" },
        { param: "pulseWidth", min: 0.1, max: 0.5 },
      ],
    },
    y: {
      label: "Growl",
      bind: [
        { param: "resonance", min: 0.7, max: 10 },
        { param: "filterLfo", min: 200, max: 3000 },
      ],
    },
  },
};

/** The pad for a preset, or the default one. A name nobody knows gets it too. */
export function padMapping(preset?: string): PadMapping {
  return (preset && PAD_MAPPINGS[preset]) || DEFAULT_PAD_MAPPING;
}

/**
 * What a binding is worth at a position on its axis, 0 at the left or the
 * bottom and 1 at the right or the top.
 *
 * One taper in one place, because the patch writes this value into an
 * `AudioParam` and the page records the same number so that the link it writes
 * says what the sound is doing. Two implementations would be two answers.
 */
export function bindingValue(binding: PadBinding, position: number): number {
  const p = Math.min(1, Math.max(0, position));
  const { min, max, curve } = binding;
  // A log taper needs a positive floor; a binding that asks for one from 0 gets
  // the straight line rather than a NaN.
  if (curve === "log" && min > 0) return min * (max / min) ** p;
  return min + p * (max - min);
}

/** The inverse: where on the axis a binding's value already sits. */
export function bindingPosition(binding: PadBinding, value: number): number {
  const { min, max, curve } = binding;
  if (max === min) return 0;
  const position =
    curve === "log" && min > 0 && value > 0
      ? Math.log(value / min) / Math.log(max / min)
      : (value - min) / (max - min);
  return Math.min(1, Math.max(0, position));
}
