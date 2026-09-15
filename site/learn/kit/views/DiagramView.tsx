"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";
import type { Diagram, DiagramOptions } from "../../patches/define";
import type { PatchRuntime } from "../useLessonPatch";
import { readAutoGraph } from "./auto-graph";
import { useDiagramLinkContext } from "./diagram-link";
import {
  controlNodes,
  describeDiagram,
  describeNode,
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
 *
 * And it is reachable without a pointer. The boxes carry a roving `tabindex` -
 * one tab stop for the whole picture, arrow keys walking the chain - because a
 * five-box diagram in front of a page of knobs must not cost five stops. Focus
 * sets the same link a hover does, so the knobs light up identically, and a tap
 * does too, which is the only way a reader on a phone has of asking.
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

  // Which box holds the diagram's single tab stop, and which one has the focus
  // right now. Two things, because the stop outlives the focus: a reader who
  // tabs away and back returns to the box they left.
  const [stop, setStop] = useState(0);
  const [focused, setFocused] = useState<string | null>(null);
  // The boxes themselves, so an arrow press can move the focus without going
  // through a selector and escaping an id the patch chose.
  const boxes = useRef(new Map<string, SVGGElement>());

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

  const placed = layout.nodes;
  // Clamped: a diagram redrawn with fewer boxes must still have a reachable
  // stop, and index 0 always exists here.
  const at = Math.min(stop, placed.length - 1);

  /** Move the stop, and the focus with it. The chain wraps at both ends. */
  const moveTo = (index: number) => {
    const wrapped = (index + placed.length) % placed.length;
    setStop(wrapped);
    // Focus is what sets the link - the same handler the pointer's enter uses -
    // so moving it is the whole of what an arrow press does.
    boxes.current.get(placed[wrapped].node.id)?.focus();
  };

  const onBoxKeyDown = (event: KeyboardEvent<SVGGElement>, index: number) => {
    switch (event.key) {
      // Right and down both mean "further along the chain": the controllers
      // hang under the boxes they control, so the picture has two directions
      // and one order.
      case "ArrowRight":
      case "ArrowDown":
        event.preventDefault();
        moveTo(index + 1);
        return;
      case "ArrowLeft":
      case "ArrowUp":
        event.preventDefault();
        moveTo(index - 1);
        return;
      // Put the link down without putting the picture down: the box keeps the
      // focus, so the next arrow carries on from here.
      case "Escape":
        link.hover(null);
        return;
      default:
    }
  };

  return (
    <ViewFrame label={label ?? "Patch"}>
      <div className="overflow-x-auto">
        <svg
          // A group, not an image: `role="img"` takes everything inside it out
          // of the accessibility tree, and the boxes are in it now - each one
          // named for the knobs printed on it. The sentence the picture was is
          // still here, as this group's name.
          role="group"
          aria-label={describeDiagram(graph)}
          // Not a tab stop - the boxes carry the roving one, so a five-box
          // diagram costs a reader one stop and not five. `-1` is here so that
          // a tap on the background can take the focus off a box, which is how
          // a reader on a phone puts the picture down again.
          tabIndex={-1}
          onPointerDown={() => link.hover(null)}
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

          {placed.map((box, index) => {
            const id = box.node.id;
            // Focused counts as lit, and looks identical: focusing a box is
            // pointing at it, and a reader on the keyboard needs the outline
            // more than anyone - it is the only thing saying where they are.
            const lit = link.isNodeLinked(id) || focused === id;
            const point = () => link.hover({ kind: "node", id });
            return (
              <g
                key={id}
                ref={(element) => {
                  if (element) boxes.current.set(id, element);
                  else boxes.current.delete(id);
                }}
                data-node={id}
                // The relationship the picture draws, said out loud: "Svf,
                // Cutoff and Strip harmonics".
                role="group"
                aria-label={describeNode(box.node)}
                tabIndex={index === at ? 0 : -1}
                onPointerEnter={point}
                onPointerLeave={() => link.hover(null)}
                // A tap, for the reader who has no hover to give. Stopped here
                // so the svg's own handler - which is what a tap on the
                // background clears with - does not undo it on the way up.
                onPointerDown={(event) => {
                  event.stopPropagation();
                  setStop(index);
                  point();
                }}
                onFocus={() => {
                  setStop(index);
                  setFocused(id);
                  point();
                }}
                onBlur={() => {
                  setFocused(null);
                  link.hover(null);
                }}
                onKeyDown={(event) => onBoxKeyDown(event, index)}
                // The box's own outline is the focus indicator, and it is a
                // token; the browser's ring around an SVG group is not.
                className="focus-visible:outline-none"
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
