"use client";

import {
  Keyboard,
  noteName,
  type KeyboardClasses,
} from "@/components/audio/Keyboard";
import { toMidi } from "synthlet";
import type { KeyboardSource } from "../../patches/define";
import type { PatchRuntime } from "../useLessonPatch";

/** Middle of the keyboard, where a two-octave span wants to start. */
const DEFAULT_FROM = "C3";
/** Somewhere between a tap and a thump, which is what a mouse can mean. */
const VELOCITY = 100;

/**
 * The keys in the tutorial's tokens.
 *
 * A piano is black and white in every theme, so `--learn-ink` and `--learn-bg`
 * are the two - which invert together with the rest of the page - and the
 * accent is what a held key turns.
 */
const KIT_KEYS: KeyboardClasses = {
  white: "border border-learn-border bg-learn-bg text-learn-ink-muted",
  whiteHeld: "border border-learn-border bg-learn-accent text-learn-bg",
  black: "border border-learn-ink bg-learn-ink",
  blackHeld: "border border-learn-ink bg-learn-accent",
};

/**
 * Keys.
 *
 * The keys themselves are the docs examples' `Keyboard`, shared rather than
 * rewritten: pointer and computer-keyboard note tracking, held notes released
 * on unmount, no audio of its own. This is the half that knows about a patch -
 * it turns the MIDI numbers the keys speak into the scientific pitch names
 * `Instrument.start` takes, and it is where the first note starts the audio.
 *
 * That last part is the rule from the docs, kept: a page must not arrive making
 * a sound, and the gesture that makes the first one is also the gesture that
 * resumes the context. For a widget that *is* a keyboard, pressing a key is
 * that gesture, so no separate Play is needed - though the frame still has one,
 * because it is also the mute.
 */
export function KeyboardKeys({
  source,
  runtime,
  label,
}: {
  source: KeyboardSource<any>;
  runtime: PatchRuntime;
  label: string;
}) {
  const from = source.from ?? DEFAULT_FROM;

  return (
    <div className="w-full" role="group" aria-label={label}>
      <Keyboard
        baseNote={toMidi(from)}
        octaves={source.octaves ?? 2}
        classes={KIT_KEYS}
        onNoteOn={(note) => {
          // Not `ensure()`: a key is a note, and a note the reader cannot hear
          // is the bug this line exists to prevent.
          runtime.setPlaying(true);
          runtime.call((synth) =>
            source.noteOn(synth)(noteName(note), VELOCITY),
          );
        }}
        onNoteOff={(note) => {
          runtime.call((synth) => source.noteOff(synth)(noteName(note), 0));
        }}
      />
    </div>
  );
}
