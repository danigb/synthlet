"use client";

import { useEffect, useState } from "react";
import { hasPatch, loadPatch } from "../patches";
import { resolveControls, type LessonPatch } from "../patches/define";
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
 *
 * The registry it resolves against is a table of `() => import()` (02c): the id
 * is answered here and now, and the patch itself is fetched when this mounts.
 * Which means a lesson's page carries its own patch and no other - the reader
 * of lesson 1.1 was downloading every recipe, effect and drum in the tutorial
 * to hear a sawtooth - at the cost of one frame between the id and the knobs,
 * which the placeholder below is for.
 */
export function Patch({ id, show, preset }: PatchProps) {
  const [patch, setPatch] = useState<LessonPatch | undefined>();

  useEffect(() => {
    let alive = true;
    // A patch the registry does not have is the message below, not a fetch.
    if (!hasPatch(id)) {
      setPatch(undefined);
      return;
    }
    void loadPatch(id).then((loaded) => {
      // The reader navigated on while the chunk was in the air. Setting state
      // here would be setting a *different* lesson's patch on this widget.
      if (alive) setPatch(loaded);
    });
    return () => {
      alive = false;
    };
  }, [id]);

  // A missing patch is loud. The alternative - an empty space where the sound
  // was - is the failure mode the registry exists to prevent, and a reader
  // cannot tell it from a lesson that simply has no widget. `rules.test.ts`
  // turns this into a failing test before it can reach a reader at all.
  if (!hasPatch(id)) {
    return (
      <div className="my-6 rounded-learn border border-learn-border bg-learn-surface p-learn font-learn-mono text-sm text-learn-ink">
        No patch registered as <code>{id}</code>.
      </div>
    );
  }

  // The frame, while the patch is in the air. The same border, background and
  // padding the widget has, so the page does not jump when it arrives - and no
  // `data-patch`, because that attribute is how `check:sound` finds a widget it
  // can press Play on, and this one has no Play yet.
  if (!patch) {
    return (
      <figure
        data-patch-loading={id}
        aria-busy="true"
        className="my-6 max-w-learn rounded-learn border border-learn-border bg-learn-surface p-learn text-learn-ink"
      >
        <figcaption className="font-learn-text text-sm font-medium text-learn-ink-muted">
          {id}
        </figcaption>
      </figure>
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
