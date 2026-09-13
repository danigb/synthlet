"use client";

import { resolveControls, type LessonPatch } from "../patches/define";
import { getPatch } from "../patches";
import { LessonWidget } from "./LessonWidget";

export interface PatchProps {
  /** The patch's id, which is its path under `learn/patches`. */
  id: string;
  /** Which of the patch's controls this lesson reveals. All of them if absent. */
  show?: string[];
  /** A named starting sound, for patches whose `build` takes one. */
  preset?: string;
}

/**
 * The lesson's widget.
 *
 * A lesson never imports a component, so this resolves its patch from the
 * registry by id and hands the definition to the one frame every lesson shares.
 * That is the whole of the indirection, and it is what lets `show` be pedagogy
 * - which knobs this lesson reveals - while the order they sit in stays the
 * patch's and the way they look stays the kit's.
 *
 * A client component, because the widget builds audio.
 */
export function Patch({ id, show, preset }: PatchProps) {
  const patch: LessonPatch | undefined = getPatch(id);

  // A missing patch is loud. The alternative - an empty space where the sound
  // was - is the failure mode the registry exists to prevent, and a reader
  // cannot tell it from a lesson that simply has no widget. `rules.test.ts`
  // turns this into a failing test before it can reach a reader at all.
  if (!patch) {
    return (
      <div className="my-6 rounded-learn border border-learn-border bg-learn-surface p-learn font-learn-mono text-sm text-learn-ink">
        No patch registered as <code>{id}</code>.
      </div>
    );
  }

  return (
    <LessonWidget
      patch={patch}
      controls={resolveControls(patch, show)}
      preset={preset}
    />
  );
}
