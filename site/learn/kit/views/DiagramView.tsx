"use client";

import type { Diagram, DiagramOptions } from "../../patches/define";

/**
 * Reid's block diagram, beside the widget.
 *
 * Nothing yet. The manifest shape is decided - `diagram: { nodes, edges }` on
 * the patch, `"auto"` reserved for the day `graph()` can enumerate a running
 * compound - and `sound/harmonics` already declares one, so the drawing is the
 * only part missing. That is ticket 07's, and a view that renders nothing is a
 * better placeholder than a box saying so: a lesson that asks for a diagram
 * today loses nothing but the picture.
 */
export function DiagramView(_props: {
  diagram?: Diagram;
  label?: string;
  options?: DiagramOptions;
}) {
  return null;
}
