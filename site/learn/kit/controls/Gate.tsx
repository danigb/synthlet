"use client";

import { useState } from "react";
import type { GateControl } from "../../patches/define";
import type { PatchRuntime } from "../useLessonPatch";
import { Field } from "./Field";

/** A trigger is a pulse, and this is how long it is held high. */
const TRIGGER_MS = 20;

/**
 * A key, without the keyboard.
 *
 * `hold` is a note that lasts as long as the finger does, which is the control
 * every envelope lesson needs: sustain is only audible if the reader can choose
 * when to let go. `trigger` is the pulse a percussive envelope wants, where
 * holding it down would teach the wrong thing.
 *
 * Pressing it also opens the output gain, for the same reason the keyboard
 * does: a widget whose whole interaction is "play a note" should not need two
 * gestures to make one sound.
 */
export function Gate({
  control,
  runtime,
}: {
  control: GateControl<any>;
  runtime: PatchRuntime;
}) {
  const [held, setHeld] = useState(false);
  const trigger = control.mode === "trigger";

  const down = () => {
    runtime.setPlaying(true);
    setHeld(true);
    runtime.write(control.param, 1);
    if (trigger) {
      window.setTimeout(() => {
        runtime.write(control.param, 0);
        setHeld(false);
      }, TRIGGER_MS);
    }
  };

  const up = () => {
    if (trigger || !held) return;
    setHeld(false);
    runtime.write(control.param, 0);
  };

  return (
    <Field label={control.label} help={control.help}>
      <button
        type="button"
        aria-label={control.label}
        aria-pressed={held}
        className={
          "w-full touch-none rounded-learn border border-learn-border px-3 py-2 font-learn-text text-sm " +
          (held
            ? "bg-learn-accent text-learn-bg"
            : "bg-learn-bg text-learn-ink")
        }
        onPointerDown={(event) => {
          // Without this the browser starts a selection and the pointer-up
          // never lands on the button, so the note never ends.
          event.preventDefault();
          down();
        }}
        onPointerUp={up}
        onPointerLeave={up}
        onPointerCancel={up}
        // Space and Enter, by hand. A `click` handler would have done it, but a
        // click has no release of its own, so a held key would be a fixed-length
        // note - and on a mouse it would arrive *after* the pointer pair and
        // sound a second one.
        onKeyDown={(event) => {
          if (event.key !== " " && event.key !== "Enter") return;
          event.preventDefault();
          if (!event.repeat) down();
        }}
        onKeyUp={(event) => {
          if (event.key === " " || event.key === "Enter") up();
        }}
      >
        {trigger ? "Trigger" : held ? "Holding" : "Hold"}
      </button>
    </Field>
  );
}
