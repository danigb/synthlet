// The tutorial voice's public surface. Lessons, the Playground and the patch
// that derives its controls import from here; `README.md` is the contract.

export { learnVoice, type LearnVoice } from "./learn-voice";
export {
  FILTER_TYPE_NAMES,
  INDEX_OPTIONS,
  LEARN_VOICE_GROUPS,
  learnVoiceParams,
  LFO_SHAPE_NAMES,
  WAVEFORM_NAMES,
  type LearnVoiceGroup,
  type LearnVoiceParam,
} from "./params";
export {
  galleryPresets,
  GALLERY_PRESET_NAMES,
  lessonPresets,
  LESSON_PRESET_NAMES,
  presetBanks,
  presets,
} from "./presets";
export { registerLearnVoice } from "./register";
