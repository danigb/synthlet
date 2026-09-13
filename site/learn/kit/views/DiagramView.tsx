"use client";

import { useEffect, useMemo } from "react";
import type { Diagram, DiagramOptions } from "../../patches/define";
import type { PatchRuntime } from "../useLessonPatch";
import { readAutoGraph } from "./auto-graph";
import { useDiagramLinkContext } from "./diagram-link";
import {
  controlNodes,
  describeDiagram,
  DIAGRAM_TEXT,
  layoutDiagram,
  PORT_RADIUS,
  toGraph,
} from "./layout";
import { ViewFrame } from "./ViewFrame";

/**
 * Reid's block diagram, beside the widget.
 *
 * Every figure in Synth Secrets is this picture - the patch as boxes and
 * cables, audio in blue and control in black (Part 41) - and it is the thing
 * that makes "a lesson is a patch you can copy" visible before the reader opens
 * the code. So it is drawn the way he draws it: layered left to right, sources
 * first, the output last, controllers hanging underneath with their cables
 * running up into a named parameter port.
 *
 * The colours are the two cable tokens and nothing else, which is what makes
 * `?theme=ink` restyle it: `layout.ts` decides where everything goes and knows
 * no colour, this file decides nothing but which token each part wears.
 *
 * It draws at its natural size inside a scroll container rather than shrinking
 * to fit. A diagram that fits 400 px by scaling is a diagram nobody can read on
 * a phone, and the site's responsive rule allows exactly this exception.
 */
export function DiagramView({
  diagram,
  label,
  options,
  runtime,
}: {
  diagram?: Diagram;
  label?: string;
  options?: DiagramOptions;
  runtime: PatchRuntime;
}) {
  const link = useDiagramLinkContext();
  const { controls, setControlNodes } = link;
  const synth = runtime?.synth ?? null;

  const graph = useMemo(() => {
    if (!diagram) return undefined;
    // `"auto"` needs a built compound to ask, and needs a library that can
    // answer. Until both, nothing - which is the same as this view's yesterday.
    if (diagram === "auto") return readAutoGraph(synth, controls);
    return toGraph(diagram, controls);
  }, [diagram, synth, controls]);

  // The other half of the hover link: the panel cannot know which box a control
  // is marked on, because that is a fact about the diagram.
  useEffect(() => {
    setControlNodes(graph ? controlNodes(graph) : new Map());
    return () => setControlNodes(new Map());
  }, [graph, setControlNodes]);

  const layout = useMemo(
    () =>
      graph ? layoutDiagram(graph, { compact: options?.compact }) : undefined,
    [graph, options?.compact],
  );

  if (!graph || !layout || layout.nodes.length === 0) return null;

  return (
    <ViewFrame label={label ?? "Patch"}>
      <div className="overflow-x-auto">
        <svg
          role="img"
          aria-label={describeDiagram(graph)}
          width={layout.width}
          height={layout.height}
          viewBox={`0 0 ${layout.width} ${layout.height}`}
          // `max-w-none` because a prose stylesheet three levels up sets
          // `max-width: 100%` on everything it can reach, and a diagram that
          // obeyed it would be squeezed instead of scrolled.
          className="block max-w-none"
        >
          {layout.edges.map((edge) => {
            const audio = edge.kind === "audio";
            const cable = audio ? "stroke-learn-audio" : "stroke-learn-control";
            const head = audio ? "fill-learn-audio" : "fill-learn-control";
            return (
              <g key={edge.id}>
                <path
                  d={edge.path}
                  className={`fill-none ${cable}`}
                  strokeWidth={1.5}
                />
                <path d={edge.arrow} className={head} />
                {edge.port ? (
                  <circle
                    cx={edge.port.x}
                    cy={edge.port.y}
                    r={PORT_RADIUS}
                    className={head}
                  />
                ) : null}
                {edge.port?.label && edge.param ? (
                  <text
                    x={edge.port.label.x}
                    y={edge.port.label.y}
                    fontSize={DIAGRAM_TEXT.port}
                    className="fill-learn-control font-learn-mono"
                  >
                    {edge.param}
                  </text>
                ) : null}
              </g>
            );
          })}

          {layout.nodes.map((box) => {
            const lit = link.isNodeLinked(box.node.id);
            return (
              <g
                key={box.node.id}
                data-node={box.node.id}
                onPointerEnter={() =>
                  link.hover({ kind: "node", id: box.node.id })
                }
                onPointerLeave={() => link.hover(null)}
              >
                <rect
                  x={box.x}
                  y={box.y}
                  width={box.width}
                  height={box.height}
                  // The radius is a token, so the default theme's boxes are
                  // rounded and ink's are square - the box style changing with
                  // the cable colours, and the layout not moving.
                  className={`fill-learn-bg [rx:var(--learn-radius)] ${
                    lit ? "stroke-learn-accent" : "stroke-learn-border"
                  }`}
                  strokeWidth={lit ? 2 : 1}
                />
                <text
                  x={box.centerX}
                  y={box.labelY}
                  textAnchor="middle"
                  fontSize={DIAGRAM_TEXT.label}
                  className="fill-learn-ink font-learn-mono"
                >
                  {box.node.label}
                </text>
                {box.controls ? (
                  // The lesson's own controls, named as the panel names them:
                  // the diagram and the knobs under it share their words.
                  <text
                    x={box.centerX}
                    y={box.controls.y}
                    textAnchor="middle"
                    fontSize={DIAGRAM_TEXT.controls}
                    className="fill-learn-ink-muted font-learn-text"
                  >
                    {box.controls.text}
                  </text>
                ) : null}
              </g>
            );
          })}
        </svg>
      </div>
    </ViewFrame>
  );
}
