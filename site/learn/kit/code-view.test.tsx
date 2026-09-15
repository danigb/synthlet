// @vitest-environment jsdom
import { cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import type { ReactElement } from "react";
import { afterEach, describe, expect, it } from "vitest";
import { hasPatchSource, loadPatches, loadPatchSource } from "../patches";
import { CodeView } from "./CodeView";

/*
 * The one claim "View the code" makes: this is the file.
 *
 * It is a claim about the build and not about this component. `?raw` asks
 * webpack for a module's text, and webpack applies *every* rule that matches a
 * request - so for a while the tutorial's own TypeScript rule ran first and
 * `asset/source` faithfully stringified SWC's output. The panels showed
 * compiled JavaScript, `code: { lines }` sliced a text whose line numbers were
 * nobody's, and the two bundles compiled `??` differently, which React reported
 * as a hydration mismatch. `next.config.mjs` now excludes `?raw` from those
 * rules; this file is what notices if it stops.
 *
 * The tell is a type annotation. No compiler that has run leaves `ac:
 * AudioContext` in the text, so its presence is proof that nothing has.
 *
 * Vitest sees the same imports through Vite, which has always served `?raw`
 * raw. That makes this test honest about the registry and blind to webpack, so
 * the config throws at build time if its walk guards no rule - the two halves
 * of one contract.
 *
 * The panel fetches its file when it is opened (03c), so every render below
 * opens it and waits: there is no `<pre>` in a closed panel any more, which is
 * the whole saving - sixty source texts are not on a lesson page at all.
 */

afterEach(cleanup);

/** The registry, loaded: a table of `() => import()` since 02c. */
const patches = await loadPatches();

/** The lines a panel shows above the fold, as the reader counts them. */
function head(container: HTMLElement): string[] {
  const pre = container.querySelector("pre");
  return (pre?.textContent ?? "").split("\n");
}

/**
 * Render a panel and open it, the way a reader does.
 *
 * The click is what asks for the file, so nothing here can be asserted until
 * one has landed - `waitFor` is the frame between the gesture and the text.
 */
async function open(ui: ReactElement) {
  const rendered = render(ui);
  fireEvent.click(rendered.getByText("View the code"));
  await waitFor(() =>
    expect(rendered.container.querySelector("pre")).not.toBeNull(),
  );
  return rendered;
}

describe("the source is the source", () => {
  it("keeps the types a compiler would have stripped", async () => {
    const source = await loadPatchSource("sound/harmonics");

    expect(source).toBeDefined();
    expect(source).toContain("function build(ac: AudioContext)");
    expect(source).toContain("function sawHarmonics(count: number): number[]");
  });

  it("registers a source for every patch", () => {
    const missing = Object.keys(patches).filter((id) => !hasPatchSource(id));

    expect(missing).toEqual([]);
  });

  it("slices inside the file, and to the end of it", async () => {
    const violations: string[] = [];

    for (const [id, patch] of Object.entries(patches)) {
      const range = patch.code?.lines;
      if (!range) continue;

      const [from, to] = range;
      const lines = ((await loadPatchSource(id)) ?? "")
        .replace(/\s+$/, "")
        .split("\n");

      if (from < 1 || from > lines.length)
        violations.push(
          `${id}: line ${from} is not in a ${lines.length}-line file`,
        );
      // The end is the end of the file on purpose: a range is for skipping a
      // header, never for truncating the manifest, which the panel folds rather
      // than hides. A range that stops short goes stale the next time the file
      // grows, and the fold quietly loses its last lines.
      if (to !== lines.length)
        violations.push(
          `${id}: range ends at ${to}, the file at ${lines.length}`,
        );
    }

    expect(violations).toEqual([]);
  });
});

describe("the panel", () => {
  const tone = patches["sound/tone"];

  it("has no code in it until the reader opens it", async () => {
    const { container, getByText } = render(
      <CodeView id="sound/tone" code={tone.code} />,
    );

    // The summary is there, the file is not: a closed panel has fetched
    // nothing, which is the point of 03c.
    expect(getByText("View the code")).toBeTruthy();
    expect(container.querySelector("pre")).toBeNull();

    fireEvent.click(getByText("View the code"));
    await waitFor(() => expect(container.querySelector("pre")).not.toBeNull());
  });

  it("draws no panel for a patch the registry has no source for", () => {
    const { container } = render(<CodeView id="test/every-kind" />);

    expect(container.innerHTML).toBe("");
  });

  it("opens on the slice its patch asked for", async () => {
    const { container } = await open(
      <CodeView id="sound/tone" code={tone.code} />,
    );
    const lines = head(container);

    expect(lines[0]).toBe("import {");
    // The paragraph the range skips, which is above the imports in the file.
    expect(lines.join("\n")).not.toContain("One oscillator, and the three");
    expect(lines.join("\n")).toContain("function build(ac: AudioContext)");
    // No blank line before the fold: the panel ends on the last line of `build`.
    expect(lines[lines.length - 1]).toBe("}");
    expect(lines.length).toBeLessThan(40);
  });

  it("folds the manifest behind a button", async () => {
    const { container, getByRole } = await open(
      <CodeView id="sound/tone" code={tone.code} />,
    );

    expect(head(container).join("\n")).not.toContain('id: "sound/tone"');
    expect(container.querySelectorAll("pre")).toHaveLength(1);

    fireEvent.click(getByRole("button", { name: /controls and views/ }));

    const panels = container.querySelectorAll("pre");
    expect(panels).toHaveLength(2);
    expect(panels[1].textContent).toContain("export default definePatch({");
    expect(panels[1].textContent).toContain('id: "sound/tone"');
  });

  it("shows the whole file when a patch declares no slice", async () => {
    const { container } = await open(<CodeView id="sound/harmonics" />);
    const lines = head(container);

    expect(lines[0]).toBe(
      'import { Compound, Gain, Svf, SvfType, WavetableOscillator } from "synthlet";',
    );
  });

  it("folds a manifest that names its type", async () => {
    // `definePatch<Voice>({`, which the voice and the playground both write.
    const { container } = await open(<CodeView id="voice" />);
    const shown = head(container).join("\n");

    expect(shown).toContain("function build(");
    expect(shown).not.toContain("export default definePatch");
    expect(shown).not.toContain('id: "voice"');
  });
});
