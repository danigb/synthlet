// @vitest-environment jsdom
import { act, cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { definePatch } from "../../patches/define";
import { LessonWidget } from "../LessonWidget";

/*
 * The diagram, in a widget, with a reader pointing at it.
 *
 * The layering and the declarations are checked in `learn/diagrams.test.ts`,
 * which needs no DOM. What needs one is the line between the picture and the
 * panel: hovering a knob has to light the box it turns, and hovering a box has
 * to light its knobs. That is two components talking through a context and it
 * is exactly the kind of wiring a screenshot cannot confirm.
 *
 * The patch is the *Attack* lesson's, which is ticket 09's and the ticket's own
 * success criterion: `PolyblepOscillator → AdsrAmp → out`, with the keyboard's
 * gate arriving at `AdsrAmp.gate`. Nothing here builds audio - the widget
 * builds nothing until a reader touches a control, and a pointer passing over
 * one is not touching it.
 */

const attackPatch = definePatch<{ gate: { value: number } }>({
  id: "test/attack",
  label: "Attack",
  build: () => ({ gate: { value: 0 } }),
  controls: [
    {
      id: "attack",
      kind: "slider",
      label: "Attack",
      param: (synth) => synth.gate,
      min: 0,
      max: 1,
    },
  ],
  views: [{ kind: "diagram" }],
  diagram: {
    nodes: [
      {
        id: "osc",
        label: "PolyblepOscillator",
        kind: "source",
        exposedAs: "osc",
      },
      {
        id: "amp",
        label: "AdsrAmp",
        kind: "modifier",
        exposedAs: "amp",
        controls: ["attack"],
      },
      { id: "out", label: "out", kind: "output" },
      { id: "keys", label: "keyboard", kind: "controller" },
    ],
    edges: [
      { from: "osc", to: "amp" },
      { from: "amp", to: "out" },
      { from: "keys", to: "amp", param: "gate" },
    ],
  },
});

/** The same widget with nothing drawn: the hover link must stay asleep. */
const plainPatch = definePatch<{ gate: { value: number } }>({
  ...attackPatch,
  id: "test/plain",
  views: [],
  diagram: undefined,
});

const widget = (patch: typeof attackPatch) =>
  render(<LessonWidget patch={patch} controls={patch.controls} />);

const box = (container: HTMLElement, id: string) =>
  container.querySelector(`[data-node="${id}"]`) as SVGGElement;
const cell = (container: HTMLElement, id: string) =>
  container.querySelector(`[data-control="${id}"]`) as HTMLElement;

/* `jest-dom`'s matchers are not installed; the attribute is the assertion. */
const outline = (container: HTMLElement, id: string) =>
  box(container, id).querySelector("rect")?.getAttribute("class") ?? "";
const linked = (container: HTMLElement, id: string) =>
  cell(container, id).getAttribute("data-diagram-linked");

afterEach(cleanup);

describe("the diagram, drawn in a widget", () => {
  it("draws a box per node and a cable per edge", () => {
    const { container } = widget(attackPatch);
    expect(container.querySelectorAll("[data-node]")).toHaveLength(4);
    expect(
      container.querySelector("svg")?.getAttribute("aria-label"),
    ).toContain("keyboard into AdsrAmp's gate");
  });

  it("draws the two kinds of cable in the two cable colours", () => {
    const { container } = widget(attackPatch);
    const svg = container.querySelector("svg") as SVGSVGElement;
    expect(svg.querySelectorAll(".stroke-learn-audio")).toHaveLength(2);
    expect(svg.querySelectorAll(".stroke-learn-control")).toHaveLength(1);
    // The port, labelled with the parameter it arrives at.
    expect(svg.textContent).toContain("gate");
  });

  it("marks the lesson's control on the box it belongs to", () => {
    const { container } = widget(attackPatch);
    expect(box(container, "amp").textContent).toContain("Attack");
    expect(box(container, "osc").textContent).not.toContain("Attack");
  });

  it("lights the box when the reader points at the knob", () => {
    const { container } = widget(attackPatch);
    expect(outline(container, "amp")).toContain("stroke-learn-border");

    fireEvent.pointerOver(cell(container, "attack"));
    expect(outline(container, "amp")).toContain("stroke-learn-accent");
    expect(outline(container, "osc")).toContain("stroke-learn-border");

    fireEvent.pointerOut(cell(container, "attack"));
    expect(outline(container, "amp")).toContain("stroke-learn-border");
  });

  it("lights the knob when the reader points at the box", () => {
    const { container } = widget(attackPatch);
    expect(linked(container, "attack")).toBeNull();

    fireEvent.pointerOver(box(container, "amp"));
    expect(linked(container, "attack")).toBe("true");

    fireEvent.pointerOut(box(container, "amp"));
    expect(linked(container, "attack")).toBeNull();
  });

  it("follows the keyboard as well as the pointer", () => {
    const { container } = widget(attackPatch);
    fireEvent.focusIn(cell(container, "attack"));
    expect(outline(container, "amp")).toContain("stroke-learn-accent");
  });

  it("stays asleep in a widget with no diagram", () => {
    const { container } = widget(plainPatch);
    expect(container.querySelector("[data-node]")).toBeNull();
    fireEvent.pointerOver(cell(container, "attack"));
    expect(linked(container, "attack")).toBeNull();
  });

  it("draws nothing for an auto diagram until the library can enumerate one", () => {
    // `graph()` is `thoughts/tickets/graph-introspection.md` and has not landed,
    // so this is the whole of the auto branch today: no picture, no error.
    const auto = definePatch({
      ...attackPatch,
      id: "test/auto",
      diagram: "auto",
    });
    const { container } = widget(auto as typeof attackPatch);
    expect(container.querySelector('[data-view="diagram"]')).not.toBeNull();
    expect(container.querySelector("svg")).toBeNull();
  });
});

/*
 * And the same picture, reached without a pointer.
 *
 * 07b: half the link was keyboard-reachable - tabbing onto a knob outlined its
 * box - and half was not, because a `<g>` in an SVG has no tab stop and a phone
 * has no hover. The boxes carry a roving tab stop now, arrow keys walk the
 * chain, and a tap does what a hover does.
 */
describe("the diagram, reached without a pointer", () => {
  const boxes = (container: HTMLElement) => [
    ...container.querySelectorAll("[data-node]"),
  ];
  const tabIndexes = (container: HTMLElement) =>
    boxes(container).map((box) => box.getAttribute("tabindex"));
  /* A real focus, not a dispatched event: the point is where the focus goes,
   * and `act` is what makes React's answer to it arrive before the assertion. */
  const focus = (element: Element) =>
    act(() => {
      (element as SVGGElement).focus();
    });

  it("is one tab stop for the whole picture", () => {
    const { container } = widget(attackPatch);
    // Four boxes, one stop: the rest are reachable by arrow, not by tab.
    expect(tabIndexes(container)).toEqual(["0", "-1", "-1", "-1"]);
  });

  it("lights the knob when the reader focuses the box", () => {
    const { container } = widget(attackPatch);
    expect(linked(container, "attack")).toBeNull();

    fireEvent.focus(box(container, "amp"));
    expect(linked(container, "attack")).toBe("true");
    expect(outline(container, "amp")).toContain("stroke-learn-accent");

    fireEvent.blur(box(container, "amp"));
    expect(linked(container, "attack")).toBeNull();
  });

  it("walks the chain with the arrow keys", () => {
    const { container } = widget(attackPatch);
    const osc = box(container, "osc");
    focus(osc);
    expect(linked(container, "attack")).toBeNull();

    // osc → amp: the box the lesson's knob is marked on, so the knob lights.
    fireEvent.keyDown(osc, { key: "ArrowRight" });
    expect(container.ownerDocument.activeElement).toBe(box(container, "amp"));
    expect(linked(container, "attack")).toBe("true");
    // And the stop moved with the focus, so tabbing away and back returns here.
    expect(tabIndexes(container)).toEqual(["-1", "0", "-1", "-1"]);

    // Back again, and the chain wraps at the ends rather than trapping.
    fireEvent.keyDown(box(container, "amp"), { key: "ArrowLeft" });
    expect(container.ownerDocument.activeElement).toBe(box(container, "osc"));
    fireEvent.keyDown(box(container, "osc"), { key: "ArrowLeft" });
    expect(container.ownerDocument.activeElement).toBe(box(container, "keys"));
  });

  it("puts the link down on Escape and keeps the focus", () => {
    const { container } = widget(attackPatch);
    const amp = box(container, "amp");
    focus(amp);
    expect(linked(container, "attack")).toBe("true");

    fireEvent.keyDown(amp, { key: "Escape" });
    expect(linked(container, "attack")).toBeNull();
    expect(container.ownerDocument.activeElement).toBe(amp);
  });

  it("lights a box on a tap, and clears it on a tap away", () => {
    const { container } = widget(attackPatch);
    fireEvent.pointerDown(box(container, "amp"));
    expect(linked(container, "attack")).toBe("true");

    // The background of the picture: the one place a tap means "never mind".
    fireEvent.pointerDown(container.querySelector("svg") as SVGSVGElement);
    expect(linked(container, "attack")).toBeNull();
  });

  it("names every box for the knobs printed on it", () => {
    const { container } = widget(attackPatch);
    expect(box(container, "amp").getAttribute("aria-label")).toBe(
      "AdsrAmp, Attack",
    );
    expect(box(container, "osc").getAttribute("aria-label")).toBe(
      "PolyblepOscillator",
    );
    // The boxes are named, so the drawing cannot be a `role="img"`: that role
    // takes everything inside it out of the accessibility tree.
    const svg = container.querySelector("svg") as SVGSVGElement;
    expect(svg.getAttribute("role")).toBe("group");
    expect(svg.getAttribute("aria-label")).toContain("Signal flow");
  });
});
