"use client";

import {
  resolveControls,
  unknownControls,
  type Control,
  type LessonPatch,
} from "../patches/define";
import { getPatch } from "../patches";

export interface PatchProps {
  /** The patch's id, which is its path under `learn/patches`. */
  id: string;
  /** Which of the patch's controls this lesson reveals. All of them if absent. */
  show?: string[];
  /** A named starting sound, for patches whose `build` takes one. */
  preset?: string;
}

/** A short, readable summary of a control, for the placeholder. */
function describe(control: Control): string {
  return `${control.label} (${control.kind})`;
}

/**
 * The lesson's widget.
 *
 * A lesson never imports a component, so this resolves its patch from the
 * registry by id and hands the definition on. Today "hands it on" means a box
 * that says what the widget will be; [03](thoughts/tickets/learning-synthlet/03-the-kit.md)
 * replaces the body of this component with
 * `<LessonWidget patch={patch} controls={controls} preset={preset} />` and
 * nothing else moves - not a lesson, not a patch, not this file's props.
 *
 * A client component from the first day for the same reason: the widget builds
 * audio, so the moment it is real it has to run in the browser, and finding
 * that out later would mean a content edit.
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

  const controls = resolveControls(patch, show);
  const missing = unknownControls(patch, show);

  return (
    <figure className="my-6 max-w-learn rounded-learn border border-learn-border bg-learn-surface p-learn text-learn-ink">
      <figcaption className="font-learn-text text-sm font-medium">
        {patch.label ?? patch.id}
        {preset ? (
          <span className="text-learn-ink-muted"> · preset {preset}</span>
        ) : null}
      </figcaption>

      <p className="mt-1 font-learn-mono text-xs text-learn-ink-muted">
        {patch.id}
      </p>

      <dl className="mt-learn grid gap-2 font-learn-text text-sm">
        <div>
          <dt className="text-xs uppercase tracking-wide text-learn-ink-muted">
            Controls
          </dt>
          <dd className="mt-1">
            {controls.map(describe).join(", ") || "none"}
          </dd>
        </div>
        <div>
          <dt className="text-xs uppercase tracking-wide text-learn-ink-muted">
            Views
          </dt>
          <dd className="mt-1">
            {patch.views.map((view) => view.kind).join(", ") || "none"}
          </dd>
        </div>
        {missing.length > 0 ? (
          <div>
            <dt className="text-xs uppercase tracking-wide text-learn-ink-muted">
              Not in this patch
            </dt>
            <dd className="mt-1 font-learn-mono">{missing.join(", ")}</dd>
          </div>
        ) : null}
      </dl>

      <p className="mt-learn font-learn-text text-xs text-learn-ink-muted">
        The playable widget arrives with the kit.
      </p>
    </figure>
  );
}
