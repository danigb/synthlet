// The instrument tier: a voice definition in, a playable instrument out.
//
// What is exported today is the decision-making half - which voice plays a
// note, and which note a monophonic instrument sounds - because it is pure,
// it is the only real algorithm in the package, and a native poly worklet
// would run exactly the same file on the audio thread. The pool of voice
// graphs and the `Instrument` surface are built on top of it.
export {
  createNoteStack,
  createVoiceAllocator,
  NotePriority,
  StealMode,
} from "./_voices";
export type {
  Allocation,
  NoteEntry,
  NoteStack,
  VoiceAllocator,
  VoiceAllocatorOptions,
} from "./_voices";
