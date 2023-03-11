export type MikaParams = {
  kOsc1Wave: number;
  kOsc1Coarse: number;
  kOsc1Fine: number;
  kOsc1Split: number;
  kOsc2Wave: number;
  kOsc2Coarse: number;
  kOsc2Fine: number;
  kOsc2Split: number;
  kOscMix: number;
  kFmMode: number;
  kFmCoarse: number;
  kFmFine: number;
  kFilterEnabled: number;
  kFilterCutoff: number;
  kFilterResonance: number;
  kFilterKeyTrack: number;
  kVolEnvA: number;
  kVolEnvD: number;
  kVolEnvS: number;
  kVolEnvR: number;
  kVolEnvV: number;
  kModEnvA: number;
  kModEnvD: number;
  kModEnvS: number;
  kModEnvR: number;
  kModEnvV: number;
  kLfoAmount: number;
  kLfoFrequency: number;
  kLfoDelay: number;
  kVolEnvFm: number;
  kVolEnvCutoff: number;
  kModEnvFm: number;
  kModEnvCutoff: number;
  kLfoFm: number;
  kLfoCutoff: number;
  kVoiceMode: number;
  kGlideSpeed: number;
  kMasterVolume: number;
};

export function getMikaParameterDescriptors() {
  const automationRate = "k-rate";
  return [
    {
      name: "trigger",
      defaultValue: 0,
      minValue: 0,
      maxValue: 1,
      automationRate: "k-rate",
    },
    {
      name: "note",
      defaultValue: 60,
      minValue: 0,
      maxValue: 127,
      automationRate: "k-rate",
    },
    ...MIKA_PARAM_DEFS.map(
      ([name, desc, defaultValue, minValue, maxValue]) => ({
        name,
        defaultValue,
        minValue,
        maxValue,
        automationRate,
      })
    ),
  ];
}

// MikaParamDefinition: [name, description, default, min, max, steps?, units?]
type MikaParamDefinition = [
  string,
  string,
  number,
  number,
  number,
  number?,
  string?
];

const MIKA_PARAM_DEFS: MikaParamDefinition[] = [
  // oscillators
  ["kOsc1Wave", "Oscillator 1 waveform", 2, 0, 7, 1],
  ["kOsc1Coarse", "Oscillator 1 coarse", 0, -24, 24, 1, "semitones"],
  ["kOsc1Fine", "Oscillator 1 fine", 0.0, -1.0, 1.0, 0.01, "semitones"],
  ["kOsc1Split", "Oscillator 1 split", 0.0, -0.025, 0.025, 0.01],
  ["kOsc2Wave", "Oscillator 2 waveform", 2, 0, 7, 1],
  ["kOsc2Coarse", "Oscillator 2 coarse", 0, -24, 24, 1, "semitones"],
  ["kOsc2Fine", "Oscillator 2 fine", 0.0, -1.0, 1.0, 0.01, "semitones"],
  ["kOsc2Split", "Oscillator 2 split", 0.0, -0.025, 0.025, 0.01],
  ["kOscMix", "Oscillator mix", 1.0, 0.0, 1.0, 0.01],

  // fm
  ["kFmMode", "FM mode", 0, 0, 3, 1],
  ["kFmCoarse", "FM coarse", 0, 0, 48],
  ["kFmFine", "FM fine", 0.0, -1.0, 1.0, 0.01],

  // filter
  ["kFilterEnabled", "Filter enabled", 1, 0, 1, 1],
  ["kFilterCutoff", "Filter cutoff", 8000.0, 20.0, 8000.0, 0.01, "hz"],
  ["kFilterResonance", "Filter resonance", 0.0, 0.0, 1.0, 0.01],
  ["kFilterKeyTrack", "Filter key tracking", 0.0, -1.0, 1.0, 0.01],

  // modulation sources
  ["kVolEnvA", "Volume envelope attack", 0.5, 0.5, 1000.0, 0.01],
  ["kVolEnvD", "Volume envelope decay", 998.0, 0.5, 1000.0, 0.01],
  ["kVolEnvS", "Volume envelope sustain", 1.0, 0.0, 1.0, 0.01],
  ["kVolEnvR", "Volume envelope release", 925.0, 0.5, 1000.0, 0.01],
  ["kVolEnvV", "Volume envelope velocity sensitivity", 0.0, 0.0, 1.0, 0.01],
  ["kModEnvA", "Modulation envelope attack", 998.0, 0.5, 1000.0, 0.01],
  ["kModEnvD", "Modulation envelope decay", 998.0, 0.5, 1000.0, 0.01],
  ["kModEnvS", "Modulation envelope sustain", 0.5, 0.0, 1.0, 0.01],
  ["kModEnvR", "Modulation envelope release", 998.0, 0.5, 1000.0, 0.01],
  ["kModEnvV", "Modulation envelope velocity sensitivity", 0.0, 0.0, 1.0, 0.01],
  ["kLfoAmount", "Vibrato amount", 0.0, -0.1, 0.1, 0.01],
  ["kLfoFrequency", "Vibrato frequency", 4.0, 0.1, 10.0, 0.01],
  ["kLfoDelay", "Vibrato delay", 0.1, 0.1, 1000.0, 0.01],

  // modulation targets
  [
    "kVolEnvFm",
    "Volume envelope to FM amount",
    0.0,
    -24.0,
    24.0,
    0.01,
    "semitones",
  ],
  [
    "kModEnvFm",
    "Modulation envelope to FM amount",
    0.0,
    -24.0,
    24.0,
    0.01,
    "semitones",
  ],
  ["kLfoFm", "Vibrato to FM amount", 0.0, -24.0, 24.0, 0.01, "semitones"],
  [
    "kVolEnvCutoff",
    "Volume envelope to filter cutoff",
    0.0,
    -8000.0,
    8000.0,
    0.01,
    "hz",
  ],
  [
    "kModEnvCutoff",
    "Modulation envelope to filter cutoff",
    0.0,
    -8000.0,
    8000.0,
    0.01,
    "hz",
  ],
  ["kLfoCutoff", "Vibrato to filter cutoff", 0.0, -8000.0, 8000.0, 0.01],

  // master
  ["kVoiceMode", "Voice mode", 0, 0, 0, 0],
  ["kGlideSpeed", "Glide speed", 1.0, 1.0, 1000.0, 0.01],
  ["kMasterVolume", "Master volume", 0.25, 0.0, 0.5, 0.01],
];
