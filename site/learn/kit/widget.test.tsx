// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { definePatch, resolveControls } from "../patches/define";
import { LessonWidget } from "./LessonWidget";

/*
 * What the frame promises every lesson.
 *
 * Three things, and they are the three the ticket's success criteria name:
 * every control kind renders from a manifest entry alone; a lesson's `show`
 * picks which of them appear without touching the order the patch put them in;
 * and the page arrives having built nothing at all - no `AudioContext`, no
 * graph, no sound - until the reader does something.
 *
 * The audio is mocked out at exactly one seam, `createSynthAudioContext`, which
 * is the only door the kit has onto the audio thread. That is what makes "no
 * context on load" a fact this file can state rather than a thing someone has
 * to remember to check in a browser.
 */

/** Every context the widget asked for, in the order it asked. */
const contexts: FakeContext[] = [];

type FakeContext = ReturnType<typeof fakeContext>;

function fakeContext() {
  return {
    currentTime: 0,
    destination: { kind: "destination" },
    resumed: 0,
    resume() {
      this.resumed++;
      return Promise.resolve();
    },
    createAnalyser: () => ({
      fftSize: 2048,
      getFloatTimeDomainData: () => {},
      disconnect: () => {},
    }),
  };
}

vi.mock("@/app/audio-context", () => ({
  createSynthAudioContext: () => {
    const context = fakeContext();
    contexts.push(context);
    return Promise.resolve(context as unknown as AudioContext);
  },
}));

/** A value a control can write, and a test can read back. */
const ref = (initial: number) => ({ value: initial });

function buildTestSynth() {
  const written: string[] = [];
  return {
    written,
    level: ref(0.5),
    waveform: ref(2),
    bypass: ref(0),
    x: ref(0),
    y: ref(0),
    gate: ref(0),
    notes: [] as string[],
    seeds: 0,
    // A compound *is* its output node, and the kit opens the gain it ends in.
    gain: { value: 0, setTargetAtTime: () => {} },
    connect: () => {},
    dispose: () => {
      written.push("disposed");
    },
  };
}

/**
 * One of each kind, and nothing else.
 *
 * It is a patch in every sense except that it is not registered: the point is
 * that a manifest is enough, so the kit is handed one and asked to draw it.
 */
const everyKind = definePatch({
  id: "test/every-kind",
  label: "Every kind",
  build: buildTestSynth,
  controls: [
    {
      id: "level",
      kind: "slider",
      label: "Level",
      param: (s) => s.level,
      min: 0,
      max: 1,
      default: 0.5,
    },
    {
      id: "waveform",
      kind: "select",
      label: "Waveform",
      param: (s) => s.waveform,
      options: ["sine", "triangle", "sawtooth", "square"],
      default: 2,
    },
    {
      id: "bypass",
      kind: "toggle",
      label: "Bypass",
      param: (s) => s.bypass,
      default: 0,
    },
    {
      id: "pad",
      kind: "xy",
      label: "Pad",
      x: { param: (s) => s.x, label: "Cutoff", min: 20, max: 20000 },
      y: { param: (s) => s.y, label: "Resonance", min: 0.5, max: 12 },
    },
    { id: "gate", kind: "gate", label: "Gate", param: (s) => s.gate },
    {
      id: "reseed",
      kind: "button",
      label: "Reseed",
      action: (s) => () => {
        s.seeds++;
      },
    },
    {
      id: "keys",
      kind: "keyboard",
      label: "Keys",
      noteOn: (s) => (note) => {
        s.notes.push(note);
      },
      noteOff: () => () => {},
    },
  ],
  views: [],
});

beforeEach(() => {
  contexts.length = 0;
});
afterEach(cleanup);

describe("every control kind renders from a manifest entry", () => {
  it("draws seven controls for seven entries", () => {
    const { container } = render(
      <LessonWidget patch={everyKind} controls={everyKind.controls} />,
    );

    const cells = [...container.querySelectorAll("[data-control]")];
    expect(cells.map((cell) => cell.getAttribute("data-control"))).toEqual([
      "level",
      "waveform",
      "bypass",
      "pad",
      "gate",
      "reseed",
      "keys",
    ]);
  });

  it("gives each of them the accessible role its kind means", () => {
    render(<LessonWidget patch={everyKind} controls={everyKind.controls} />);

    expect(screen.getByRole("slider", { name: "Level" })).toBeDefined();
    expect(screen.getByRole("combobox", { name: "Waveform" })).toBeDefined();
    expect(screen.getByRole("switch", { name: "Bypass" })).toBeDefined();
    expect(screen.getByRole("application", { name: /Pad/ })).toBeDefined();
    expect(screen.getByRole("button", { name: "Gate" })).toBeDefined();
    expect(screen.getByRole("button", { name: "Reseed" })).toBeDefined();
    expect(screen.getByRole("group", { name: "Keys" })).toBeDefined();
  });

  it("shows the manifest's default before anything is built", () => {
    render(<LessonWidget patch={everyKind} controls={everyKind.controls} />);

    const slider = screen.getByRole("slider", {
      name: "Level",
    }) as HTMLInputElement;
    // A `lin` control from 0 to 1 with a default of 0.5 sits at the middle of
    // its thousand positions.
    expect(Number(slider.value)).toBe(500);
    expect(slider.getAttribute("aria-valuetext")).toBe("0.500");
  });
});

describe("a lesson's show", () => {
  const wanted = ["keys", "bypass", "level"];

  it("filters in the patch's order, not the lesson's", () => {
    expect(resolveControls(everyKind, wanted).map((c) => c.id)).toEqual([
      "level",
      "bypass",
      "keys",
    ]);
  });

  it("renders them in that same order", () => {
    const { container } = render(
      <LessonWidget
        patch={everyKind}
        controls={resolveControls(everyKind, wanted)}
      />,
    );

    expect(
      [...container.querySelectorAll("[data-control]")].map((cell) =>
        cell.getAttribute("data-control"),
      ),
    ).toEqual(["level", "bypass", "keys"]);
  });
});

describe("silent arrival", () => {
  it("asks for no audio context until the reader does something", () => {
    render(<LessonWidget patch={everyKind} controls={everyKind.controls} />);
    expect(contexts).toHaveLength(0);
  });

  it("is a button with aria-pressed, and it starts unpressed", () => {
    render(<LessonWidget patch={everyKind} controls={everyKind.controls} />);
    const play = screen.getByRole("button", { name: "Play" });
    expect(play.getAttribute("aria-pressed")).toBe("false");
  });

  it("builds on Play, and only on Play", async () => {
    render(<LessonWidget patch={everyKind} controls={everyKind.controls} />);
    fireEvent.click(screen.getByRole("button", { name: "Play" }));

    expect(contexts).toHaveLength(1);
    expect(screen.getByRole("button", { name: "Stop" })).toBeDefined();
  });

  it("builds silently when a knob is touched instead", () => {
    render(<LessonWidget patch={everyKind} controls={everyKind.controls} />);
    fireEvent.change(screen.getByRole("slider", { name: "Level" }), {
      target: { value: "750" },
    });

    // A context, because a graph is needed to write into. Not playing, because
    // moving a knob is not asking for a sound.
    expect(contexts).toHaveLength(1);
    expect(
      screen.getByRole("button", { name: "Play" }).getAttribute("aria-pressed"),
    ).toBe("false");
  });
});

/**
 * The patch that declares its keys twice.
 *
 * `voice` does exactly this, on purpose: a keyboard *view*, so a lesson that
 * narrows the knobs down to one is still playable, and a keyboard *control*, so
 * a lesson can name the keys in `show` and mean "the keys are what this page is
 * about". The two used to draw two keyboards.
 */
const playedPatch = definePatch({
  id: "test/played",
  label: "Played",
  build: buildTestSynth,
  controls: [
    {
      id: "level",
      kind: "slider",
      label: "Level",
      param: (s) => s.level,
      min: 0,
      max: 1,
      default: 0.5,
    },
    {
      id: "keyboard",
      kind: "keyboard",
      label: "Keyboard",
      noteOn: (s) => (note) => {
        s.notes.push(note);
      },
      noteOff: () => () => {},
    },
  ],
  views: [
    {
      kind: "keyboard",
      label: "Keyboard",
      noteOn: (s) => (note) => {
        s.notes.push(note);
      },
      noteOff: () => () => {},
    },
  ],
});

describe("a keyboard is a view, never a control", () => {
  const keyboards = (container: HTMLElement) =>
    container.querySelectorAll('[role="group"][aria-label="Keyboard"]');

  it("draws one keyboard when the lesson names it in show", () => {
    const { container } = render(
      <LessonWidget
        patch={playedPatch}
        controls={resolveControls(playedPatch, ["keyboard"])}
      />,
    );

    expect(keyboards(container)).toHaveLength(1);
    // And it is the view's copy: the panel is empty, so `show={["keyboard"]}`
    // reads as "this widget is the keys" and draws exactly that.
    expect(container.querySelector('[data-control="keyboard"]')).toBeNull();
    expect(container.querySelector('[data-view="keyboard"]')).not.toBeNull();
  });

  it("draws one keyboard when the lesson names another control", () => {
    const { container } = render(
      <LessonWidget
        patch={playedPatch}
        controls={resolveControls(playedPatch, ["level"])}
      />,
    );

    expect(keyboards(container)).toHaveLength(1);
    expect(container.querySelector('[data-control="level"]')).not.toBeNull();
  });

  it("leaves a patch whose keys are a control alone", () => {
    // `everyKind` declares no keyboard view, so its keyboard control is the
    // only copy of the keys and stays in the panel.
    const { container } = render(
      <LessonWidget patch={everyKind} controls={everyKind.controls} />,
    );

    expect(container.querySelector('[data-control="keys"]')).not.toBeNull();
    expect(
      container.querySelectorAll('[role="group"][aria-label="Keys"]'),
    ).toHaveLength(1);
  });
});
